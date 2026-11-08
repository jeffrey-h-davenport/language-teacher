'use strict'

// ── Constants ───────────────────────────────────────
function learnedThreshold() { return currentMeta?.learnedThreshold ?? 10 }
const CHOICES_COUNT     = 6

// ── Color Schemes ─────────────────────────────────────
// A scheme is just these 9 values — every hover tint, focus ring, and
// selected-row color elsewhere in the app is computed from --accent/--bg/
// --surface via color-mix() in styles.css, so adding a new scheme never
// touches CSS: add an entry here and it shows up in Preferences and works
// everywhere, automatically. Every scheme must set every key (even ones
// equal to the default) — applyColorScheme() only writes the keys a scheme
// lists, so a key missing from one scheme would leak the previous scheme's
// value in on switch.
//
// The 6 non-default schemes are adapted from well-known editor/terminal
// color schemes, which are designed to sit on a *dark* background — their
// signature accent colors (Nord's frost cyan, Dracula's purple, etc.) are
// usually too light to read as white-on-accent or as text on this app's
// light surface (several measured under 2.5:1 contrast with white). Each
// one below uses a darker member of the same palette instead — either an
// official "light mode" flavor some of these themes ship (Catppuccin
// Latte, Rosé Pine Dawn) or a manually darkened variant where no such
// flavor exists — chosen to clear at least 4:1 contrast against white.
const COLOR_SCHEMES = [
  {
    id: 'ocean-blue',
    name: 'Ocean Blue',
    tokens: {
      '--accent':       '#0071e3',
      '--accent-hover': '#0077ed',
      '--on-accent':    '#ffffff',
      '--bg':           '#f5f5f7',
      '--surface':      '#ffffff',
      '--surface-2':    '#f0f0f2',
      '--welcome-1':    '#1a1a2e',
      '--welcome-2':    '#16213e',
      '--welcome-3':    '#0f3460',
    },
  },
  {
    id: 'nordic-frost',
    name: 'Nordic Frost',
    tokens: {
      '--accent':       '#5e81ac', // Nord's own darker "frost" blue (nord10), not the lighter nord8 cyan
      '--accent-hover': '#6f91bc',
      '--on-accent':    '#ffffff',
      '--bg':           '#f2f4f6',
      '--surface':      '#ffffff',
      '--surface-2':    '#e7ecef',
      '--welcome-1':    '#2e3440',
      '--welcome-2':    '#3b4252',
      '--welcome-3':    '#434c5e',
    },
  },
  {
    id: 'dracula',
    name: 'Dracula',
    tokens: {
      '--accent':       '#7c4deb', // Dracula's purple, manually darkened — no official light variant
      '--accent-hover': '#9468f0',
      '--on-accent':    '#ffffff',
      '--bg':           '#f6f4fb',
      '--surface':      '#ffffff',
      '--surface-2':    '#ece7f7',
      '--welcome-1':    '#282a36',
      '--welcome-2':    '#21222c',
      '--welcome-3':    '#1a1b23',
    },
  },
  {
    id: 'mocha-mauve',
    name: 'Mocha Mauve',
    tokens: {
      '--accent':       '#8839ef', // Catppuccin's own Latte (light-mode) mauve, not Mocha's lighter one
      '--accent-hover': '#9b55f2',
      '--on-accent':    '#ffffff',
      '--bg':           '#f5f3fb',
      '--surface':      '#ffffff',
      '--surface-2':    '#eae6f7',
      '--welcome-1':    '#1e1e2e',
      '--welcome-2':    '#181825',
      '--welcome-3':    '#11111b',
    },
  },
  {
    id: 'retro-gruvbox',
    name: 'Retro Gruvbox',
    tokens: {
      '--accent':       '#af3a03', // Gruvbox's own "faded orange" — darker than the iconic bright orange, reads better
      '--accent-hover': '#c2470c',
      '--on-accent':    '#ffffff',
      '--bg':           '#f8f3e8',
      '--surface':      '#fffdf7',
      '--surface-2':    '#f0e6d2',
      '--welcome-1':    '#282828',
      '--welcome-2':    '#32302f',
      '--welcome-3':    '#3c3836',
    },
  },
  {
    id: 'tokyo-night',
    name: 'Tokyo Night',
    tokens: {
      '--accent':       '#3760bf', // Tokyo Night's blue, darkened toward its "Day" light variant
      '--accent-hover': '#4a72d6',
      '--on-accent':    '#ffffff',
      '--bg':           '#f1f4fc',
      '--surface':      '#ffffff',
      '--surface-2':    '#e4e9f8',
      '--welcome-1':    '#1a1b26',
      '--welcome-2':    '#1f2335',
      '--welcome-3':    '#24283b',
    },
  },
  {
    id: 'rose-pine',
    name: 'Rosé Pine',
    tokens: {
      '--accent':       '#b4637a', // Rosé Pine Dawn's (light-mode) "love" — its "rose" was still too light even in Dawn
      '--accent-hover': '#c17689',
      '--on-accent':    '#ffffff',
      '--bg':           '#f8f2f1',
      '--surface':      '#fffdfc',
      '--surface-2':    '#f0e1df',
      '--welcome-1':    '#191724',
      '--welcome-2':    '#1f1d2e',
      '--welcome-3':    '#26233a',
    },
  },
]
const DEFAULT_COLOR_SCHEME = COLOR_SCHEMES[0].id

function applyColorScheme(id) {
  const scheme = COLOR_SCHEMES.find(s => s.id === id) || COLOR_SCHEMES[0]
  for (const [prop, value] of Object.entries(scheme.tokens)) {
    document.documentElement.style.setProperty(prop, value)
  }
}

// ── State ────────────────────────────────────────────
let allWords       = []
let sessionWords   = []
let questionIndex  = 0
let currentQ       = null   // { word, showNative, choices }
let currentMeta    = null   // { language, languageCode, nativeLanguage, targetField }
let currentScript  = null   // { scriptName, intro, sections: [{heading, items: [{char, ipa, note}]}] } or null
let sessionScore   = 0
let sessionCorrect = 0
let sessionTotal   = 0
let sessionResults = []
let introWords     = []   // this session's brand-new words, introduced before the quiz
let introIndex     = 0
let autoAdvanceTimer  = null
let editReturnScreen   = 'quiz-screen'
let searchReturnScreen = 'welcome-screen'
let savedQuizQ         = null
let lastDuplicatePair  = null   // { sourceId, newId } — positions dup below source after render
let searchResultsFull  = []     // full filtered+sorted result set
let editorMode           = false
let preferences          = {}   // { favoriteLanguages: [slug, ...] } — persisted across launches
let allLanguageEntries   = []   // cached window.api.listContent() result
let languagePickerShowAll = false // transient — resets each time the welcome screen loads
let searchPage         = 0      // current page index (0-based)
const SEARCH_PAGE_SIZE = 200
let openKebabRowId     = null   // id of the row whose action menu is currently open, or null
let selectedWordIds    = new Set() // ids checked for mass-edit; persists across pages/filters within a browse visit
let searchPageIds      = []     // ids of the rows on the currently-rendered page (for the header "select all" checkbox)

// Attributes the user can toggle on/off in the Browse Words table via the
// Columns picker. 'target'/'english'/'pos'/'cefr'/'score' are shown by
// default, matching the table's original fixed layout; the rest are opt-in.
// learnerOnly columns show progress, so they're left out in editor mode.
const AVAILABLE_COLUMNS = [
  { id: 'target',       label: 'Word',          default: true,  render: w => escHtml(formatTarget(w)) },
  { id: 'english',      label: 'English',       default: true,  render: w => escHtml(w.english || '') },
  { id: 'pos',          label: 'Part of Speech', default: true, render: w => `<span class="pos-badge">${escHtml((w['part-of-speech'] || '').slice(0, 8))}</span>` },
  { id: 'cefr',         label: 'CEFR Level',    default: true,  render: w => `<span class="cefr-badge cefr-${escHtml(w.cefr || '')}">${escHtml(w.cefr || '—')}</span>` },
  { id: 'score',        label: 'Score',         default: true,  learnerOnly: true, render: w => escHtml(w.learned ? '✓ Learned' : (w.score > 0 ? `${w.score} / ${learnedThreshold()}` : '—')) },
  { id: 'gender',       label: 'Gender',        default: false, render: w => escHtml(w.gender || '—') },
  { id: 'register',     label: 'Register',      default: false, render: w => escHtml((w.register && w.register.length ? w.register : ['All']).join(', ')) },
  { id: 'ipa',          label: 'IPA',           default: false, render: w => escHtml(formatPronunciation(w) || '—') },
  { id: 'grammar',      label: 'Grammar',       default: false, render: w => escHtml(w.grammar || '—') },
  { id: 'context',      label: 'Context',       default: false, render: w => escHtml(w.context || '—') },
  { id: 'plural',       label: 'Plural',        default: false, render: w => escHtml(w.plural || '—') },
  { id: 'countability', label: 'Countability',  default: false, render: w => escHtml(w.countability || 'countable') },
]
let searchVisibleColumns = new Set(AVAILABLE_COLUMNS.filter(c => c.default).map(c => c.id))
const browseColumns = () => AVAILABLE_COLUMNS.filter(c => !(editorMode && c.learnerOnly))

// ── Reading Comprehension State ───────────────────────
let readingPassages    = []
let readingMeta        = null
let readingSession     = []   // passages selected for this session
let readingPassageIdx  = 0
let readingQuestionIdx = 0
let readingResults     = []   // [{passage, answers: [chosenIdx, …]}]
let rdAutoAdvTimer     = null
let readingSelectedLevel = null   // cefr level chosen in the lobby, or null (no levels / all)
const READING_SESSION_SIZE = 10
let readingHoverIndex = null      // Map<lowercased surface form, {english, isBase}> for word-hover hints
const BASE_POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'conjunction', 'interjection'])

// ── Language Data ─────────────────────────────────────
const FLAGS = {
  'af': '🇿🇦', 'ar': '🇸🇦', 'cs': '🇨🇿', 'da': '🇩🇰',
  'de': '🇩🇪', 'el': '🇬🇷', 'es': '🇪🇸', 'fi': '🇫🇮',
  'fr': '🇫🇷', 'he': '🇮🇱', 'hi': '🇮🇳', 'hr': '🇭🇷',
  'hu': '🇭🇺', 'id': '🇮🇩', 'it': '🇮🇹', 'ja': '🇯🇵',
  'ko': '🇰🇷', 'nl': '🇳🇱', 'no': '🇳🇴', 'pl': '🇵🇱',
  'pt': '🇵🇹', 'pt-br': '🇧🇷', 'ro': '🇷🇴', 'ru': '🇷🇺',
  'sk': '🇸🇰', 'sv': '🇸🇪', 'th': '🇹🇭', 'tr': '🇹🇷',
  'uk': '🇺🇦', 'vi': '🇻🇳', 'zh': '🇨🇳', 'zh-tw': '🇹🇼',
}

