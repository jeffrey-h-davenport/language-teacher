const { app, BrowserWindow, ipcMain, nativeImage } = require('electron')
const path = require('path')
const fs = require('fs')

let mainWindow
let currentSlug = null
let currentMode = null // 'vocabulary' | 'reading'

// Content (vocabulary, reading passages, script guides) is read straight
// from the shipped language-data/ folder, so every install/update brings
// the latest words. Learners can't change content — only their progress,
// which must NOT live in the bundle (reinstalling replaces the whole bundle)
// and instead lives in the OS's per-user app-data directory.
const BUNDLED_DATA_DIR = path.join(__dirname, '..', 'language-data')
const USER_DATA_DIR    = path.join(app.getPath('userData'), 'language-data')

// Editor mode is for the content creator: `npm run edit` from the repo.
// It turns on word editing, which writes straight into language-data/ in
// the repo (under git). Never available in a packaged build.
const EDITOR_MODE = !app.isPackaged && process.env.LT_EDITOR === '1'

// App-wide user settings (not tied to any one language) — lives directly in
// userData, outside both the bundle and the per-language data folder.
const PREFERENCES_PATH = path.join(app.getPath('userData'), 'preferences.json')

const LANGUAGE_INFO = {
  chinese: { language: 'Chinese', languageCode: 'zh' },
  czech:   { language: 'Czech',   languageCode: 'cs' },
  danish:  { language: 'Danish',  languageCode: 'da' },
  dutch:   { language: 'Dutch',   languageCode: 'nl' },
  finnish: { language: 'Finnish', languageCode: 'fi' },
  french:  { language: 'French',  languageCode: 'fr' },
  german:  { language: 'German',  languageCode: 'de' },
  hebrew: { language: 'Hebrew', languageCode: 'he' },
  hindi:   { language: 'Hindi',   languageCode: 'hi' },
  hungarian: { language: 'Hungarian', languageCode: 'hu' },
  indonesian: { language: 'Indonesian', languageCode: 'id' },
  italian: { language: 'Italian', languageCode: 'it' },
  japanese: { language: 'Japanese', languageCode: 'ja' },
  korean:  { language: 'Korean',  languageCode: 'ko' },
  norwegian: { language: 'Norwegian', languageCode: 'no' },
  polish:  { language: 'Polish',  languageCode: 'pl' },
  portuguese: { language: 'Portuguese', languageCode: 'pt' },
  romanian: { language: 'Romanian', languageCode: 'ro' },
  russian: { language: 'Russian', languageCode: 'ru' },
  serbocroatian: { language: 'Serbo-Croatian', languageCode: 'sh' },
  spanish: { language: 'Spanish', languageCode: 'es' },
  swahili: { language: 'Swahili', languageCode: 'sw' },
  swedish: { language: 'Swedish', languageCode: 'sv' },
  turkish: { language: 'Turkish', languageCode: 'tr' },
  ukrainian: { language: 'Ukrainian', languageCode: 'uk' },
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1) }

function vocabularyPath(slug) { return path.join(BUNDLED_DATA_DIR, `${slug}-vocabulary.json`) }
function progressPath(slug)   { return path.join(USER_DATA_DIR, `${slug}-progress.json`) }
function readingPath(slug)    { return path.join(BUNDLED_DATA_DIR, `${slug}-reading.json`) }
function scriptPath(slug)     { return path.join(BUNDLED_DATA_DIR, `${slug}-script.json`) }

// Carry forward any progress file found sitting next to the bundle (the old
// storage location) that hasn't already been migrated — covers upgrading
// from a build that stored everything inside the app bundle.
function ensureUserDataSeeded() {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true })
  retireUserVocabularyCopies()
  const bundledFiles = fs.readdirSync(BUNDLED_DATA_DIR)
  for (const f of bundledFiles) {
    if (!/^[a-z]+-progress\.json$/.test(f)) continue
    const dest = path.join(USER_DATA_DIR, f)
    if (!fs.existsSync(dest)) {
      fs.copyFileSync(path.join(BUNDLED_DATA_DIR, f), dest)
    }
  }
}

