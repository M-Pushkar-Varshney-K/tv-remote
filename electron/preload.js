// preload.js
const { contextBridge, ipcRenderer } = require('electron');

// Safe util: ensure cb is a function
const asFn = (fn) => (typeof fn === 'function' ? fn : null);

// Convert payload into a renderer-friendly format:
// - If payload.dataUrl -> pass through
// - If payload.bytes   -> convert to Blob URL (object URL)
function projectFramePayload(payload) {
  if (payload && typeof payload.dataUrl === 'string') {
    return { type: 'dataUrl', value: payload.dataUrl };
  }
  if (payload && payload.bytes) {
    try {
      const arr = payload.bytes instanceof Uint8Array ? payload.bytes : new Uint8Array(payload.bytes);
      const blob = new Blob([arr], { type: 'image/jpeg' });
      const url = URL.createObjectURL(blob);
      return { type: 'objectUrl', value: url };
    } catch (e) {
      console.error('[preload] Failed to build Blob URL from bytes:', e);
    }
  }
  return { type: 'unknown', value: payload };
}

// Subscribe helpers with precise unsubscribe
function on(channel, handler) {
  ipcRenderer.on(channel, handler);
  return () => {
    try { ipcRenderer.removeListener(channel, handler); } catch {}
  };
}

const bridge = {
  // Connect to target host/IP
  connect: (ip) => ipcRenderer.invoke('connect', ip),

  // Send a command (returns {ok, error?})
  sendCmd: (line) => ipcRenderer.invoke('cmd:send', line),

  // Subscribe to frames
  // cb receives: { type: 'dataUrl' | 'objectUrl' | 'unknown', value: string | any }
  // If type === 'objectUrl', your renderer should revoke it later: URL.revokeObjectURL(value)
  onFrame: (cb) => {
    const fn = asFn(cb);
    if (!fn) return () => {};
    const listener = (_e, payload) => {
      try { fn(projectFramePayload(payload)); }
      catch (err) { console.error('[preload] onFrame handler error:', err); }
    };
    return on('image-frame', listener);
  },

  // Subscribe to connection status (payload: { image?, cmd?, reason? })
  onStatus: (cb) => {
    const fn = asFn(cb);
    if (!fn) return () => {};
    const listener = (_e, payload) => {
      try { fn(payload); } catch (err) { console.error('[preload] onStatus handler error:', err); }
    };
    return on('conn-status', listener);
  },

  // Subscribe to command replies (payload: { line })
  onCmdReply: (cb) => {
    const fn = asFn(cb);
    if (!fn) return () => {};
    const listener = (_e, payload) => {
      try { fn(payload?.line); } catch (err) { console.error('[preload] onCmdReply handler error:', err); }
    };
    return on('cmd-reply', listener);
  },
};

// Expose both for compatibility with your renderer
contextBridge.exposeInMainWorld('api', {
  connect: bridge.connect,
  runCommand: bridge.sendCmd,  // alias
  onFrame: bridge.onFrame,
  onStatus: bridge.onStatus,
  onCmdReply: bridge.onCmdReply,
  sendCmd: bridge.sendCmd,     // keep both names
});

contextBridge.exposeInMainWorld('tv', bridge);