// French vowel-initial words that trigger elision (le/la → l')
const ELISION_STARTERS = new Set('aeiouàâéèêëîïôùûüœ')

// Definite articles by language code and grammatical gender
const ARTICLES = {
  'de': { masculine: 'der', feminine: 'die', neuter: 'das', plural: 'die' },
  'fr': { masculine: 'le',  feminine: 'la',  plural: 'les' },
  'es': { masculine: 'el',  feminine: 'la',  plural: 'los', pluralFeminine: 'las' },
  'it': { masculine: 'il',  feminine: 'la',  plural: 'i',   pluralFeminine: 'le'  },
  'pt': { masculine: 'o',   feminine: 'a',   plural: 'os',  pluralFeminine: 'as'  },
  'nl': { masculine: 'de',  feminine: 'de',  common: 'de', neuter: 'het', plural: 'de' },
  'sv': { common: 'en',     neuter: 'ett' },
}

// Register (formality level) choices by language code, highest to lowest.
// 'All' is universal and always prepended — it's the default, and selecting
// it clears any specific selections (and vice versa).
const REGISTER_OPTIONS = {
  'de': ['gehoben', 'normalsprachlich', 'umgangssprachlich', 'salopp', 'derb'],
  'fr': ['soutenu', 'courant', 'familier', 'populaire'],
  'es': ['culto', 'estándar', 'coloquial', 'jerga', 'vulgar'],
  'cs': ['spisovná', 'hovorová', 'obecná'],
  'fi': ['kirjakieli', 'yleiskieli', 'puhekieli'],
  'sv': ['myndighetssvenska', 'standardtext', 'vardagligt tal'],
}

// ── Helpers ──────────────────────────────────────────
function $(id) { return document.getElementById(id) }

// Some IPA diacritics (e.g. the combining mark for Korean's tense/fortis
// consonants) are correct but tiny at UI sizes — small enough that two
// otherwise-distinct choices (like ㅂ "/p/" vs ㅃ "/p͈/") can look identical.
// Rather than swap in a bigger but less accurate symbol, render each
// base-letter-plus-combining-mark cluster a bit larger so the mark is
// actually visible, leaving the underlying text (and transcription)
// untouched.
const COMBINING_MARK = /\p{Mn}/u
function setEmphasizedText(el, text) {
  el.textContent = ''
  let i = 0
  while (i < text.length) {
    let cluster = text[i]
    let j = i + 1
    while (j < text.length && COMBINING_MARK.test(text[j])) {
      cluster += text[j]
      j++
    }
    if (cluster.length > 1) {
      const mark = document.createElement('span')
      mark.className = 'ipa-mark-cluster'
      mark.textContent = cluster
      el.appendChild(mark)
    } else {
      el.appendChild(document.createTextNode(cluster))
    }
    i = j
  }
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function flagFor(code) {
  if (!code) return '🌍'
  return FLAGS[code.toLowerCase()] || '🌍'
}

function targetFieldName() {
  return currentMeta?.targetField || 'german'
}

// Tone lives separately from ipa (word.tone: one small integer per syllable,
// 0 = neutral, 1-4 = the four tones) so ipa stays a plain, language-agnostic
// pronunciation string everywhere else in the app. Dense contexts (the
// Browse table) get this plain-text digit form instead of the full glyph
// below — legible at a glance in a data table without SVG clutter.
const TONE_DIGIT = { 0: '', 1: '¹', 2: '²', 3: '³', 4: '⁴' }
function formatPronunciation(word) {
  if (!word.ipa) return ''
  if (!word.tone || !word.tone.length) return word.ipa
  return word.ipa + word.tone.map(t => TONE_DIGIT[t] || '').join('')
}

// ── Tone glyphs (Mandarin) ──────────────────────────
// A contour sparkline over each syllable's own ipa chunk, colored per tone —
// the character conveys meaning, not sound, so the glyph rides with the
// pronunciation text (word.ipaSyllables), not with the character itself.
const TONE_GLYPH = {
  1: { color: '#3B7DD8', d: 'M4,9 L26,9' },
  2: { color: '#2FA66B', d: 'M4,16 L26,4' },
  3: { color: '#8B5CF6', d: 'M4,8 C11,19 19,19 26,4' },
  4: { color: '#E24C4C', d: 'M4,4 L26,18' },
}
const SVG_NS = 'http://www.w3.org/2000/svg'

function toneSvg(tone) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 30 20')
  svg.setAttribute('width', '20')
  svg.setAttribute('height', '13')
  const glyph = TONE_GLYPH[tone]
  if (!glyph) {
    const circle = document.createElementNS(SVG_NS, 'circle')
    circle.setAttribute('cx', '15')
    circle.setAttribute('cy', '12')
    circle.setAttribute('r', '2.5')
    circle.setAttribute('fill', '#B0B0B6')
    svg.appendChild(circle)
    return svg
  }
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('d', glyph.d)
  path.setAttribute('stroke', glyph.color)
  path.setAttribute('stroke-width', '3')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke-linecap', 'round')
  svg.appendChild(path)
  return svg
}

// Builds the "[ ni² xau̯³ ]"-style bracket as real DOM (needed for the SVG
// glyphs — a CSS ::after/attr() tooltip can only hold plain text). Returns
// null for any word without per-syllable tone data, so callers fall back
// to plain ipa text — every language except Chinese, unchanged.
function buildToneBracket(word) {
  if (!word.ipaSyllables || !word.tone || word.ipaSyllables.length !== word.tone.length) return null
  const wrap = document.createElement('span')
  wrap.className = 'tone-bracket'
  wrap.appendChild(document.createTextNode('['))
  word.ipaSyllables.forEach((syllable, i) => {
    const group = document.createElement('span')
    group.className = 'tone-syllable'
    group.appendChild(toneSvg(word.tone[i]))
    group.appendChild(document.createTextNode(syllable))
    wrap.appendChild(group)
  })
  wrap.appendChild(document.createTextNode(']'))
  return wrap
}

// Fills `container` with a word's pronunciation — the tone-glyph bracket
// when available (Chinese), otherwise plain ipa text (unchanged behavior
// for every other language).
function renderPronunciationInto(container, word) {
  container.innerHTML = ''
  if (!word.ipa) return
  const bracket = buildToneBracket(word)
  container.appendChild(bracket || document.createTextNode(word.ipa))
}

function articleFor(word) {
  if (word.article) return word.article
  if (word['part-of-speech'] !== 'noun') return ''
  const code = currentMeta?.languageCode?.toLowerCase() || 'de'
  const map  = ARTICLES[code] || {}
  if (word.countability === 'plural-only') {
    if (word.gender === 'feminine' && map.pluralFeminine) return map.pluralFeminine
    return map.plural ?? ''
  }
  if (!word.gender) return ''

  // French elision: le/la → l' before vowel-initial words or h muet
  if (code === 'fr') {
    const tf    = targetFieldName()
    const first = (word[tf] || '')[0]?.toLowerCase() || ''
    if (ELISION_STARTERS.has(first) || (first === 'h' && word.hMuet)) return "l'"
  }

  return map[word.gender] ?? ''
}

function formatTarget(word) {
  const article = articleFor(word)
  const text    = word.countability === 'plural-only'
    ? (word.plural || word[targetFieldName()] || '')
    : (word[targetFieldName()] ?? '')
  if (!article) return text
  // l' already contains the apostrophe — no separating space
  return article.endsWith("'") ? `${article}${text}` : `${article} ${text}`
}

function ensureDefaults(word) {
  if (word.score           === undefined) word.score           = 0
  if (word.learned         === undefined) word.learned         = false
  if (word.totalAttempts   === undefined) word.totalAttempts   = 0
  if (word.correctAttempts === undefined) word.correctAttempts = 0
  if (word.lastSeen        === undefined) word.lastSeen        = null
  return word
}

const PROGRESS_FIELDS = ['score', 'learned', 'totalAttempts', 'correctAttempts', 'lastSeen']

function stripProgress(word) {
  const content = {}
  for (const key in word) {
    if (!PROGRESS_FIELDS.includes(key)) content[key] = word[key]
  }
  return content
}

// Vocabulary content and learning progress live in separate files on disk
// (joined by word id) so routine study doesn't churn the content file. Call
// whichever of these matches what actually changed — most actions touch
// only one side.
// Content edits only exist in editor mode (see EDITOR_MODE in main.js);
// learners' changes are progress only.
function persistVocabulary() {
  if (!currentMeta || !editorMode) return
  window.api.saveVocabulary({ meta: currentMeta, words: allWords.map(stripProgress) })
}

// The editor only changes content — learning progress is the learner's alone.
function persistProgress() {
  if (!currentMeta || editorMode) return
  const progress = {}
  for (const w of allWords) {
    if (w.score > 0 || w.learned || w.totalAttempts > 0 || w.lastSeen) {
      progress[w.id] = {
        score:           w.score,
        learned:         w.learned,
        totalAttempts:   w.totalAttempts,
        correctAttempts: w.correctAttempts,
        lastSeen:        w.lastSeen,
      }
    }
  }
  window.api.saveProgress({ meta: { languageCode: currentMeta.languageCode }, progress })
}

// ── Welcome Screen ────────────────────────────────────
function updateWelcomeScreen() {
  const flag = flagFor(currentMeta?.languageCode)
  const lang = currentMeta?.language
  $('welcome-flag').textContent     = flag
  $('welcome-subtitle').textContent = lang
    ? `Learn ${lang}`
    : 'Learn a language'
  $('browse-btn-welcome').style.display = allWords.length > 0 ? '' : 'none'
}

// ── Screen Navigation ─────────────────────────────────
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  $(id).classList.add('active')
}

// ── CEFR Level Helpers ────────────────────────────────
const CEFR_ORDER = ['A0', 'A1', 'A2', 'B1', 'B2', 'C1', 'C2']

// Words per quiz session, by level — lower levels (denser/less familiar
// material) get smaller sessions, higher levels get larger ones. Overridable
// per level in Preferences (preferences.sessionSizeByLevel); this is just
// the fallback when a level has no override.
const DEFAULT_SESSION_SIZE_BY_LEVEL = { A0: 6, A1: 7, A2: 8, B1: 9, B2: 10, C1: 11, C2: 12 }

function sessionSizeForLevel(level) {
  const custom = preferences.sessionSizeByLevel?.[level]
  if (Number.isInteger(custom) && custom > 0) return custom
  return DEFAULT_SESSION_SIZE_BY_LEVEL[level] ?? 10
}

function currentCefrLevel() {
  for (const level of CEFR_ORDER) {
    if (allWords.some(w => !w.learned && w.cefr === level)) return level
  }
  return null
}

