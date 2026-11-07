const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  quitApp:         () => ipcRenderer.invoke('quit-app'),
  getAppVersion:   () => ipcRenderer.invoke('get-app-version'),
  getEditorMode:   () => ipcRenderer.invoke('get-editor-mode'),
  getChangelog:    () => ipcRenderer.invoke('get-changelog'),
  getPreferences:  () => ipcRenderer.invoke('get-preferences'),
  savePreferences: (data) => ipcRenderer.invoke('save-preferences', data),
  listContent:     () => ipcRenderer.invoke('list-content'),
  loadVocabulary:  (slug) => ipcRenderer.invoke('load-vocabulary', slug),
  loadReading:     (slug) => ipcRenderer.invoke('load-reading', slug),
  saveVocabulary:  (data) => ipcRenderer.invoke('save-vocabulary', data),
  saveProgress:    (data) => ipcRenderer.invoke('save-progress', data)
})
