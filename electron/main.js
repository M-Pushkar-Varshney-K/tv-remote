// electron/main.js
// ---------------------------------------------------------------

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const net = require('net');
const http = require('http');
const { fork } = require('child_process');
const fs = require('fs');

// -------------------- Config --------------------
const IMAGE_PORT = 8080;
const CMD_PORT   = 9990;

// Max JPEG frame size we accept (to avoid memory DoS)
const MAX_FRAME_BYTES = 10 * 1024 * 1024; // 10 MB

// Socket timeouts / keepalive
const SOCKET_CONNECT_TIMEOUT_MS = 8000;   // initial connect timeout
const SOCKET_IDLE_TIMEOUT_MS    = 30000;  // idle (no data) timeout

// Exponential backoff: 0.5s, 1s, 2s, ... capped at 5s
function backoff(attempt) {
  return Math.min(5000, 500 * Math.pow(2, attempt));
}

// -------------------- Globals --------------------
const isDev = !app.isPackaged;

let mainWindow = null;
let targetHost = null;

// Image stream socket state
let imgSocket = null;
let imgBuf = Buffer.alloc(0);
let imgExpectedLen = null;
let imgReconnectAttempts = 0;
let imgReconnectTimer = null;

// Command socket state
let cmdSocket = null;
let cmdReconnectAttempts = 0;
let cmdReconnectTimer = null;

// Next.js server (production) state
let nextProc = null;
let nextUrl = null;

// Place near the other helpers
function getAppRoot() {
  // In dev: project root; in prod: ...\resources\app
  try {
    return app.getAppPath();
  } catch {
    // Fallback; should not happen in normal runs
    return path.dirname(__dirname);
  }
}
// -------------------- Helpers --------------------
function sendToRenderer(channel, payload) {
  const win = mainWindow;
  if (win && !win.isDestroyed()) {
    try { win.webContents.send(channel, payload); } catch {}
  }
}

function clearImgTimers() {
  if (imgReconnectTimer) clearTimeout(imgReconnectTimer);
  imgReconnectTimer = null;
}
function clearCmdTimers() {
  if (cmdReconnectTimer) clearTimeout(cmdReconnectTimer);
  cmdReconnectTimer = null;
}

function destroyImageSocket(reason) {
  try {
    if (imgSocket) {
      imgSocket.removeAllListeners?.();
      imgSocket.destroy();
    }
  } catch {}
  imgSocket = null;
  imgBuf = Buffer.alloc(0);
  imgExpectedLen = null;
  sendToRenderer('conn-status', { image: 'disconnected', reason });
}

function destroyCmdSocket(reason) {
  try {
    if (cmdSocket) {
      cmdSocket.removeAllListeners?.();
      cmdSocket.destroy();
    }
  } catch {}
  cmdSocket = null;
  sendToRenderer('conn-status', { cmd: 'disconnected', reason });
}

function resolvePreloadPath() {
  // Preload is inside the "electron" folder packaged into resources/app
  return path.join(__dirname, 'preload.js');
}

// ----- Prod-only: start Next standalone server & return URL -----
async function getFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

async function waitUntilHttpAlive(url, timeoutMs = 10000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await new Promise((res, rej) => {
        const req = http.get(url, (resp) => {
          // Any HTTP response means server is up
          resp.resume(); // drain
          res();
        });
        req.on('error', rej);
        req.setTimeout(1500, () => { req.destroy(new Error('http-timeout')); });
      });
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  return false;
}

async function startNextInProd() {
  if (isDev) return null;

  const path = require("path");
  const fs = require("fs");

  let standaloneDir;

  // Correct path resolution
  if (app.isPackaged) {
    standaloneDir = path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      ".next",
      "standalone"
    );
  } else {
    standaloneDir = path.join(app.getAppPath(), ".next", "standalone");
  }

  const serverJs = path.join(standaloneDir, "server.js");

  // ----- Sanity checks -----
  if (!fs.existsSync(standaloneDir)) {
    throw new Error(`Missing standalone directory: ${standaloneDir}`);
  }

  if (!fs.existsSync(serverJs)) {
    throw new Error(`Missing server.js: ${serverJs}`);
  }

  const port = await getFreePort();
  const url = `http://127.0.0.1:${port}`;

  console.log("Starting Next server from:", serverJs);
  console.log("Working directory:", standaloneDir);

  nextProc = fork(serverJs, [], {
    cwd: standaloneDir,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1",
      NEXT_TELEMETRY_DISABLED: "1"
    },
    stdio: "pipe",
    detached: false
  });

  nextProc.stdout?.on("data", (d) =>
    console.log("[Next:stdout]", d.toString().trim())
  );

  nextProc.stderr?.on("data", (d) =>
    console.error("[Next:stderr]", d.toString().trim())
  );

  nextProc.on("exit", (code, signal) => {
    console.error("[Next] server exited", { code, signal });
  });

  const ok = await waitUntilHttpAlive(url, 20000);

  if (!ok) {
    throw new Error(`Next server did not start at ${url} within 20s`);
  }

  nextUrl = url;
  return url;
}