// ── Session Selection ─────────────────────────────────
// Czech noun, pronoun, and adjective declensions carry a `baseId` linking
// them back to their base (nominative singular) word. Before a declined form
// is freshly introduced:
//   1) its base word must already be learned (no non-nominatives before nominatives)
//   2) if it's a plural case, the matching singular case must already be
//      learned too (no plural forms before their corresponding singular forms)
//   3) if it's a gendered form (adjectives, and gender-declining pronouns like
//      "ten"/"můj"), the masculine form of the same case/number must already
//      be learned too (masculine before feminine or neuter)
// A candidate that fails any rule is swapped for the specific prerequisite
// form it's missing — never for an unrelated word. Resolution recurses since
// satisfying rule 3 can surface a form that itself still needs rule 2 (or
// vice versa) before it's a valid next step.
const GATED_DECLENSION_TYPES = ['noun-declension', 'pronoun-declension', 'adjective-declension']

function resolveDeclensionGate(word) {
  if (!GATED_DECLENSION_TYPES.includes(word['part-of-speech']) || !word.baseId) return word
  const base = allWords.find(w => w.id === word.baseId)
  if (!base) return word

  if (!base.learned) return base

  const grammar = word.grammar || ''

  const genderMatch = grammar.match(/^(masc|fem|neut)\.,\s*(.+)$/)
  if (genderMatch && genderMatch[1] !== 'masc') {
    const mascGrammar = `masc., ${genderMatch[2]}`
    const mascCounterpart = allWords.find(w => w.baseId === word.baseId && w.grammar === mascGrammar)
    if (mascCounterpart && !mascCounterpart.learned) return resolveDeclensionGate(mascCounterpart)
  }

  if (grammar.endsWith(' pl') && grammar !== 'nominative pl') {
    const sgGrammar = grammar.slice(0, -3) + ' sg'
    const sgCounterpart = allWords.find(w => w.baseId === word.baseId && w.grammar === sgGrammar)
    if (sgCounterpart && !sgCounterpart.learned) return resolveDeclensionGate(sgCounterpart)
  }

  return word
}

// Groups words by their optional `tier` field (ascending), each bucket
// shuffled independently. Words with no tier all land in one bucket, so this
// is a no-op for every language/level that doesn't use tiering — only A0
// content (currently Hindi script basics) splits into more than one bucket.
function groupByTier(words) {
  const buckets = new Map()
  for (const w of words) {
    const t = w.tier ?? Infinity
    if (!buckets.has(t)) buckets.set(t, [])
    buckets.get(t).push(w)
  }
  return [...buckets.keys()].sort((a, b) => a - b).map(t => shuffle(buckets.get(t)))
}

function pickSessionWords() {
  const sessionSize = sessionSizeForLevel(currentCefrLevel())

  const inProgress = shuffle(allWords.filter(w => w.score > 0 && !w.learned))
  const learned    = shuffle(allWords.filter(w => w.learned))

  // Expand CEFR levels one at a time until the fresh pool is large enough —
  // and within a level, expand tiers one at a time the same way, so e.g.
  // Hindi's single-letter basics surface before contrast pairs.
  let freshPool = []
  levels:
  for (const level of CEFR_ORDER) {
    const lvWords = allWords.filter(w => w.score === 0 && !w.learned && w.cefr === level)
    for (const tierBucket of groupByTier(lvWords)) {
      freshPool = [...freshPool, ...tierBucket]
      if (freshPool.length >= sessionSize) break levels
    }
  }
  // Words with no cefr field fall in last
  const uncategorized = shuffle(allWords.filter(w => w.score === 0 && !w.learned && !w.cefr))
  freshPool = [...freshPool, ...uncategorized]
  freshPool = freshPool.map(resolveDeclensionGate)

  // Category order (in-progress, then fresh, then learned) only decides
  // which words get *included* when there are more candidates than room in
  // the session — it must not also decide *presentation* order, or the
  // first slot would always be filled from whichever category sorts first
  // (in-progress words have priority, so with a small in-progress pool the
  // same handful of words would keep opening every session). Shuffle the
  // final selection so question order is independent of category.
  const combined = [...inProgress, ...freshPool, ...learned]
  const seen = new Set()
  const deduped = []
  for (const w of combined) {
    if (!seen.has(w.id)) {
      seen.add(w.id)
      deduped.push(w)
    }
  }
  return shuffle(deduped.slice(0, sessionSize))
}

// ── Question Generation ───────────────────────────────
function makeQuestion(word) {
  const showNative = Math.random() < 0.5
  const label = w => showNative ? formatTarget(w) : w.english

  const samePOS = allWords.filter(
    w => w['part-of-speech'] === word['part-of-speech'] && w.id !== word.id
  )
  const pool = samePOS.length >= CHOICES_COUNT - 1
    ? samePOS
    : allWords.filter(w => w.id !== word.id)

  const seen = new Set([label(word)])
  const distractors = []
  for (const w of shuffle(pool)) {
    if (distractors.length >= CHOICES_COUNT - 1) break
    const lbl = label(w)
    if (!seen.has(lbl)) {
      seen.add(lbl)
      distractors.push(w)
    }
  }

  if (distractors.length < CHOICES_COUNT - 1) {
    for (const w of shuffle(allWords.filter(w => w.id !== word.id))) {
      if (distractors.length >= CHOICES_COUNT - 1) break
      const lbl = label(w)
      if (!seen.has(lbl)) {
        seen.add(lbl)
        distractors.push(w)
      }
    }
  }

  return { word, showNative, choices: shuffle([word, ...distractors]) }
}

// ── Display a Question ────────────────────────────────
function displayQuestion(q) {
  const { word, showNative, choices } = q

  const nativeLang = currentMeta?.nativeLanguage || 'English'
  const targetLang = currentMeta?.language       || 'Target'
  const flag       = flagFor(currentMeta?.languageCode)

  $('direction-badge').textContent = showNative
    ? `${flag}  ${nativeLang} → ${targetLang}`
    : `${flag}  ${targetLang} → ${nativeLang}`

  const level = currentCefrLevel()
  $('cefr-level-chip').textContent = level ? `Level ${level}` : '✓ All'

  setEmphasizedText($('word-display'), showNative ? word.english : formatTarget(word))

  // Register only describes the target-language word, so it's shown alongside
  // it (like IPA) — not when English is the head word and the target is hidden.
  const registers = word.register && word.register.length ? word.register : ['All']
  const showRegister = !showNative && !(registers.length === 1 && registers[0] === 'All')
  $('word-register').classList.toggle('hidden', !showRegister)
  $('word-register').textContent = showRegister ? registers.join(', ') : ''

  if (!showNative && word.ipa) renderPronunciationInto($('word-ipa'), word)
  else $('word-ipa').innerHTML = ''
  const countabilityTag = { mass: ' · mass', collective: ' · collective', 'plural-only': ' · plural only' }
  $('word-pos').textContent = word['part-of-speech'] + (countabilityTag[word.countability] || '')

  if (word.grammar?.trim()) {
    $('grammar-area').classList.remove('hidden')
    $('grammar-reveal-btn').classList.remove('hidden')
    $('word-grammar').classList.add('hidden')
    $('word-grammar').textContent = word.grammar
  } else {
    $('grammar-area').classList.add('hidden')
  }

  if (word.context?.trim()) {
    $('context-area').classList.remove('hidden')
    $('context-reveal-btn').classList.remove('hidden')
    $('context-text').classList.add('hidden')
    $('context-text').textContent = word.context
  } else {
    $('context-area').classList.add('hidden')
  }

  const pct = Math.min((word.score / learnedThreshold()) * 100, 100)
  $('word-progress-fill').style.width  = `${pct}%`
  $('word-progress-label').textContent = word.learned
    ? '✓ Learned'
    : `${word.score} / ${learnedThreshold()}`

  const grid = $('choices-grid')
  grid.innerHTML = ''
  // Non-Latin scripts render visually smaller than Latin text at the same
  // font-size, so bump it up when choices show the native form. How much
  // varies by script (e.g. dense Hangul syllable blocks need a bigger
  // boost than Devanagari), so each script's data file can set its own
  // fontScale — defaulting to 1.25 for scripts that don't specify one.
  grid.classList.toggle('non-latin-choices', showNative && !!currentScript)
  grid.style.setProperty('--non-latin-scale', (currentScript && currentScript.fontScale) || 1.25)
  choices.forEach(choice => {
    const label = showNative ? formatTarget(choice) : choice.english
    const btn   = document.createElement('button')
    btn.className  = 'choice-btn'
    btn.dataset.id = choice.id
    const span = document.createElement('span')
    span.className   = 'choice-text'
    setEmphasizedText(span, label)
    btn.appendChild(span)
    // Pronunciation hint on hover for target-language answer choices — most
    // useful for non-Latin scripts (Hindi today, more to come), but shown
    // for any word that has an ipa/transliteration on file. The optional
    // letterBreakdown (per-letter IPA, for abugida scripts) follows right
    // after the whole-word ipa.
    if (showNative && choice.ipa) {
      const tooltip = document.createElement('div')
      tooltip.className = 'choice-tooltip'
      tooltip.appendChild(buildToneBracket(choice) || document.createTextNode(choice.ipa))
      const breakdown = (choice.letterBreakdown || [])
        .map(u => `${u.letter}${u.ipa}`).join(' ')
      if (breakdown) tooltip.appendChild(document.createTextNode(` ${breakdown}`))
      btn.appendChild(tooltip)
    }
    btn.addEventListener('click', () => handleChoice(btn, choice))
    grid.appendChild(btn)
  })

  // After layout, show the full label as a tooltip for any button whose
  // text is clipped — combined with the pronunciation hint, if there is
  // one, so clipping never loses either piece of information.
  requestAnimationFrame(() => {
    grid.querySelectorAll('.choice-btn').forEach(btn => {
      const span = btn.querySelector('.choice-text')
      if (!span || span.scrollWidth <= span.clientWidth) return
      const existing = btn.querySelector('.choice-tooltip')
      if (existing) {
        existing.insertBefore(document.createTextNode(`${span.textContent} (`), existing.firstChild)
        existing.appendChild(document.createTextNode(')'))
      } else {
        const tooltip = document.createElement('div')
        tooltip.className = 'choice-tooltip'
        tooltip.textContent = span.textContent
        btn.appendChild(tooltip)
      }
    })
  })

  $('feedback-bar').className = 'feedback-bar hidden'
  $('next-btn').classList.add('hidden')
  const mlBtn = $('mark-learned-btn')
  if (word.learned) {
    mlBtn.classList.add('hidden')
  } else {
    mlBtn.classList.remove('hidden')
  }

  updateHeader()
}

function updateHeader() {
  const total = sessionWords.length
  $('question-counter').textContent = `${Math.min(questionIndex + 1, total)} / ${total}`
  $('progress-fill').style.width    = `${(questionIndex / total) * 100}%`
  $('session-score').textContent    = `${sessionScore > 0 ? '+' : ''}${sessionScore} pts`
}

