const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  openFile: () => ipcRenderer.invoke('open-file'),
  saveData: (data) => ipcRenderer.invoke('save-data', data),
  readJsonFile: (path) => ipcRenderer.invoke('read-json-file', path)
})