// Builds before 1.14.0 kept a personal, editable copy of each vocabulary
// file in USER_DATA_DIR (plus a sync/ folder for merging shipped updates
// into it). Vocabulary is now read from the bundle only, so those copies
// are moved into retired/ — never deleted. Any word in a copy that differs
// from the shipped file is also written to <slug>-unshipped-edits.json
// there, so an edit that never made it into the repo can be recovered.
function retireUserVocabularyCopies() {
  const retiredDir = path.join(USER_DATA_DIR, 'retired')
  const stamp      = new Date().toISOString().replace(/[:.]/g, '-')
  const retire = name => {
    fs.mkdirSync(retiredDir, { recursive: true })
    const dest = path.join(retiredDir, fs.existsSync(path.join(retiredDir, name)) ? `${stamp}-${name}` : name)
    fs.renameSync(path.join(USER_DATA_DIR, name), dest)
    return dest
  }

  for (const f of fs.readdirSync(USER_DATA_DIR)) {
    const m = f.match(/^([a-z]+)-vocabulary\.json$/)
    if (!m) continue
    try {
      const user    = readJson(path.join(USER_DATA_DIR, f))
      const shipped = readJsonIfExists(path.join(BUNDLED_DATA_DIR, f)) || { words: [] }
      const shippedById = new Map(shipped.words.map(w => [w.id, JSON.stringify(w)]))
      const unshipped = (user.words || []).filter(w => shippedById.get(w.id) !== JSON.stringify(w))
      retire(f)
      if (unshipped.length > 0) {
        const name = `${m[1]}-unshipped-edits.json`
        const dest = path.join(retiredDir, fs.existsSync(path.join(retiredDir, name)) ? `${stamp}-${name}` : name)
        fs.writeFileSync(dest, JSON.stringify({ words: unshipped }, null, 2), 'utf-8')
        console.warn(`${f}: ${unshipped.length} edited word(s) not in the shipped file, saved to ${dest}`)
      }
    } catch (e) {
      // Leave the copy where it is and try again next launch.
      console.warn(`Could not retire ${f}:`, e.message)
    }
  }
  if (fs.existsSync(path.join(USER_DATA_DIR, 'sync'))) {
    try { retire('sync') } catch (e) { console.warn('Could not retire sync/:', e.message) }
  }
}

// Script guide files are optional — only languages with a non-Latin script
// (Hindi today, more to come) have one. Missing file is not an error.
function readJsonIfExists(filePath) {
  try {
    return readJson(filePath)
  } catch (e) {
    if (e.code === 'ENOENT') return null
    throw e
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 860,
    height: 700,
    minWidth: 680,
    minHeight: 560,
    icon: path.join(__dirname, '..', 'assets', 'icon.icns'),
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

app.whenReady().then(() => {
  // In dev mode the Dock icon otherwise falls back to Electron's default —
  // once packaged, assets/icon.icns is used automatically instead. Never let
  // a cosmetic icon failure block the app from actually starting.
  if (process.platform === 'darwin' && app.dock) {
    try {
      // nativeImage can't parse this app's .icns for a runtime dock.setIcon
      // call (it loads fine as the packaged bundle's Info.plist icon, which
      // macOS reads natively — this is specifically an Electron/dev-mode
      // limitation), so use the PNG export instead.
      const icon = nativeImage.createFromPath(path.join(__dirname, '..', 'assets', 'icon.png'))
      if (!icon.isEmpty()) app.dock.setIcon(icon)
      else console.warn('Dock icon image failed to load (empty image)')
    } catch (e) {
      console.warn('Could not set Dock icon:', e.message)
    }
  }
  ensureUserDataSeeded()
  createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

ipcMain.handle('quit-app', () => {
  app.quit()
})

ipcMain.handle('get-app-version', () => app.getVersion())
ipcMain.handle('get-editor-mode', () => EDITOR_MODE)

ipcMain.handle('get-changelog', () => {
  try {
    return fs.readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf-8')
  } catch (e) {
    return null
  }
})

ipcMain.handle('get-preferences', () => {
  try {
    return readJson(PREFERENCES_PATH)
  } catch (e) {
    return {}
  }
})

ipcMain.handle('save-preferences', (_event, data) => {
  try {
    fs.writeFileSync(PREFERENCES_PATH, JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (e) {
    return { error: `Could not save preferences: ${e.message}` }
  }
})

ipcMain.handle('list-content', async () => {
  const files = fs.readdirSync(BUNDLED_DATA_DIR)
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
    const script = readJsonIfExists(scriptPath(slug))
    currentSlug = slug
    currentMode = 'vocabulary'
    return { vocab, progress, script }
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
  if (!EDITOR_MODE) return { error: 'Vocabulary can only be edited in editor mode' }
  if (!currentSlug || currentMode !== 'vocabulary') return { error: 'No vocabulary file is open' }
  try {
    fs.writeFileSync(vocabularyPath(currentSlug), JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (e) {
    return { error: `Could not save vocabulary: ${e.message}` }
  }
})

ipcMain.handle('save-progress', async (_event, data) => {
  if (EDITOR_MODE) return { error: 'Progress is never changed in editor mode' }
  if (!currentSlug || currentMode !== 'vocabulary') return { error: 'No vocabulary file is open' }
  try {
    fs.writeFileSync(progressPath(currentSlug), JSON.stringify(data, null, 2), 'utf-8')
    return { success: true }
  } catch (e) {
    return { error: `Could not save progress: ${e.message}` }
  }
})