// ── Answer Handling ───────────────────────────────────
function handleChoice(btn, chosen) {
  const correct = chosen.id === currentQ.word.id
  const word    = allWords.find(w => w.id === currentQ.word.id)

  const prevScore = word.score
  if (correct) {
    word.score++
    word.correctAttempts++
    sessionScore++
    sessionCorrect++
  } else {
    word.score = Math.max(word.score - 1, 0)
  }
  word.totalAttempts++
  word.lastSeen = new Date().toISOString()

  if (word.score >= learnedThreshold()) word.learned = true

  sessionTotal++

  sessionResults.push({
    word:       currentQ.word,
    correct,
    prevScore,
    newScore:   word.score,
    nowLearned: word.learned
  })

  document.querySelectorAll('.choice-btn').forEach(b => {
    b.disabled = true
    if (b.dataset.id === currentQ.word.id) b.classList.add('correct')
    if (b === btn && !correct)             b.classList.add('incorrect')
  })

  const fb = $('feedback-bar')
  fb.className = `feedback-bar ${correct ? 'correct-fb' : 'incorrect-fb'}`
  $('feedback-icon').textContent = correct ? '✓' : '✗'
  if (correct) {
    const msg = word.score >= learnedThreshold()
      ? `Excellent! "${currentQ.word.english}" is now learned!`
      : `Correct! (${word.score}/${learnedThreshold()} pts)`
    $('feedback-text').textContent = msg
  } else {
    const answer = currentQ.showNative
      ? formatTarget(currentQ.word)
      : currentQ.word.english
    $('feedback-text').textContent = `The answer was: ${answer}`
  }

  $('session-score').textContent = `${sessionScore >= 0 ? '+' : ''}${sessionScore} pts`
  $('next-btn').classList.remove('hidden')
  $('mark-learned-btn').classList.add('hidden')

  if (correct) {
    autoAdvanceTimer = setTimeout(nextQuestion, 2000)
  }

  const pct = Math.min((word.score / learnedThreshold()) * 100, 100)
  $('word-progress-fill').style.width  = `${pct}%`
  $('word-progress-label').textContent = word.learned
    ? '✓ Learned'
    : `${word.score} / ${learnedThreshold()}`

  persistProgress()
}

// ── Mark Current Word as Learned ─────────────────────
function markCurrentAsLearned() {
  const word = allWords.find(w => w.id === currentQ.word.id)
  word.score    = learnedThreshold()
  word.learned  = true
  word.lastSeen = new Date().toISOString()

  sessionResults.push({
    word:       currentQ.word,
    correct:    true,
    prevScore:  word.score,
    newScore:   learnedThreshold(),
    nowLearned: true
  })

  $('mark-learned-btn').classList.add('hidden')
  document.querySelectorAll('.choice-btn').forEach(b => b.disabled = true)

  $('word-progress-fill').style.width  = '100%'
  $('word-progress-label').textContent = '✓ Learned'

  const fb = $('feedback-bar')
  fb.className = 'feedback-bar correct-fb'
  $('feedback-icon').textContent = '✓'
  $('feedback-text').textContent = `"${currentQ.word.english}" marked as learned!`

  $('next-btn').classList.remove('hidden')
  autoAdvanceTimer = setTimeout(nextQuestion, 2000)

  persistProgress()
}

// ── Edit Screen ───────────────────────────────────────
function showEditScreen() {
  clearTimeout(autoAdvanceTimer)
  autoAdvanceTimer = null

  const word = currentQ.word
  const tf   = targetFieldName()

  $('edit-target-label').textContent = tf.charAt(0).toUpperCase() + tf.slice(1)
  $('edit-english').value = word.english || ''
  $('edit-target').value  = word[tf] || ''
  $('edit-pos').value     = word['part-of-speech'] || 'noun'
  $('edit-gender').value  = word.gender || ''
  $('edit-plural').value  = word.plural || ''
  $('edit-ipa').value             = word.ipa || ''
  $('edit-context').value         = word.context || ''
  $('edit-cefr').value            = word.cefr || ''
  $('edit-countability').value = word.countability || 'countable'
  $('edit-hmuet').checked      = !!word.hMuet
  $('edit-grammar').value = word.grammar || ''
  $('countability-info-popover').classList.add('hidden')
  toggleNounFields($('edit-pos').value)
  updateHMuetVisibility()
  renderRegisterCheckboxes(word)
  showScreen('edit-screen')
}

// A word's register defaults to ['All'] when absent. Checking 'All' clears
// every specific value; checking any specific value clears 'All'. If a user
// unchecks everything, 'All' snaps back on rather than leaving an empty set.
function renderRegisterCheckboxes(word) {
  const langCode = currentMeta?.languageCode?.toLowerCase()
  const options  = REGISTER_OPTIONS[langCode]
  const group    = $('edit-register-group')
  const box      = $('edit-register-checkboxes')

  if (!options) {
    group.style.display = 'none'
    box.innerHTML = ''
    return
  }
  group.style.display = ''

  const selected = new Set(word.register?.length ? word.register : ['All'])
  box.innerHTML = ''
  for (const value of ['All', ...options]) {
    const label = document.createElement('label')
    label.className = 'checkbox-label'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.value = value
    input.checked = selected.has(value)
    const span = document.createElement('span')
    span.textContent = value
    label.appendChild(input)
    label.appendChild(span)
    box.appendChild(label)
  }
}

function handleRegisterCheckboxChange(changedInput) {
  const box = $('edit-register-checkboxes')
  const all = [...box.querySelectorAll('input[type="checkbox"]')]
  if (changedInput.value === 'All') {
    if (changedInput.checked) {
      for (const cb of all) if (cb !== changedInput) cb.checked = false
    }
  } else if (changedInput.checked) {
    const allBox = all.find(cb => cb.value === 'All')
    if (allBox) allBox.checked = false
  }
  if (!all.some(cb => cb.checked)) {
    const allBox = all.find(cb => cb.value === 'All')
    if (allBox) allBox.checked = true
  }
}

function getSelectedRegisters() {
  const box = $('edit-register-checkboxes')
  const checked = [...box.querySelectorAll('input[type="checkbox"]:checked')].map(cb => cb.value)
  return checked.length ? checked : ['All']
}

function toggleNounFields(pos) {
  const show = pos === 'noun'
  const countability = show ? $('edit-countability').value : ''
  $('edit-gender-group').style.display       = show ? '' : 'none'
  $('edit-countability-group').style.display = show ? '' : 'none'
  $('edit-plural-group').style.display       = (show && countability === 'countable') ? '' : 'none'
  $('edit-grammar-group').style.display      =
    ['noun-declension', 'adjective-declension', 'verb-conjugation', 'pronoun-declension'].includes(pos) ? '' : 'none'
}

function updateHMuetVisibility() {
  const isFrench = currentMeta?.languageCode?.toLowerCase() === 'fr'
  const isNoun   = $('edit-pos').value === 'noun'
  const startsH  = ($('edit-target').value.trim()[0] || '').toLowerCase() === 'h'
  $('edit-hmuet-group').style.display = (isFrench && isNoun && startsH) ? '' : 'none'
}

function saveEdit() {
  const word = allWords.find(w => w.id === currentQ.word.id)
  const tf   = targetFieldName()
  const pos  = $('edit-pos').value

  word.english           = $('edit-english').value.trim()
  word[tf]               = $('edit-target').value.trim()
  word['part-of-speech'] = pos
  const ipa = $('edit-ipa').value.trim()
  if (ipa) word.ipa = ipa; else delete word.ipa

  const context = $('edit-context').value.trim()
  if (context) word.context = context; else delete word.context

  const cefr  = $('edit-cefr').value
  if (cefr) word.cefr = cefr; else delete word.cefr

  const grammar = $('edit-grammar').value.trim()
  if (grammar) word.grammar = grammar; else delete word.grammar

  if (REGISTER_OPTIONS[currentMeta?.languageCode?.toLowerCase()]) {
    word.register = getSelectedRegisters()
  }

  if (pos === 'noun') {
    const gender       = $('edit-gender').value
    const countability = $('edit-countability').value
    const plural       = $('edit-plural').value.trim()
    if (gender) word.gender = gender; else delete word.gender
    if (countability && countability !== 'countable') word.countability = countability
    else delete word.countability
    if (countability === 'countable' && plural) word.plural = plural; else delete word.plural
    if ($('edit-hmuet').checked) word.hMuet = true; else delete word.hMuet
  } else {
    delete word.gender
    delete word.plural
    delete word.countability
    delete word.hMuet
  }

  persistVocabulary()

  if (editReturnScreen === 'search-screen') {
    currentQ = savedQuizQ
    applySearch()
    showScreen('search-screen')
  } else {
    currentQ = makeQuestion(word)
    displayQuestion(currentQ)
    showScreen('quiz-screen')
  }
}

// ── Advance to Next Question ──────────────────────────
function nextQuestion() {
  clearTimeout(autoAdvanceTimer)
  autoAdvanceTimer = null
  questionIndex++
  if (questionIndex >= sessionWords.length) {
    showSummary()
    return
  }
  currentQ = makeQuestion(sessionWords[questionIndex])
  displayQuestion(currentQ)
}

// ── Summary ───────────────────────────────────────────
function showSummary() {
  const accuracy = sessionTotal > 0
    ? Math.round((sessionCorrect / sessionTotal) * 100)
    : 0

  $('stat-score').textContent    = (sessionScore >= 0 ? '+' : '') + sessionScore
  $('stat-accuracy').textContent = `${accuracy}%`
  $('stat-learned').textContent  = sessionResults.filter(r => r.nowLearned).length

  const list = $('results-list')
  list.innerHTML = ''

  const seen = new Map()
  for (const r of sessionResults) seen.set(r.word.id, r)
  const unique = [...seen.values()].sort((a, b) => b.newScore - a.newScore)

  unique.forEach(r => {
    const row = document.createElement('div')
    row.className = 'result-row'

    const dotClass = r.nowLearned    ? 'learned'
                   : r.newScore > 0  ? 'in-progress'
                   : 'needs-work'

    const badgeHtml = r.nowLearned
      ? '<span class="score-badge learned-badge">Learned!</span>'
      : r.newScore > 0
        ? `<span class="score-badge progress-badge">${r.newScore}/${learnedThreshold()}</span>`
        : ''

    row.innerHTML = `
      <div class="result-dot ${dotClass}"></div>
      <div class="result-words">
        <span class="result-native">${r.word.english}</span>
        <span class="result-sep">→</span>
        <span class="result-target">${formatTarget(r.word)}</span>
      </div>
      ${badgeHtml}
    `
    list.appendChild(row)
  })

  showScreen('summary-screen')
}

// ── Start a New Session ───────────────────────────────
function startSession() {
  sessionWords   = pickSessionWords()
  questionIndex  = 0
  sessionScore   = 0
  sessionCorrect = 0
  sessionTotal   = 0
  sessionResults = []

  if (sessionWords.length === 0) {
    alert('No words available in this file!')
    return
  }

  // Only brand-new words get an intro card — in-progress and learned words
  // are review, so they skip straight to being quizzed. A session with
  // nothing new goes straight to the quiz.
  introWords = sessionWords.filter(w => w.score === 0 && !w.learned)
  introIndex = 0
  if (introWords.length > 0) {
    displayIntroCard()
    showScreen('intro-screen')
  } else {
    startQuiz()
  }
}

