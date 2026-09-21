const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  listContent:    () => ipcRenderer.invoke('list-content'),
  loadVocabulary: (slug) => ipcRenderer.invoke('load-vocabulary', slug),
  loadReading:    (slug) => ipcRenderer.invoke('load-reading', slug),
  saveVocabulary: (data) => ipcRenderer.invoke('save-vocabulary', data),
  saveProgress:   (data) => ipcRenderer.invoke('save-progress', data)
})