function stopNextInProd() {
  if (nextProc) {
    try { nextProc.removeAllListeners?.(); } catch {}
    try { nextProc.kill(); } catch {}
  }
  nextProc = null;
  nextUrl = null;
}

// -------------------- Image Stream --------------------
function connectImageStream(host) {
  clearImgTimers();
  destroyImageSocket('reconnect');

  imgSocket = new net.Socket();
  imgSocket.setNoDelay(true);
  imgSocket.setKeepAlive(true, 30000);

  // Connect timeout
  const connectTimer = setTimeout(() => {
    try { imgSocket.destroy(new Error('connect-timeout')); } catch {}
  }, SOCKET_CONNECT_TIMEOUT_MS);

  imgSocket.on('connect', () => {
    clearTimeout(connectTimer);
    imgReconnectAttempts = 0;
    imgBuf = Buffer.alloc(0);
    imgExpectedLen = null;
    sendToRenderer('conn-status', { image: 'connected' });
  });

  // Idle timeout (no data)
  imgSocket.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => {
    imgSocket.destroy(new Error('idle-timeout'));
  });

  imgSocket.on('data', (chunk) => {
    // Parse [len(4 bytes BE)] + [JPEG bytes]
    imgBuf = Buffer.concat([imgBuf, chunk]);

    while (true) {
      if (imgExpectedLen === null) {
        if (imgBuf.length < 4) break;
        imgExpectedLen = imgBuf.readUInt32BE(0);
        imgBuf = imgBuf.subarray(4);

        // Frame sanity-check
        if (imgExpectedLen <= 0 || imgExpectedLen > MAX_FRAME_BYTES) {
          imgSocket.destroy(new Error(`bad-frame-len:${imgExpectedLen}`));
          return;
        }
      }

      if (imgBuf.length < imgExpectedLen) break;

      const frame = imgBuf.subarray(0, imgExpectedLen);
      imgBuf = imgBuf.subarray(imgExpectedLen);
      imgExpectedLen = null;

      // Send raw JPEG bytes (Buffer) to renderer — NO Base64
      sendToRenderer('image-frame', { bytes: frame });
    }
  });

  const onCloseOrError = (why) => {
    clearTimeout(connectTimer);
    destroyImageSocket(why);
    imgReconnectAttempts++;
    const delay = backoff(imgReconnectAttempts);
    clearImgTimers();
    if (targetHost === host) {
      imgReconnectTimer = setTimeout(() => connectImageStream(host), delay);
    }
  };

  imgSocket.on('close', () => onCloseOrError('close'));
  imgSocket.on('error', (err) => onCloseOrError(err?.message || 'error'));

  imgSocket.connect({ host, port: IMAGE_PORT });
}

// -------------------- Command Channel --------------------
function connectCmdChannel(host) {
  clearCmdTimers();
  destroyCmdSocket('reconnect');

  cmdSocket = new net.Socket();
  cmdSocket.setNoDelay(true);
  cmdSocket.setKeepAlive(true, 30000);

  const connectTimer = setTimeout(() => {
    try { cmdSocket.destroy(new Error('connect-timeout')); } catch {}
  }, SOCKET_CONNECT_TIMEOUT_MS);

  cmdSocket.on('connect', () => {
    clearTimeout(connectTimer);
    cmdReconnectAttempts = 0;
    sendToRenderer('conn-status', { cmd: 'connected' });
  });

  cmdSocket.setTimeout(SOCKET_IDLE_TIMEOUT_MS, () => {
    cmdSocket.destroy(new Error('idle-timeout'));
  });

  let rxBuf = Buffer.alloc(0);

  cmdSocket.on('data', (chunk) => {
    // Line-based responses: "OK\n", "ERR\n", ...
    rxBuf = Buffer.concat([rxBuf, chunk]);
    let idx;
    while ((idx = rxBuf.indexOf(0x0A)) !== -1) { // '\n'
      const line = rxBuf.subarray(0, idx).toString('utf8');
      rxBuf = rxBuf.subarray(idx + 1);
      sendToRenderer('cmd-reply', { line });
    }
  });

  const onCloseOrError = (why) => {
    clearTimeout(connectTimer);
    destroyCmdSocket(why);
    cmdReconnectAttempts++;
    const delay = backoff(cmdReconnectAttempts);
    clearCmdTimers();
    if (targetHost === host) {
      cmdReconnectTimer = setTimeout(() => connectCmdChannel(host), delay);
    }
  };

  cmdSocket.on('close', () => onCloseOrError('close'));
  cmdSocket.on('error', (err) => onCloseOrError(err?.message || 'error'));

  cmdSocket.connect({ host, port: CMD_PORT });
}