function startQuiz() {
  // Re-shuffle after an intro so the quiz doesn't ask about words in the
  // same order they were just studied in.
  if (introWords.length > 0) sessionWords = shuffle(sessionWords)
  currentQ = makeQuestion(sessionWords[0])
  displayQuestion(currentQ)
  showScreen('quiz-screen')
}

// ── Word Intro Cards ──────────────────────────────────
// Unlike the quiz card, everything is shown up front — target word,
// pronunciation, meaning, grammar and context — since the point is to study.
function displayIntroCard() {
  const word   = introWords[introIndex]
  const total  = introWords.length
  const isLast = introIndex === total - 1

  $('intro-counter').textContent = `${introIndex + 1} / ${total}`
  $('intro-progress-fill').style.width = `${((introIndex + 1) / total) * 100}%`

  setEmphasizedText($('intro-word'), formatTarget(word))

  const registers = word.register && word.register.length ? word.register : ['All']
  const showRegister = !(registers.length === 1 && registers[0] === 'All')
  $('intro-register').classList.toggle('hidden', !showRegister)
  $('intro-register').textContent = showRegister ? registers.join(', ') : ''

  renderPronunciationInto($('intro-ipa'), word)
  const countabilityTag = { mass: ' · mass', collective: ' · collective', 'plural-only': ' · plural only' }
  $('intro-pos').textContent = word['part-of-speech'] + (countabilityTag[word.countability] || '')
  $('intro-meaning').textContent = word.english

  const grammar = word.grammar?.trim() || ''
  $('intro-grammar').classList.toggle('hidden', !grammar)
  $('intro-grammar').textContent = grammar

  const context = word.context?.trim() || ''
  $('intro-context').classList.toggle('hidden', !context)
  $('intro-context').textContent = context

  $('intro-back-btn').disabled = introIndex === 0
  $('intro-next-btn').textContent = isLast ? 'Start Quiz →' : 'Next Word →'
}

function nextIntroCard() {
  if (introIndex < introWords.length - 1) {
    introIndex++
    displayIntroCard()
  } else {
    startQuiz()
  }
}

function prevIntroCard() {
  if (introIndex === 0) return
  introIndex--
  displayIntroCard()
}

// ── Welcome Screen: Language / Mode Picker ────────────
// Two-step drill-down (language, then mode) replacing the old native
// file-open dialog — the app already knows what's in language-data/.
async function renderLanguagePicker() {
  allLanguageEntries = await window.api.listContent()
  renderLanguageButtons()
}

function favoriteLanguages() {
  return preferences.favoriteLanguages || []
}

function renderLanguageButtons() {
  const container = $('language-buttons')
  container.innerHTML = ''

  const favorites = favoriteLanguages()
  // No favorites set yet (first run, or the user hasn't picked any) means
  // there's nothing meaningful to filter to — show everything rather than
  // an empty picker.
  const hasFilter = favorites.length > 0 && !languagePickerShowAll
  const entries = hasFilter
    ? allLanguageEntries.filter(e => favorites.includes(e.slug))
    : allLanguageEntries

  entries.forEach(entry => {
    const btn = document.createElement('button')
    btn.className   = 'level-btn'
    btn.textContent = `${flagFor(entry.languageCode)} ${entry.language}`
    // The editor only edits vocabulary, so it skips the mode picker
    // (quiz vs. reading) and goes straight to browsing the words.
    btn.addEventListener('click', () => {
      if (editorMode && entry.hasVocabulary) loadVocabulary(entry.slug)
      else renderModePicker(entry)
    })
    container.appendChild(btn)
  })

  const toggle = $('language-picker-toggle')
  if (favorites.length === 0) {
    toggle.classList.add('hidden')
  } else {
    toggle.classList.remove('hidden')
    toggle.textContent = languagePickerShowAll ? 'Show favorites only' : 'Show all languages'
  }
}

function toggleShowAllLanguages() {
  languagePickerShowAll = !languagePickerShowAll
  renderLanguageButtons()
}

function renderModePicker(entry) {
  const container = $('mode-buttons')
  container.innerHTML = ''

  if (entry.hasVocabulary) {
    const btn = document.createElement('button')
    btn.className   = 'level-btn'
    btn.textContent = '📚 Vocabulary Quiz'
    btn.addEventListener('click', () => loadVocabulary(entry.slug))
    container.appendChild(btn)
  }
  if (entry.hasReading) {
    const btn = document.createElement('button')
    btn.className   = 'level-btn'
    btn.textContent = '📖 Reading Comprehension'
    btn.addEventListener('click', () => loadReading(entry.slug))
    container.appendChild(btn)
  }

  $('language-picker').classList.add('hidden')
  $('mode-picker').classList.remove('hidden')
}

function resetWelcomePicker() {
  $('mode-picker').classList.add('hidden')
  $('language-picker').classList.remove('hidden')
}

// ── File Loading ──────────────────────────────────────
async function loadVocabulary(slug) {
  const result = await window.api.loadVocabulary(slug)
  if (result.error) { alert(result.error); return }

  currentMeta = result.vocab.meta || {}
  // Default targetField to lowercase language name if not specified
  if (!currentMeta.targetField && currentMeta.language) {
    currentMeta.targetField = currentMeta.language.toLowerCase()
  }
  const progressById = result.progress?.progress || {}
  allWords = (result.vocab.words || [])
    .map(word => ensureDefaults(Object.assign({}, word, progressById[word.id])))

  currentScript = result.script || null
  updateScriptGuideButton()

  updateWelcomeScreen()
  if (editorMode) {
    resetWelcomePicker()
    showSearchScreen('welcome-screen')
  } else {
    startSession()
  }
}

// ── Script Guide (abugida/alphabet reference popup) ─────────────────
// Driven entirely by the optional <slug>-script.json data file, so this
// works for any future non-Latin-script language without code changes —
// the button just hides itself when a language has no script file.
function updateScriptGuideButton() {
  $('script-guide-btn').classList.toggle('hidden', !currentScript)
  // buttonLabel lets a guide that isn't about the script (e.g. Czech
  // grammar) name itself; older guide files just keep the default.
  $('script-guide-btn').textContent = currentScript?.buttonLabel || 'Script Guide'
}

function renderScriptGuide() {
  $('script-guide-title').textContent = currentScript.scriptName
    ? `${currentScript.scriptName} Guide`
    : 'Script Guide'

  const body = $('script-guide-body')
  body.innerHTML = ''

  if (currentScript.intro) {
    const intro = document.createElement('p')
    intro.className = 'script-guide-intro'
    intro.textContent = currentScript.intro
    body.appendChild(intro)
  }

  // Tables need more room than the character grid, so widen the card for
  // guides that have any.
  const hasTables = (currentScript.sections || []).some(s => s.table)
  $('script-guide-card').classList.toggle('modal-card-wide', hasTables)

  for (const section of (currentScript.sections || [])) {
    const heading = document.createElement('h3')
    heading.className = 'script-guide-heading'
    heading.textContent = section.heading
    body.appendChild(heading)

    // Optional prose and table blocks (used by grammar guides) — a section
    // can have any mix of text, a table, and the character grid below.
    const texts = Array.isArray(section.text) ? section.text : (section.text ? [section.text] : [])
    for (const t of texts) {
      const p = document.createElement('p')
      p.className = 'script-guide-text'
      p.textContent = t
      body.appendChild(p)
    }
    if (section.table) body.appendChild(buildGuideTable(section.table))
    if (!section.items || section.items.length === 0) continue

    const grid = document.createElement('div')
    grid.className = 'script-guide-grid'
    for (const item of (section.items || [])) {
      const cell = document.createElement('div')
      cell.className = 'script-char-cell'
      const char = document.createElement('div')
      char.className = 'script-char'
      // charGlyph/ipaGlyph (optional, Chinese-only) carry the same
      // {ipaSyllables, tone} shape buildToneBracket already draws for the
      // quiz screens — reused here so the guide shows the real contour
      // notation instead of a separately-maintained description of it.
      if (item.charGlyph) {
        char.appendChild(buildToneBracket(item.charGlyph))
        if (item.charSuffix) char.appendChild(document.createTextNode(' ' + item.charSuffix))
      } else {
        char.textContent = item.char
      }
      const ipa = document.createElement('div')
      ipa.className = 'script-char-ipa'
      if (item.ipaGlyph) {
        ipa.appendChild(buildToneBracket(item.ipaGlyph))
        if (item.ipaSuffix) ipa.appendChild(document.createTextNode(' ' + item.ipaSuffix))
      } else {
        ipa.textContent = item.ipa
      }
      cell.appendChild(char)
      cell.appendChild(ipa)
      if (item.note) {
        const note = document.createElement('div')
        note.className = 'script-char-note'
        note.textContent = item.note
        cell.appendChild(note)
      }
      grid.appendChild(cell)
    }
    body.appendChild(grid)
  }
}

// table: { columns: [header, ...], rows: [[cell, ...], ...], note? }.
// The first column is treated as row labels (e.g. case names).
function buildGuideTable(table) {
  const wrap = document.createElement('div')
  wrap.className = 'guide-table-wrap'
  const el = document.createElement('table')
  el.className = 'guide-table'
  if (table.columns) {
    const tr = document.createElement('tr')
    for (const c of table.columns) {
      const th = document.createElement('th')
      th.textContent = c
      tr.appendChild(th)
    }
    const thead = document.createElement('thead')
    thead.appendChild(tr)
    el.appendChild(thead)
  }
  const tbody = document.createElement('tbody')
  for (const row of (table.rows || [])) {
    const tr = document.createElement('tr')
    row.forEach((cell, i) => {
      const td = document.createElement(i === 0 ? 'th' : 'td')
      td.textContent = cell
      tr.appendChild(td)
    })
    tbody.appendChild(tr)
  }
  el.appendChild(tbody)
  wrap.appendChild(el)
  if (table.note) {
    const note = document.createElement('p')
    note.className = 'guide-table-note'
    note.textContent = table.note
    wrap.appendChild(note)
  }
  return wrap
}

function showScriptGuide() {
  if (!currentScript) return
  renderScriptGuide()
  $('script-guide-modal').classList.remove('hidden')
}

function hideScriptGuide() {
  $('script-guide-modal').classList.add('hidden')
}

// Minimal parser for the one markdown subset CHANGELOG.md actually uses:
// "## " version headings and "- " bullet points. Not a general markdown
// renderer — just enough to avoid adding a dependency for this one file.
function renderChangelog(markdown) {
  const body = $('changelog-body')
  body.innerHTML = ''
  if (!markdown) {
    body.textContent = 'Could not load the changelog.'
    return
  }
  const lines = markdown.split('\n')
  let list = null
  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line || line.startsWith('# ')) continue
    if (line.startsWith('## ')) {
      const heading = document.createElement('h3')
      heading.className = 'changelog-heading'
      heading.textContent = line.slice(3)
      body.appendChild(heading)
      list = null
    } else if (line.startsWith('- ')) {
      if (!list) {
        list = document.createElement('ul')
        list.className = 'changelog-list'
        body.appendChild(list)
      }
      const item = document.createElement('li')
      item.textContent = line.slice(2)
      list.appendChild(item)
    }
  }
}

