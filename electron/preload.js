const { contextBridge, ipcRenderer } = require("electron")

contextBridge.exposeInMainWorld("api", {
  connect: (ip) => ipcRenderer.invoke("connect", ip),
  runCommand: (cmd) => ipcRenderer.invoke("run-command", cmd),
  onFrame: (callback) =>
    ipcRenderer.on("frame", (_, data) => callback(data)),
})