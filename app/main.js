const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow
let currentFilePath = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 700,
    minWidth: 680,
    minHeight: 560,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    backgroundColor: '#f5f5f7',
    show: false
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer/index.html'))
  mainWindow.once('ready-to-show', () => mainWindow.show())
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.handle('open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    defaultPath: path.join(__dirname, '..', 'language-data'),
    properties: ['openFile'],
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    message: 'Select your language file'
  })

  if (result.canceled || result.filePaths.length === 0) return null

  currentFilePath = result.filePaths[0]
  try {
    const raw = fs.readFileSync(currentFilePath, 'utf-8')
    return { path: currentFilePath, data: JSON.parse(raw) }
  } catch (e) {
    return { error: `Could not read file: ${e.message}` }
  }
})

ipcMain.handle('read-json-file', async (_event, filePath) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    return { data: JSON.parse(raw) }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('save-data', async (_event, data) => {
  if (!currentFilePath) return { error: 'No file is open' }
  try {
    fs.writeFileSync(currentFilePath, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (e) {
    return { error: `Could not save file: ${e.message}` }
  }
})