function showChangelog() {
  window.api.getChangelog().then(renderChangelog)
  $('changelog-modal').classList.remove('hidden')
}

function hideChangelog() {
  $('changelog-modal').classList.add('hidden')
}

// ── Preferences ───────────────────────────────────────
function renderPreferencesLanguageList() {
  const container = $('preferences-language-list')
  container.innerHTML = ''
  const favorites = favoriteLanguages()

  allLanguageEntries.forEach(entry => {
    const label = document.createElement('label')
    label.className = 'checkbox-label'
    const checkbox = document.createElement('input')
    checkbox.type    = 'checkbox'
    checkbox.checked = favorites.includes(entry.slug)
    checkbox.addEventListener('change', () => toggleFavoriteLanguage(entry.slug, checkbox.checked))
    label.appendChild(checkbox)
    label.appendChild(document.createTextNode(`${flagFor(entry.languageCode)} ${entry.language}`))
    container.appendChild(label)
  })
}

function toggleFavoriteLanguage(slug, isFavorite) {
  const favorites = new Set(favoriteLanguages())
  if (isFavorite) favorites.add(slug)
  else favorites.delete(slug)
  preferences.favoriteLanguages = [...favorites]
  window.api.savePreferences(preferences)
  renderLanguageButtons()
}

function renderPreferencesSessionSizeList() {
  const container = $('preferences-session-size-list')
  container.innerHTML = ''
  for (const level of CEFR_ORDER) {
    const row = document.createElement('label')
    row.className = 'session-size-row'
    const labelText = document.createElement('span')
    labelText.textContent = level
    const input = document.createElement('input')
    input.type      = 'number'
    input.min        = '2'
    input.max        = '50'
    input.className  = 'session-size-input'
    input.value      = sessionSizeForLevel(level)
    input.addEventListener('change', () => setSessionSizeForLevel(level, input.value))
    row.appendChild(labelText)
    row.appendChild(input)
    container.appendChild(row)
  }
}

function setSessionSizeForLevel(level, rawValue) {
  const parsed = parseInt(rawValue, 10)
  const clamped = Number.isFinite(parsed)
    ? Math.max(2, Math.min(50, parsed))
    : DEFAULT_SESSION_SIZE_BY_LEVEL[level]
  if (!preferences.sessionSizeByLevel) preferences.sessionSizeByLevel = {}
  preferences.sessionSizeByLevel[level] = clamped
  window.api.savePreferences(preferences)
  renderPreferencesSessionSizeList()
}

function renderPreferencesColorSchemeList() {
  const container = $('preferences-color-scheme-list')
  container.innerHTML = ''
  const current = preferences.colorScheme || DEFAULT_COLOR_SCHEME
  COLOR_SCHEMES.forEach(scheme => {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'color-scheme-swatch' + (scheme.id === current ? ' selected' : '')
    btn.title = scheme.name
    const dot = document.createElement('span')
    dot.className = 'color-scheme-dot'
    dot.style.background = scheme.tokens['--accent']
    const label = document.createElement('span')
    label.textContent = scheme.name
    btn.appendChild(dot)
    btn.appendChild(label)
    btn.addEventListener('click', () => setColorScheme(scheme.id))
    container.appendChild(btn)
  })
}

function setColorScheme(id) {
  preferences.colorScheme = id
  window.api.savePreferences(preferences)
  applyColorScheme(id)
  renderPreferencesColorSchemeList()
}

async function showPreferences() {
  if (allLanguageEntries.length === 0) {
    allLanguageEntries = await window.api.listContent()
  }
  renderPreferencesLanguageList()
  renderPreferencesSessionSizeList()
  renderPreferencesColorSchemeList()
  $('preferences-modal').classList.remove('hidden')
}

function hidePreferences() {
  $('preferences-modal').classList.add('hidden')
}

async function loadReading(slug) {
  const result = await window.api.loadReading(slug)
  if (result.error) { alert(result.error); return }

  readingMeta     = result.reading.meta || {}
  readingPassages = result.reading.passages || []

  // The hover index keys off the vocabulary file's target-language field
  // (e.g. "german", "czech") — not the reading file's own meta, which
  // doesn't carry targetField.
  const vocabMeta    = result.vocabMeta || {}
  const targetField  = vocabMeta.targetField || vocabMeta.language?.toLowerCase()
  readingHoverIndex  = targetField ? buildReadingHoverIndex(result.vocabWords || [], targetField) : new Map()

  showReadingLobby()
}

// ── Search / Browse ───────────────────────────────────
function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function showSearchScreen(returnTo) {
  searchReturnScreen = returnTo || 'welcome-screen'
  // Progress-based filtering/sorting has no place in the editor.
  const scoreSort = $('search-sort-by').querySelector('option[value="score"]')
  scoreSort.hidden = editorMode
  if (editorMode && $('search-sort-by').value === 'score') $('search-sort-by').value = 'target'
  if (editorMode) $('search-status').value = ''
  selectedWordIds.clear()
  renderSearchRegisterOptions()
  renderColumnsMenu()
  applySearch()
  showScreen('search-screen')
}

// Register choices are language-specific, so the filter dropdown is rebuilt
// from REGISTER_OPTIONS each time a file is browsed rather than hardcoded.
function renderSearchRegisterOptions() {
  const select   = $('search-register')
  const langCode = currentMeta?.languageCode?.toLowerCase()
  const options  = REGISTER_OPTIONS[langCode]

  if (!options) {
    select.classList.add('hidden')
    select.innerHTML = '<option value="">All registers</option>'
    return
  }
  select.classList.remove('hidden')
  const prevValue = select.value
  select.innerHTML = '<option value="">All registers</option>' +
    ['All', ...options].map(v => `<option value="${escHtml(v)}">${escHtml(v)}</option>`).join('')
  if ([...select.options].some(o => o.value === prevValue)) select.value = prevValue
}

function renderColumnsMenu() {
  const list = $('columns-menu-list')
  list.innerHTML = browseColumns().map(col => `
    <label class="checkbox-label">
      <input type="checkbox" data-col="${escHtml(col.id)}" ${searchVisibleColumns.has(col.id) ? 'checked' : ''}>
      <span>${escHtml(col.label)}</span>
    </label>
  `).join('')
}

function applySearch() {
  const tf     = targetFieldName()
  const text   = $('search-text').value.trim().toLowerCase()
  const pos    = $('search-pos').value
  const cefr   = $('search-cefr').value
  const status = $('search-status').value
  const register = $('search-register').value
  const sortBy = $('search-sort-by').value
  const sortDir = $('search-sort-dir').dataset.dir || 'asc'

  let results = allWords.filter(w => {
    if (text) {
      const inTarget  = (w[tf]      || '').toLowerCase().includes(text)
      const inEnglish = (w.english  || '').toLowerCase().includes(text)
      if (!inTarget && !inEnglish) return false
    }
    if (pos    && w['part-of-speech'] !== pos)   return false
    if (cefr   && w.cefr !== cefr)               return false
    if (status === 'learned'    && !w.learned)                     return false
    if (status === 'inprogress' && (w.learned || w.score === 0))   return false
    if (status === 'notstarted' && (w.learned || w.score > 0))     return false
    if (register) {
      const wordRegisters = w.register && w.register.length ? w.register : ['All']
      if (!wordRegisters.includes(register)) return false
    }
    return true
  })

  results.sort((a, b) => {
    let av, bv
    switch (sortBy) {
      case 'target':  av = (a[tf]              || '').toLowerCase(); bv = (b[tf]              || '').toLowerCase(); break
      case 'english': av = (a.english          || '').toLowerCase(); bv = (b.english          || '').toLowerCase(); break
      case 'pos':     av = (a['part-of-speech']|| '').toLowerCase(); bv = (b['part-of-speech']|| '').toLowerCase(); break
      case 'cefr':    av = CEFR_ORDER.indexOf(a.cefr); bv = CEFR_ORDER.indexOf(b.cefr);
                      if (av < 0) av = 99; if (bv < 0) bv = 99; break
      case 'score':   av = a.learned ? 9999 : (a.score ?? 0); bv = b.learned ? 9999 : (b.score ?? 0); break
      default:        av = (a[tf] || '').toLowerCase(); bv = (b[tf] || '').toLowerCase()
    }
    const cmp = av < bv ? -1 : av > bv ? 1 : 0
    return sortDir === 'asc' ? cmp : -cmp
  })

  // After a duplication, move the new entry right below its source regardless of sort order
  if (lastDuplicatePair) {
    const { sourceId, newId } = lastDuplicatePair
    const srcIdx = results.findIndex(w => w.id === sourceId)
    const dupIdx = results.findIndex(w => w.id === newId)
    if (srcIdx >= 0 && dupIdx >= 0) {
      const [dup] = results.splice(dupIdx, 1)
      const newSrcIdx = results.findIndex(w => w.id === sourceId)
      results.splice(newSrcIdx + 1, 0, dup)
    }
    lastDuplicatePair = null
  }

  searchResultsFull = results
  searchPage = 0
  renderSearchPage()
}