// Connect both channels to a target host
async function connectToHost(host) {
  console.log("Connecting to host:", host);
  targetHost = host;
  connectImageStream(host);
  connectCmdChannel(host);

  // Wait up to 2 seconds to see if at least one channel connects
  const deadline = Date.now() + 2000;
  while (Date.now() < deadline) {
    const imageOk = imgSocket && !imgSocket.destroyed && imgReconnectAttempts === 0;
    const cmdOk   = cmdSocket && !cmdSocket.destroyed && cmdReconnectAttempts === 0;
    if (imageOk || cmdOk) {
      return { ok: true };
    }
    await new Promise(r => setTimeout(r, 100));
  }
  // Keep auto-reconnect running; report error now
  return { ok: false, error: `Could not quickly connect to ${host} (image:${IMAGE_PORT}, cmd:${CMD_PORT})` };
}

// -------------------- IPC --------------------
ipcMain.handle('connect', async (_evt, ip) => {
  try {
    const host = String(ip || '').trim();
    if (!host) return { ok: false, error: 'Empty IP' };
    return await connectToHost(host);
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

ipcMain.handle('cmd:send', async (_evt, text) => {
  // Strict: send exactly what user typed
  const line = (text ?? '').toString();
  if (!line || line === '\n' || line === '\r\n') return { ok: false, error: 'empty' };
  if (!cmdSocket || cmdSocket.destroyed) return { ok: false, error: 'not connected' };

  try {
    const payload = line.endsWith('\n') ? line : (line + '\n');

    console.log('[CMD] send:', JSON.stringify(line));

    const ok = cmdSocket.write(payload, 'utf8');
    if (!ok) {
      await new Promise((resolve) => cmdSocket.once('drain', resolve));
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
});

// -------------------- Window / App --------------------
function createWindow(startUrl) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    icon: path.join(__dirname, "../icons/icons/win/icon.ico"),
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: resolvePreloadPath(),
      webviewTag: false,
      devTools: true, // enable devtools only in dev
    },
  });

  // Security: block external navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const allow =
      url.startsWith('file://') ||
      url.startsWith('http://localhost') ||
      url.startsWith('http://127.0.0.1');
    if (!allow) event.preventDefault();
  });

  // Security: block window.open except safe targets
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (
      (isDev && url.startsWith('http://localhost')) ||
      url.startsWith('http://127.0.0.1')
    ) {
      return { action: 'allow' };
    }
    return { action: 'deny' };
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
  } else {
    mainWindow.loadURL(startUrl).catch(err => console.error('loadURL failed:', err));
  }

  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('closed', () => { mainWindow = null; });
}

// Single-instance lock
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, _argv, _cwd) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

app.whenReady().then(async () => {
  app.setAppUserModelId('com.pushkar.tvapp');

  let urlForWindow = 'http://localhost:3000';
  if (!isDev) {
    try {
      urlForWindow = await startNextInProd();
    } catch (err) {
      console.error('Failed to start Next server:', err);
      // Show full error in the window:
      const msg = encodeURIComponent(String(err && err.stack || err));
      urlForWindow = `data:text/html,<pre style="font-family:monospace;white-space:pre-wrap">${msg}</pre>`;
    }
  }

  createWindow(urlForWindow);
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(urlForWindow);
  });
});
}

// Graceful shutdown
function cleanupAndQuit() {
  try { clearImgTimers(); } catch {}
  try { clearCmdTimers(); } catch {}
  try { destroyImageSocket('quit'); } catch {}
  try { destroyCmdSocket('quit'); } catch {}
  try { stopNextInProd(); } catch {}
  if (process.platform !== 'darwin') app.quit();
}

app.on('before-quit', cleanupAndQuit);
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') cleanupAndQuit();
});

// Global error handlers
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// resmon