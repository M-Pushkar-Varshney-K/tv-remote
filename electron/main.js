const { app, BrowserWindow, ipcMain } = require("electron")
const path = require("path")
const net = require("net")

let mainWindow

let imgSocket = null
let cmdSocket = null

let buffer = Buffer.alloc(0)

const isDev = !app.isPackaged

function createWindow() {
  mainWindow = new BrowserWindow({
    icon: path.join(__dirname, "../icons/icons/win/icon.ico"),
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  })

  if (isDev) {
    mainWindow.loadURL("http://localhost:3000")
  } else {
    mainWindow.loadFile(path.join(__dirname, "../out/index.html"))
  }
}

app.whenReady().then(createWindow)

ipcMain.handle("connect", async (_, ip) => {
  if (!ip) return { ok: false, error: "IP required" }

  try {

    // IMAGE SOCKET
    imgSocket = new net.Socket()

    imgSocket.connect(8080, ip, () => {
      console.log("Image socket connected")
    })

    imgSocket.on("data", (chunk) => {

      buffer = Buffer.concat([buffer, chunk])

      while (buffer.length > 4) {

        const size = buffer.readUInt32BE(0)

        if (buffer.length < size + 4) return

        const jpg = buffer.slice(4, 4 + size)

        buffer = buffer.slice(size + 4)

        mainWindow.webContents.send("frame", jpg)
      }
    })

    imgSocket.on("close", () => {
      console.log("Image socket closed")
    })

    imgSocket.on("error", (err) => {
      console.log("Image socket error:", err)
    })

    // COMMAND SOCKET
    cmdSocket = new net.Socket()

    cmdSocket.connect(9990, ip, () => {
      console.log("Command socket connected")
    })

    cmdSocket.on("error", (err) => {
      console.log("Command socket error:", err)
    })

    return { ok: true }

  } catch (err) {
    return { ok: false, error: err.message }
  }
})

ipcMain.handle("run-command", async (_, cmd) => {

  if (!cmdSocket) {
    return { ok: false, error: "Not connected" }
  }

  cmdSocket.write(cmd + "\n")

  return { ok: true }
})

app.on("window-all-closed", () => {

  if (imgSocket) imgSocket.destroy()
  if (cmdSocket) cmdSocket.destroy()

  app.quit()
})