const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let mainWindow;
let runProc = null;
let frameProc = null;
let streaming = false;

const isDev = !app.isPackaged;

const PLINK = isDev
  ? path.join(__dirname, "../bin/plink.exe")
  : path.join(process.resourcesPath, "bin/plink.exe");

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000");
  } else {
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"));
  }
}

app.whenReady().then(createWindow);

function createSSH(ip) {
  return spawn(
    PLINK,
    [
      "-ssh",
      "-P",
      "22",
      "-batch",
      "-no-antispoof",
      "-T",
      `root@${ip}`,
      "sh",
      "-s",
    ],
    {
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    }
  );
}

ipcMain.handle("connect", async (_, ip) => {
  if (!ip) return { ok: false, error: "IP required" };

  try {
    runProc = createSSH(ip);
    frameProc = createSSH(ip);

    runProc.stdin.write("echo connected\n");
    frameProc.stdin.write("echo connected\n");

    startStreaming();

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle("run-command", async (_, cmd) => {
  if (!runProc) return { ok: false, error: "Not connected" };

  runProc.stdin.write(`${cmd}\n`);
  return { ok: true };
});

function startStreaming() {
  if (!frameProc || streaming) return;

  streaming = true;

  let buffer = Buffer.alloc(0);
  const END = Buffer.from([0xff, 0xd9]); // JPEG end marker

  frameProc.stdout.on("data", (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    let idx;
    while ((idx = buffer.indexOf(END)) !== -1) {
      const jpg = buffer.slice(0, idx + 2);
      buffer = buffer.slice(idx + 2);

      mainWindow.webContents.send("frame", jpg);
    }
  });

  function loop() {
    if (!frameProc) return;

    // 🔴 REPLACE WITH YOUR REAL CAPTURE COMMAND
    const captureCmd = "your_capture_command_here";

    frameProc.stdin.write(
      `${captureCmd} && cat /var/screencapture.jpg\n`
    );

    setTimeout(loop, 33); // ~30 FPS
  }

  loop();
}

app.on("window-all-closed", () => {
  if (runProc) runProc.kill();
  if (frameProc) frameProc.kill();
  app.quit();
});