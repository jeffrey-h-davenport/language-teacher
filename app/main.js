const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow
let currentSlug = null
let currentMode = null // 'vocabulary' | 'reading'

const LANGUAGE_DATA_DIR = path.join(__dirname, '..', 'language-data')

const LANGUAGE_INFO = {
  czech:   { language: 'Czech',   languageCode: 'cs' },
  finnish: { language: 'Finnish', languageCode: 'fi' },
  french:  { language: 'French',  languageCode: 'fr' },
  german:  { language: 'German',  languageCode: 'de' },
  spanish: { language: 'Spanish', languageCode: 'es' },
  swedish: { language: 'Swedish', languageCode: 'sv' },
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

function vocabularyPath(slug) { return path.join(LANGUAGE_DATA_DIR, `${slug}-vocabulary.json`) }
function progressPath(slug)   { return path.join(LANGUAGE_DATA_DIR, `${slug}-progress.json`) }
function readingPath(slug)    { return path.join(LANGUAGE_DATA_DIR, `${slug}-reading.json`) }

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

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

ipcMain.handle('list-content', async () => {
  const files = fs.readdirSync(LANGUAGE_DATA_DIR)
  const slugs = new Set()
  for (const f of files) {
    const m = f.match(/^([a-z]+)-(vocabulary|reading)\.json$/)
    if (m) slugs.add(m[1])
  }
  return [...slugs].map(slug => {
    const info = LANGUAGE_INFO[slug] || { language: capitalize(slug), languageCode: '' }
    return {
      slug,
      language:      info.language,
      languageCode:  info.languageCode,
      hasVocabulary: files.includes(`${slug}-vocabulary.json`),
      hasReading:    files.includes(`${slug}-reading.json`),
    }
  }).sort((a, b) => a.language.localeCompare(b.language))
})

ipcMain.handle('load-vocabulary', async (_event, slug) => {
  try {
    const vocab = readJson(vocabularyPath(slug))
    let progress = { progress: {} }
    try {
      progress = readJson(progressPath(slug))
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    currentSlug = slug
    currentMode = 'vocabulary'
    return { vocab, progress }
  } catch (e) {
    return { error: `Could not load ${slug}: ${e.message}` }
  }
})

ipcMain.handle('load-reading', async (_event, slug) => {
  try {
    const reading = readJson(readingPath(slug))
    let vocab = { words: [] }
    try {
      vocab = readJson(vocabularyPath(slug))
    } catch (e) {
      if (e.code !== 'ENOENT') throw e
    }
    currentSlug = slug
    currentMode = 'reading'
    return { reading, vocabWords: vocab.words || [], vocabMeta: vocab.meta || {} }
  } catch (e) {
    return { error: `Could not load ${slug}: ${e.message}` }
  }
})

ipcMain.handle('save-vocabulary', async (_event, data) => {
  if (!currentSlug || currentMode !== 'vocabulary') return { error: 'No vocabulary file is open' }
  try {
    fs.writeFileSync(vocabularyPath(currentSlug), JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (e) {
    return { error: `Could not save vocabulary: ${e.message}` }
  }
})

ipcMain.handle('save-progress', async (_event, data) => {
  if (!currentSlug || currentMode !== 'vocabulary') return { error: 'No vocabulary file is open' }
  try {
    fs.writeFileSync(progressPath(currentSlug), JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (e) {
    return { error: `Could not save progress: ${e.message}` }
  }
})