function renderSearchPage() {
  const results = searchResultsFull
  const total   = results.length
  const pages   = Math.max(1, Math.ceil(total / SEARCH_PAGE_SIZE))
  searchPage    = Math.min(searchPage, pages - 1)

  const start = searchPage * SEARCH_PAGE_SIZE
  const slice = results.slice(start, start + SEARCH_PAGE_SIZE)

  $('search-count').textContent = `${total.toLocaleString()} word${total !== 1 ? 's' : ''}`

  const columns = browseColumns().filter(c => searchVisibleColumns.has(c.id))

  searchPageIds = slice.map(w => w.id)

  const theadRow = $('search-thead-row')
  theadRow.innerHTML =
    `<th class="col-select"><input type="checkbox" id="search-select-all" aria-label="Select all on this page"></th>` +
    columns.map(c => `<th class="col-${escHtml(c.id)}">${escHtml(c.label)}</th>`).join('') +
    `<th class="col-actions"></th>`

  openKebabRowId = null
  const tbody = $('search-tbody')
  tbody.innerHTML = ''
  for (const word of slice) {
    const tr = document.createElement('tr')
    tr.classList.toggle('selected', selectedWordIds.has(word.id))
    const learnedLabel = word.learned ? 'Unlearn' : 'Mark Learned'
    const learnedAction = word.learned ? 'kebab-unlearn' : 'kebab-learned'
    tr.innerHTML =
      `<td class="col-select"><input type="checkbox" class="row-select" data-id="${escHtml(word.id)}" ${selectedWordIds.has(word.id) ? 'checked' : ''} aria-label="Select word"></td>` +
      columns.map(c => `<td class="col-${escHtml(c.id)}">${c.render(word)}</td>`).join('') +
      `<td class="col-actions">
        <button class="btn-kebab" data-id="${escHtml(word.id)}" aria-label="Actions">⋮</button>
        <div class="kebab-menu hidden" data-menu-for="${escHtml(word.id)}">
          <button class="kebab-edit editor-only" data-action="edit" data-id="${escHtml(word.id)}">Edit</button>
          <button class="kebab-dup editor-only" data-action="dup" data-id="${escHtml(word.id)}">Duplicate</button>
          <button class="${learnedAction} learner-only" data-action="learned" data-id="${escHtml(word.id)}">${learnedLabel}</button>
        </div>
      </td>`
    tbody.appendChild(tr)
  }

  tbody.querySelectorAll('.btn-kebab').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      toggleKebabMenu(btn.dataset.id)
    })
  })
  tbody.querySelectorAll('.kebab-menu button').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation()
      const { action, id } = btn.dataset
      openKebabRowId = null
      if (action === 'edit') editFromSearch(id)
      else if (action === 'dup') duplicateFromSearch(id)
      else if (action === 'learned') toggleLearnedFromSearch(id)
    })
  })
  tbody.querySelectorAll('.row-select').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedWordIds.add(cb.dataset.id)
      else selectedWordIds.delete(cb.dataset.id)
      cb.closest('tr').classList.toggle('selected', cb.checked)
      updateSelectionToolbar()
    })
  })
  $('search-select-all').addEventListener('change', e => {
    if (e.target.checked) searchPageIds.forEach(id => selectedWordIds.add(id))
    else searchPageIds.forEach(id => selectedWordIds.delete(id))
    renderSearchPage()
  })

  updateSelectionToolbar()

  const paginationEl = $('search-pagination')
  if (pages <= 1) {
    paginationEl.classList.add('hidden')
  } else {
    paginationEl.classList.remove('hidden')
    $('search-page-label').textContent = `Page ${searchPage + 1} of ${pages}`
    $('search-prev-btn').disabled = searchPage === 0
    $('search-next-btn').disabled = searchPage >= pages - 1
  }
}

function toggleKebabMenu(wordId) {
  openKebabRowId = openKebabRowId === wordId ? null : wordId
  document.querySelectorAll('.kebab-menu').forEach(menu => {
    menu.classList.toggle('hidden', menu.dataset.menuFor !== openKebabRowId)
  })
}

// Keeps the mass-edit toolbar and the header "select all" checkbox in sync
// with selectedWordIds, which persists across pages and filter changes.
function updateSelectionToolbar() {
  const count = selectedWordIds.size
  $('selection-toolbar').classList.toggle('hidden', count === 0)
  if (count > 0) $('selection-count').textContent = `${count.toLocaleString()} selected`

  const selectAllCb = $('search-select-all')
  if (selectAllCb) {
    const selectedOnPage = searchPageIds.filter(id => selectedWordIds.has(id)).length
    selectAllCb.checked = searchPageIds.length > 0 && selectedOnPage === searchPageIds.length
    selectAllCb.indeterminate = selectedOnPage > 0 && selectedOnPage < searchPageIds.length
  }
}

function massDuplicateSelected() {
  const ids = [...selectedWordIds]
  if (ids.length === 0) return
  for (const id of ids) {
    const source = allWords.find(w => w.id === id)
    if (!source) continue
    const newWord = Object.assign({}, source, {
      id:              crypto.randomUUID(),
      score:           0,
      learned:         false,
      totalAttempts:   0,
      correctAttempts: 0,
      lastSeen:        null,
    })
    const sourceIdx = allWords.indexOf(source)
    allWords.splice(sourceIdx + 1, 0, newWord)
  }
  selectedWordIds.clear()
  persistVocabulary()
  applySearch()
}

function massMarkLearnedSelected() {
  const ids = [...selectedWordIds]
  if (ids.length === 0) return
  for (const id of ids) {
    const word = allWords.find(w => w.id === id)
    if (!word) continue
    word.learned = true
    word.score   = learnedThreshold()
  }
  selectedWordIds.clear()
  persistProgress()
  applySearch()
}

function duplicateFromSearch(wordId) {
  const source = allWords.find(w => w.id === wordId)
  if (!source) return

  const newWord = Object.assign({}, source, {
    id:              crypto.randomUUID(),
    score:           0,
    learned:         false,
    totalAttempts:   0,
    correctAttempts: 0,
    lastSeen:        null,
  })

  const sourceIdx = allWords.indexOf(source)
  allWords.splice(sourceIdx + 1, 0, newWord)

  lastDuplicatePair = { sourceId: wordId, newId: newWord.id }
  persistVocabulary()
  applySearch()
}

function toggleLearnedFromSearch(wordId) {
  const word = allWords.find(w => w.id === wordId)
  if (!word) return
  if (word.learned) {
    word.learned = false
    // Floor at 1, not 0 — a word that's been unlearned still has SOME
    // history and should stay distinguishable from "never studied" in the
    // progress file (which only keeps entries for engaged words).
    word.score   = Math.max(1, learnedThreshold() - 1)
  } else {
    word.learned = true
    word.score   = learnedThreshold()
  }
  persistProgress()
  applySearch()
}

function editFromSearch(wordId) {
  const word = allWords.find(w => w.id === wordId)
  if (!word) return
  savedQuizQ       = currentQ
  currentQ         = { word, showNative: false, choices: [] }
  editReturnScreen = 'search-screen'
  showEditScreen()
}

// ── Event Wiring ──────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateWelcomeScreen()
  window.api.getPreferences().then(p => {
    preferences = p || {}
    applyColorScheme(preferences.colorScheme || DEFAULT_COLOR_SCHEME)
    renderLanguagePicker()
  })
  Promise.all([window.api.getAppVersion(), window.api.getEditorMode()]).then(([v, editor]) => {
    editorMode = editor
    document.body.classList.toggle('editor-mode', editor)
    $('app-version').textContent = editor ? `v${v} · Editor` : `v${v}`
  })

  $('mode-back-btn').addEventListener('click', resetWelcomePicker)
  $('language-picker-toggle').addEventListener('click', toggleShowAllLanguages)

  $('preferences-btn').addEventListener('click', showPreferences)
  $('preferences-close').addEventListener('click', hidePreferences)
  $('preferences-modal').addEventListener('click', e => {
    if (e.target.id === 'preferences-modal') hidePreferences()
  })

  $('quit-btn').addEventListener('click', () => {
    if (confirm('End this session?')) {
      resetWelcomePicker()
      showScreen('welcome-screen')
    }
  })

  // Nothing has been scored yet on the intro screen, so no confirm needed.
  $('intro-quit-btn').addEventListener('click', () => {
    resetWelcomePicker()
    showScreen('welcome-screen')
  })
  $('intro-next-btn').addEventListener('click', nextIntroCard)
  $('intro-back-btn').addEventListener('click', prevIntroCard)
  $('intro-skip-btn').addEventListener('click', startQuiz)

  $('next-btn').addEventListener('click', nextQuestion)
  $('mark-learned-btn').addEventListener('click', markCurrentAsLearned)
  $('edit-word-btn').addEventListener('click', () => {
    editReturnScreen = 'quiz-screen'
    showEditScreen()
  })
  $('edit-save-btn').addEventListener('click', saveEdit)
  $('edit-cancel-btn').addEventListener('click', () => {
    if (editReturnScreen === 'search-screen') {
      currentQ = savedQuizQ
      showScreen('search-screen')
    } else {
      displayQuestion(currentQ)
      showScreen('quiz-screen')
    }
  })
  $('context-reveal-btn').addEventListener('click', () => {
    $('context-reveal-btn').classList.add('hidden')
    $('context-text').classList.remove('hidden')
  })
  $('grammar-reveal-btn').addEventListener('click', () => {
    $('grammar-reveal-btn').classList.add('hidden')
    $('word-grammar').classList.remove('hidden')
  })

  $('edit-pos').addEventListener('change', e => {
    toggleNounFields(e.target.value)
    updateHMuetVisibility()
  })
  $('edit-countability').addEventListener('change', () => toggleNounFields($('edit-pos').value))
  $('edit-register-checkboxes').addEventListener('change', e => {
    if (e.target.matches('input[type="checkbox"]')) handleRegisterCheckboxChange(e.target)
  })

  $('countability-info-btn').addEventListener('click', e => {
    e.stopPropagation()
    $('countability-info-popover').classList.toggle('hidden')
  })
  document.addEventListener('click', () => $('countability-info-popover').classList.add('hidden'))

  $('script-guide-btn').addEventListener('click', showScriptGuide)
  $('script-guide-close').addEventListener('click', hideScriptGuide)
  $('script-guide-modal').addEventListener('click', e => {
    if (e.target.id === 'script-guide-modal') hideScriptGuide()
  })
  $('app-version').addEventListener('click', showChangelog)
  $('changelog-close').addEventListener('click', hideChangelog)
  $('changelog-modal').addEventListener('click', e => {
    if (e.target.id === 'changelog-modal') hideChangelog()
  })
  $('edit-target').addEventListener('input', updateHMuetVisibility)

  // Browse buttons
  $('browse-btn-quiz').addEventListener('click',    () => showSearchScreen('quiz-screen'))
  $('browse-btn-summary').addEventListener('click', () => showSearchScreen('summary-screen'))
  $('browse-btn-welcome').addEventListener('click', () => showSearchScreen('welcome-screen'))
  $('search-back-btn').addEventListener('click',    () => showScreen(searchReturnScreen))

  // Search controls — re-run filter on any change
  $('search-text').addEventListener('input',         applySearch)
  $('search-pos').addEventListener('change',         applySearch)
  $('search-cefr').addEventListener('change',        applySearch)
  $('search-status').addEventListener('change',      applySearch)
  $('search-register').addEventListener('change',    applySearch)
  $('search-sort-by').addEventListener('change',     applySearch)

  $('columns-picker-btn').addEventListener('click', e => {
    e.stopPropagation()
    $('columns-menu').classList.toggle('hidden')
  })
  // Stays open regardless of what's clicked inside it (checkboxes included);
  // only the toggle button or the explicit Close button dismiss it.
  $('columns-menu').addEventListener('click', e => e.stopPropagation())
  $('columns-menu').addEventListener('change', e => {
    if (!e.target.matches('input[type="checkbox"]')) return
    const col = e.target.dataset.col
    if (e.target.checked) searchVisibleColumns.add(col); else searchVisibleColumns.delete(col)
    renderSearchPage()
  })
  $('columns-menu-close-btn').addEventListener('click', () => {
    $('columns-menu').classList.add('hidden')
  })
  document.addEventListener('click', () => {
    if (openKebabRowId !== null) {
      openKebabRowId = null
      document.querySelectorAll('.kebab-menu').forEach(menu => menu.classList.add('hidden'))
    }
  })
  $('search-sort-dir').addEventListener('click', () => {
    const btn = $('search-sort-dir')
    const next = btn.dataset.dir === 'asc' ? 'desc' : 'asc'
    btn.dataset.dir  = next
    btn.textContent  = next === 'asc' ? '↑ Asc' : '↓ Desc'
    applySearch()
  })
  $('search-prev-btn').addEventListener('click', () => { searchPage--; renderSearchPage() })
  $('search-next-btn').addEventListener('click', () => { searchPage++; renderSearchPage() })

  // Mass-edit toolbar — acts on every checked word, regardless of which page it's on
  $('selection-dup-btn').addEventListener('click', massDuplicateSelected)
  $('selection-learned-btn').addEventListener('click', massMarkLearnedSelected)
  $('selection-clear-btn').addEventListener('click', () => {
    selectedWordIds.clear()
    renderSearchPage()
  })

  $('new-session-btn').addEventListener('click', () => {
    if (allWords.length === 0) {
      showScreen('welcome-screen')
    } else {
      startSession()
    }
  })

  $('load-file-btn').addEventListener('click', () => {
    allWords    = []
    currentMeta = null
    updateWelcomeScreen()
    resetWelcomePicker()
    showScreen('welcome-screen')
  })

  $('exit-btn').addEventListener('click', () => window.api.quitApp())
  $('welcome-exit-btn').addEventListener('click', () => window.api.quitApp())

  // ── Reading event wiring ───────────────────────────
  $('reading-start-btn').addEventListener('click', startReadingSession)

  $('reading-change-file-btn').addEventListener('click', () => {
    readingPassages = []
    readingMeta     = null
    resetWelcomePicker()
    showScreen('welcome-screen')
  })

  $('reading-passage-quit-btn').addEventListener('click', () => {
    if (confirm('End this reading session?')) showReadingLobby()
  })

  $('reading-begin-btn').addEventListener('click', beginReadingQuestions)

  $('reading-question-quit-btn').addEventListener('click', () => {
    if (confirm('End this reading session?')) {
      clearTimeout(rdAutoAdvTimer)
      rdAutoAdvTimer = null
      showReadingLobby()
    }
  })

  $('reading-review-btn').addEventListener('click', showReadingReview)
  $('reading-new-session-btn').addEventListener('click', startReadingSession)
  $('reading-home-btn').addEventListener('click', () => {
    resetWelcomePicker()
    showScreen('welcome-screen')
  })
  $('reading-review-back-btn').addEventListener('click', () => showScreen('reading-score-screen'))
})

// ── Reading Comprehension ─────────────────────────────

function showReadingLobby() {
  const flag = flagFor(readingMeta?.languageCode)
  const lang = readingMeta?.language || 'Reading'
  const n    = readingPassages.length
  $('reading-lobby-flag').textContent     = flag
  $('reading-lobby-title').textContent    = `${lang} — Reading`
  $('reading-lobby-subtitle').textContent = `${n} passage${n !== 1 ? 's' : ''} available`

  readingSelectedLevel = null
  const levels = CEFR_ORDER.filter(lv => readingPassages.some(p => p.cefr === lv))
  const picker = $('reading-level-picker')
  const startBtn = $('reading-start-btn')

  if (levels.length === 0) {
    // File carries no level metadata — behave as before, no prompt needed.
    picker.classList.add('hidden')
    startBtn.disabled = false
  } else {
    picker.classList.remove('hidden')
    startBtn.disabled = true
    const buttonsEl = $('reading-level-buttons')
    buttonsEl.innerHTML = ''
    for (const lv of levels) {
      const count = readingPassages.filter(p => p.cefr === lv).length
      const btn = document.createElement('button')
      btn.className = 'level-btn'
      btn.textContent = `${lv} (${count})`
      btn.addEventListener('click', () => {
        readingSelectedLevel = lv
        for (const b of buttonsEl.children) b.classList.remove('selected')
        btn.classList.add('selected')
        startBtn.disabled = false
      })
      buttonsEl.appendChild(btn)
    }
  }

  showScreen('reading-lobby-screen')
}

function startReadingSession() {
  const pool = readingSelectedLevel
    ? readingPassages.filter(p => p.cefr === readingSelectedLevel)
    : readingPassages
  readingSession     = shuffle([...pool]).slice(0, READING_SESSION_SIZE)
  readingPassageIdx  = 0
  readingQuestionIdx = 0
  readingResults     = []
  showReadingPassage()
}

// Build a surface-form -> dictionary-gloss lookup from a vocabulary file's
// word list, for the passage-hover translation hints. Declension/conjugation
// entries borrow their base word's clean gloss via baseId when one exists;
// everything else (base words, and verb-conjugation forms which have no
// baseId) just uses its own english field. Base-POS entries always win over
// declension/conjugation entries when a surface form collides between them.
function buildReadingHoverIndex(vocabWords, targetField) {
  const byId = new Map(vocabWords.map(w => [w.id, w]))
  const index = new Map()

  for (const w of vocabWords) {
    const surface = w[targetField]
    if (!surface || !w.english) continue
    const isBase = BASE_POS.has(w['part-of-speech'])
    let gloss = w.english
    if (w.baseId) {
      const base = byId.get(w.baseId)
      if (base?.english) gloss = base.english
    }

    for (const variant of surface.split(' / ')) {
      const key = variant.trim().toLowerCase()
      if (!key || key.includes(' ')) continue   // skip multi-word surface forms
      const existing = index.get(key)
      if (!existing || (!existing.isBase && isBase)) {
        index.set(key, { english: gloss, isBase })
      }
    }
  }
  return index
}

// Wrap each word in `text` that has a hover-index match with a span carrying
// its dictionary gloss as a data attribute (shown via a pure-CSS tooltip);
// everything else (punctuation, spacing, unmatched words) passes through as
// plain escaped text.
function renderHoverablePassage(text) {
  if (!readingHoverIndex) return escHtml(text)
  const re = /\p{L}+/gu
  let html = ''
  let lastIndex = 0
  let m
  while ((m = re.exec(text)) !== null) {
    html += escHtml(text.slice(lastIndex, m.index))
    const word  = m[0]
    const entry = readingHoverIndex.get(word.toLowerCase())
    html += entry
      ? `<span class="hoverable-word" data-gloss="${escHtml(entry.english)}">${escHtml(word)}</span>`
      : escHtml(word)
    lastIndex = re.lastIndex
  }
  html += escHtml(text.slice(lastIndex))
  return html
}

function showReadingPassage() {
  const passage = readingSession[readingPassageIdx]
  const total   = readingSession.length
  $('reading-passage-counter').textContent      = `Passage ${readingPassageIdx + 1} of ${total}`
  $('reading-passage-progress').style.width     = `${(readingPassageIdx / total) * 100}%`
  $('reading-passage-text').innerHTML           = renderHoverablePassage(passage.text)
  showScreen('reading-passage-screen')
}

function beginReadingQuestions() {
  readingQuestionIdx = 0
  const passage = readingSession[readingPassageIdx]
  readingResults.push({ passage, answers: Array(passage.questions.length).fill(-1) })
  showReadingQuestion()
}

function showReadingQuestion() {
  const passage  = readingSession[readingPassageIdx]
  const question = passage.questions[readingQuestionIdx]
  const qTotal   = passage.questions.length

  $('reading-question-passage').textContent  = passage.text
  $('reading-question-text').textContent     = question.question
  $('reading-question-counter').textContent  = `Question ${readingQuestionIdx + 1} of ${qTotal}`

  const grid = $('reading-choices-grid')
  grid.innerHTML = ''
  question.choices.forEach((choice, i) => {
    const btn = document.createElement('button')
    btn.className   = 'reading-choice-btn'
    btn.textContent = choice
    btn.addEventListener('click', () => submitReadingAnswer(i))
    grid.appendChild(btn)
  })

  showScreen('reading-question-screen')
}

function submitReadingAnswer(chosenIdx) {
  if (rdAutoAdvTimer) return
  const passage  = readingSession[readingPassageIdx]
  const question = passage.questions[readingQuestionIdx]
  const correct  = question.answer
  const result   = readingResults[readingResults.length - 1]
  result.answers[readingQuestionIdx] = chosenIdx

  const btns = $('reading-choices-grid').querySelectorAll('.reading-choice-btn')
  btns.forEach(btn => btn.disabled = true)
  btns[correct].classList.add('reading-choice-correct')
  if (chosenIdx !== correct) btns[chosenIdx].classList.add('reading-choice-wrong')

  const isLastQuestion = readingQuestionIdx >= passage.questions.length - 1
  rdAutoAdvTimer = setTimeout(() => {
    rdAutoAdvTimer = null
    if (isLastQuestion) {
      readingPassageIdx++
      if (readingPassageIdx >= readingSession.length) {
        showReadingScore()
      } else {
        showReadingPassage()
      }
    } else {
      readingQuestionIdx++
      showReadingQuestion()
    }
  }, 1500)
}

function showReadingScore() {
  let correct = 0, total = 0
  for (const r of readingResults) {
    for (let i = 0; i < r.passage.questions.length; i++) {
      total++
      if (r.answers[i] === r.passage.questions[i].answer) correct++
    }
  }
  const pct = total > 0 ? Math.round((correct / total) * 100) : 0
  $('reading-score-pct').textContent      = `${pct}%`
  $('reading-stat-correct').textContent   = correct
  $('reading-stat-total').textContent     = total
  $('reading-stat-passages').textContent  = readingResults.length
  showScreen('reading-score-screen')
}

function showReadingReview() {
  const container = $('reading-review-content')
  container.innerHTML = ''

  readingResults.forEach((r, pi) => {
    const block = document.createElement('div')
    block.className = 'review-passage-block'

    const heading = document.createElement('div')
    heading.className   = 'review-passage-heading'
    heading.textContent = `Passage ${pi + 1}`
    block.appendChild(heading)

    const textEl = document.createElement('div')
    textEl.className   = 'review-passage-text'
    textEl.textContent = r.passage.text
    block.appendChild(textEl)

    r.passage.questions.forEach((q, qi) => {
      const chosen  = r.answers[qi]
      const correct = q.answer
      const isRight = chosen === correct

      const qBlock = document.createElement('div')
      qBlock.className = 'review-question-block'

      const verdict = document.createElement('span')
      verdict.className   = `review-verdict ${isRight ? 'review-verdict-correct' : 'review-verdict-wrong'}`
      verdict.textContent = isRight ? '✓ Correct' : '✗ Incorrect'

      const qText = document.createElement('p')
      qText.className   = 'review-question-text'
      qText.appendChild(verdict)
      qText.appendChild(document.createTextNode(' ' + q.question))
      qBlock.appendChild(qText)

      q.choices.forEach((choice, ci) => {
        const cEl = document.createElement('div')
        cEl.textContent = choice
        if (ci === correct)          cEl.className = 'review-choice review-choice-correct'
        else if (ci === chosen)      cEl.className = 'review-choice review-choice-wrong'
        else                         cEl.className = 'review-choice'
        qBlock.appendChild(cEl)
      })

      block.appendChild(qBlock)
    })

    container.appendChild(block)
  })

  showScreen('reading-review-screen')
}
