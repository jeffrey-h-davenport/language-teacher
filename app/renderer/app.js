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
let contextHintUsed = false   // the note was opened before answering (a hint: no point)
let currentQ       = null   // { word, showNative, choices }
let currentMeta    = null   // { language, languageCode, nativeLanguage, targetField }
let pictureLibrary = {}     // { name: svg markup } from language-data/images, shared by all languages
let currentScript  = null   // { scriptName, intro, sections: [{heading, items: [{char, ipa, note}]}] } or null
let sessionScore   = 0
let sessionCorrect = 0
let sessionTotal   = 0
let sessionResults = []
let introWords     = []   // this session's brand-new words, introduced before the quiz
let introIndex     = 0
let introMode      = 'new'  // 'new' (before a session's quiz) or 'review' (opened from the quiz)
let savedIntro     = null   // the session's intro words, kept while a review borrows the intro screen
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
  { id: 'target',       label: 'Word',          default: true,  render: w => `<bdi>${escHtml(formatTarget(w))}</bdi>` },
  { id: 'english',      label: 'English',       default: true,  render: w => escHtml(w.english || '') },
  { id: 'pos',          label: 'Part of Speech', default: true, render: w => `<span class="pos-badge">${escHtml((w['part-of-speech'] || '').slice(0, 8))}</span>` },
  { id: 'cefr',         label: 'CEFR Level',    default: true,  render: w => `<span class="cefr-badge cefr-${escHtml(w.cefr || '')}">${escHtml(w.cefr || '—')}</span>` },
  { id: 'score',        label: 'Score',         default: true,  learnerOnly: true, render: w => escHtml(w.learned ? '✓ Learned' : (w.score > 0 ? `${w.score} / ${learnedThreshold()}` : '—')) },
  { id: 'gender',       label: 'Gender',        default: false, render: w => escHtml(w.gender || '—') },
  { id: 'register',     label: 'Register',      default: false, render: w => escHtml((w.register && w.register.length ? w.register : ['All']).join(', ')) },
  { id: 'ipa',          label: 'IPA',           default: false, render: w => escHtml(formatPronunciation(w) || '—') },
  { id: 'grammar',      label: 'Grammar',       default: false, render: w => escHtml(w.grammar || '—') },
  { id: 'context',      label: 'Context',       default: false, render: w => escHtml(isolateRTL(w.context) || '—') },
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
let readingVocabById = null
let readingTargetField = null
let readingHoverIndex = null      // Map<lowercased surface form, {english, isBase}> for word-hover hints
const BASE_POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'pronoun', 'preposition', 'postposition', 'conjunction', 'interjection', 'article'])

// ── Language Data ─────────────────────────────────────
const FLAGS = {
  'mr': '🇮🇳',
  'bn': '🇧🇩',
  'af': '🇿🇦', 'ar': '🇸🇦', 'cs': '🇨🇿', 'da': '🇩🇰',
  'de': '🇩🇪', 'el': '🇬🇷', 'es': '🇪🇸', 'fi': '🇫🇮',
  'fr': '🇫🇷', 'he': '🇮🇱', 'hi': '🇮🇳', 'hr': '🇭🇷',
  'hu': '🇭🇺', 'id': '🇮🇩', 'it': '🇮🇹', 'ja': '🇯🇵',
  'ko': '🇰🇷', 'nl': '🇳🇱', 'no': '🇳🇴', 'pl': '🇵🇱',
  'pt': '🇵🇹', 'pt-br': '🇧🇷', 'ro': '🇷🇴', 'ru': '🇷🇺',
  'sk': '🇸🇰', 'sv': '🇸🇪', 'sw': '🇹🇿', 'th': '🇹🇭', 'tr': '🇹🇷',
  'uk': '🇺🇦', 'vi': '🇻🇳', 'zh': '🇨🇳', 'zh-tw': '🇹🇼',
}

// French vowel-initial words that trigger elision (le/la → l')
// Languages whose ARTICLES entry holds the indefinite article (a/an).
const INDEFINITE_ARTICLE_LANGS = new Set(['sv', 'no', 'da', 'ro'])
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
  'no': { masculine: 'en',  feminine: 'ei',  neuter: 'et' },
  'da': { common: 'en',     neuter: 'et' },
  'ro': { masculine: 'un',  feminine: 'o',   neuter: 'un' },
}

// Register choices by language code, from most elevated to most informal —
// each language's own established system, taken from the usage labels of its
// standard dictionary (Duden, Le Robert, DLE, SSJČ, Kielitoimiston sanakirja,
// Svensk ordbok, NAOB, Den Danske Ordbog, Van Dale, Treccani, Priberam, PWN,
// Ozhegov, SUM, DEX, HJP, ÉrtSz, TDK, KBBI, 現代漢語詞典, 표준국어대사전, Hoàng Phê's Từ điển tiếng Việt …).
// Each value is stored on words in the language's own term and carries an
// English gloss for the editor, the Browse filter and card tooltips.
// 'All' is universal and always prepended — it's the default, and selecting
// it clears any specific selections (and vice versa).
const REGISTER_OPTIONS = {
  'de': [['gehoben', 'elevated'], ['bildungssprachlich', 'educated'], ['normalsprachlich', 'neutral'], ['umgangssprachlich', 'colloquial'],
         ['salopp', 'slangy, casual'], ['derb', 'coarse'], ['vulgär', 'vulgar']],
  'fr': [['littéraire', 'literary'], ['soutenu', 'formal'], ['courant', 'neutral'], ['familier', 'colloquial'],
         ['populaire', 'working-class, casual'], ['argotique', 'slang'], ['vulgaire', 'vulgar']],
  'es': [['culto', 'formal, educated'], ['estándar', 'neutral'], ['coloquial', 'colloquial'], ['jergal', 'slang'], ['vulgar', 'vulgar']],
  'pt': [['literário', 'literary'], ['formal', 'formal'], ['corrente', 'neutral'], ['coloquial', 'colloquial'],
         ['popular', 'working-class, casual'], ['calão', 'slang'], ['vulgar', 'vulgar']],
  'it': [['letterario', 'literary'], ['sostenuto', 'formal'], ['neutro', 'neutral'], ['colloquiale', 'colloquial'],
         ['familiare', 'familiar'], ['popolare', 'working-class, casual'], ['gergale', 'slang'], ['volgare', 'vulgar']],
  'ro': [['livresc', 'bookish'], ['oficial', 'official'], ['neutru', 'neutral'], ['familiar', 'colloquial'],
         ['popular', 'folk, casual'], ['argotic', 'slang'], ['vulgar', 'vulgar']],
  'nl': [['verheven', 'elevated'], ['formeel', 'formal'], ['neutraal', 'neutral'], ['informeel', 'informal'],
         ['spreektaal', 'colloquial'], ['plat', 'coarse, vulgar']],
  'sv': [['högtidligt', 'elevated'], ['formellt', 'formal'], ['neutralt', 'neutral'], ['vardagligt', 'colloquial'],
         ['slang', 'slang'], ['vulgärt', 'vulgar']],
  'no': [['høytidelig', 'elevated'], ['formelt', 'formal'], ['nøytralt', 'neutral'], ['muntlig', 'colloquial'],
         ['slang', 'slang'], ['vulgært', 'vulgar']],
  'da': [['højtideligt', 'elevated'], ['formelt', 'formal'], ['neutralt', 'neutral'], ['uformelt', 'informal'],
         ['slang', 'slang'], ['vulgært', 'vulgar']],
  'fi': [['ylätyyli', 'elevated'], ['kirjakieli', 'formal written'], ['yleiskieli', 'neutral'], ['arkikieli', 'colloquial'],
         ['slangi', 'slang'], ['alatyyli', 'vulgar']],
  'cs': [['knižní', 'bookish'], ['spisovná', 'standard'], ['hovorová', 'colloquial standard'], ['obecná', 'common Czech, casual'],
         ['slangová', 'slang'], ['vulgární', 'vulgar']],
  'pl': [['książkowy', 'bookish'], ['urzędowy', 'official'], ['neutralny', 'neutral'], ['potoczny', 'colloquial'],
         ['środowiskowy', 'slang, jargon'], ['wulgarny', 'vulgar']],
  'ru': [['книжное', 'bookish'], ['официальное', 'official'], ['нейтральное', 'neutral'], ['разговорное', 'colloquial'],
         ['просторечное', 'substandard'], ['жаргонное', 'slang'], ['грубое', 'coarse, vulgar']],
  'uk': [['книжне', 'bookish'], ['офіційне', 'official'], ['нейтральне', 'neutral'], ['розмовне', 'colloquial'],
         ['просторічне', 'substandard'], ['жаргонне', 'slang'], ['вульгарне', 'vulgar']],
  'sh': [['knjiški', 'bookish'], ['službeni', 'official'], ['neutralni', 'neutral'], ['razgovorni', 'colloquial'],
         ['žargonski', 'slang'], ['vulgarni', 'vulgar']],
  'hu': [['választékos', 'refined'], ['hivatalos', 'official'], ['semleges', 'neutral'], ['bizalmas', 'familiar'],
         ['szleng', 'slang'], ['durva', 'coarse, vulgar']],
  'tr': [['edebî', 'literary'], ['resmî', 'formal'], ['standart', 'neutral'], ['konuşma dili', 'colloquial'],
         ['argo', 'slang'], ['kaba', 'vulgar']],
  'ar': [['كلاسيكي', 'Classical'], ['أدبي', 'literary'], ['رسمي', 'formal'], ['محايد', 'neutral'],
         ['عامي', 'colloquial'], ['سوقي', 'vulgar']],
  'he': [['ספרותי', 'literary'], ['רשמי', 'formal'], ['תקני', 'neutral'], ['דיבורי', 'colloquial'],
         ['סלנג', 'slang'], ['גס', 'vulgar']],
  'hi': [['साहित्यिक', 'literary'], ['औपचारिक', 'formal'], ['मानक', 'standard'], ['बोलचाल', 'colloquial'],
         ['अपशब्द', 'vulgar, abusive']],
  'mr': [['ग्रांथिक', 'bookish'], ['औपचारिक', 'formal'], ['प्रमाण', 'standard'], ['बोलीभाषा', 'colloquial'],
         ['अपशब्द', 'vulgar, abusive']],
  'bn': [['সাধু', 'sadhu (formal literary)'], ['আনুষ্ঠানিক', 'formal'], ['চলিত', 'standard colloquial'], ['ঘরোয়া', 'informal'],
         ['আঞ্চলিক', 'regional'], ['অপভাষা', 'slang'], ['অশ্লীল', 'vulgar']],
  'id': [['sastra', 'literary'], ['hormat', 'respectful'], ['baku', 'standard'], ['cakapan', 'colloquial'],
         ['gaul', 'slang'], ['kasar', 'coarse']],
  'sw': [['kifasihi', 'literary'], ['rasmi', 'formal'], ['sanifu', 'standard'], ['mazungumzo', 'colloquial'],
         ['Sheng', 'Sheng (urban slang)'], ['matusi', 'vulgar']],
  'ja': [['文語', 'literary'], ['尊敬語', 'honorific'], ['謙譲語', 'humble'], ['丁寧語', 'polite'], ['普通', 'neutral'],
         ['くだけた', 'casual'], ['俗語', 'slang'], ['卑語', 'vulgar']],
  'ko': [['문어', 'written'], ['높임말', 'honorific'], ['예사말', 'neutral'], ['구어', 'spoken'], ['속어', 'slang'], ['비속어', 'vulgar']],
  'vi': [['văn chương', 'literary'], ['trang trọng', 'formal'], ['trung tính', 'neutral'], ['khẩu ngữ', 'colloquial'],
         ['thông tục', 'vulgar, coarse'], ['phương ngữ', 'regional']],
  'zh': [['书面语', 'written, formal'], ['敬辞', 'honorific'], ['谦辞', 'humble'], ['中性', 'neutral'], ['口语', 'colloquial'],
         ['方言', 'dialect'], ['俚语', 'slang'], ['詈语', 'abusive']],
}
// Where each language's formality scale is neutral, and which of its
// registers are categories rather than levels on that scale. A word is
// marked with every register in which it sounds natural; 'All' is shorthand
// for all of them. A word restricted to one side of the scale covers a
// contiguous stretch of it: an elevated word runs from the top down to its
// level, a colloquial word from its level down to the bottom.
const REGISTER_NEUTRAL = {
  de: 'normalsprachlich', fr: 'courant', es: 'estándar', pt: 'corrente', it: 'neutro', ro: 'neutru', nl: 'neutraal',
  sv: 'neutralt', no: 'nøytralt', da: 'neutralt', fi: 'yleiskieli', cs: 'spisovná', pl: 'neutralny', ru: 'нейтральное',
  uk: 'нейтральне', sh: 'neutralni', hu: 'semleges', tr: 'standart', ar: 'محايد', he: 'תקני', hi: 'मानक', mr: 'प्रमाण',
  bn: 'চলিত', id: 'baku', sw: 'sanifu', ja: '普通', ko: '예사말', zh: '中性', vi: 'trung tính',
}
const REGISTER_CATEGORIES = {
  ja: ['尊敬語', '謙譲語'], ko: ['높임말'], zh: ['敬辞', '谦辞', '方言'], bn: ['আঞ্চলিক'], vi: ['phương ngữ'],
}
// A word's registers as shown on a card: every register it is marked with,
// in scale order from most elevated to most informal, categories after.
// (A range like "familier – vulgaire" read as if the word were vulgar.)
function formatRegisters(langCode, registers) {
  const scale = (REGISTER_OPTIONS[langCode] || []).map(([v]) => v).filter(v => !(REGISTER_CATEGORIES[langCode] || []).includes(v))
  const onScale = registers.filter(r => scale.includes(r)).sort((a, b) => scale.indexOf(a) - scale.indexOf(b))
  const others  = registers.filter(r => !scale.includes(r))
  return [...onScale, ...others].join(', ')
}

// A register value's English gloss for the current language ('' if unknown).
function registerGloss(langCode, value) {
  const hit = (REGISTER_OPTIONS[langCode] || []).find(([v]) => v === value)
  return hit ? hit[1] : ''
}
function currentLangCode() { return currentMeta?.languageCode?.toLowerCase() }

// ── Helpers ──────────────────────────────────────────
function $(id) { return document.getElementById(id) }

// Some IPA diacritics (e.g. the combining mark for Korean's tense/fortis
// consonants) are correct but tiny at UI sizes — small enough that two
// otherwise-distinct choices (like ㅂ "/p/" vs ㅃ "/p͈/") can look identical.
// Rather than swap in a bigger but less accurate symbol, render each
// base-letter-plus-combining-mark cluster a bit larger so the mark is
// actually visible, leaving the underlying text (and transcription)
// untouched.
// Only marks on Latin or Greek letters (which is where every IPA symbol
// lives) are enlarged. Scripts such as Bengali and Devanagari use the same
// kind of combining mark for ordinary vowel signs and conjuncts; enlarging
// those blows up random syllables and can break how the letters join.
const COMBINING_MARK = /\p{Mn}/u
const IPA_BASE = /[\p{Script=Latin}\p{Script=Greek}]/u

// English text that quotes Hebrew or Arabic ("feminine: טובה (tova)") needs
// each right-to-left run isolated, or the bidi algorithm drags neighbouring
// brackets and punctuation into it and scrambles the line. Wraps every RTL
// run (words joined by spaces or punctuation) in RLI … PDI marks.
const RTL_RUN = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]+(?:[\s'"\-]+[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]+)*/g
function isolateRTL(text) {
  return text ? String(text).replace(RTL_RUN, run => '\u2067' + run + '\u2069') : text
}
function setEmphasizedText(el, text) {
  el.textContent = ''
  // Each word picks its own direction from its first letter, so Hebrew and
  // Arabic read right to left while English stays left to right.
  el.dir = 'auto'
  // Plain runs are kept as one text node so letters that join (Bengali
  // conjuncts, Arabic) are shaped together.
  let plain = ''
  let i = 0
  while (i < text.length) {
    let cluster = text[i]
    let j = i + 1
    while (j < text.length && COMBINING_MARK.test(text[j])) {
      cluster += text[j]
      j++
    }
    if (cluster.length > 1 && IPA_BASE.test(cluster[0])) {
      if (plain) { el.appendChild(document.createTextNode(plain)); plain = '' }
      const mark = document.createElement('span')
      mark.className = 'ipa-mark-cluster'
      mark.textContent = cluster
      el.appendChild(mark)
    } else {
      plain += cluster
    }
    i = j
  }
  if (plain) el.appendChild(document.createTextNode(plain))
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

// Languages with no single national flag get a small image instead — e.g.
// Serbo-Croatian shows an outline of the region where it's spoken.
const LANGUAGE_ICONS = {
  'sh': 'icons/serbo-croatian.svg',
  'ar': 'icons/arabic.svg',
}

// A node for a language's flag: an <img> when it has an icon, otherwise the
// emoji as text.
function flagNode(code) {
  const icon = code && LANGUAGE_ICONS[code.toLowerCase()]
  if (!icon) return document.createTextNode(flagFor(code))
  const img = document.createElement('img')
  img.src = icon
  img.className = 'flag-icon'
  img.alt = ''
  return img
}

// Fill el with the flag followed by text (text should start with a space).
function setFlagAndText(el, code, text = '') {
  el.replaceChildren(flagNode(code), document.createTextNode(text))
}

function targetFieldName() {
  return currentMeta?.targetField || 'german'
}

// Tone lives separately from ipa (word.tone: one small integer per syllable,
// word.ipaSyllables: the ipa chunk each tone belongs to) so ipa stays a
// plain pronunciation string everywhere else in the app. Each tonal
// language has its own glyph set below:
//   zh — 0 = neutral, 1-4 = Mandarin's four tones
//   vi — 1 ngang, 2 huyền, 3 sắc, 4 hỏi, 5 ngã, 6 nặng (Hanoi)
// Dense contexts (the Browse table) get a plain-text form instead of the
// SVG glyphs: Mandarin tone digits after the word, or Vietnamese Chao
// pitch letters after each syllable.
const TONE_SETS = {
  zh: {
    text: { 0: '', 1: '¹', 2: '²', 3: '³', 4: '⁴' },
    glyphs: {
      1: { color: '#3B7DD8', d: 'M4,9 L26,9' },
      2: { color: '#2FA66B', d: 'M4,16 L26,4' },
      3: { color: '#8B5CF6', d: 'M4,8 C11,19 19,19 26,4' },
      4: { color: '#E24C4C', d: 'M4,4 L26,18' },
    },
  },
  vi: {
    perSyllable: true,   // syllables are written apart, each with its own pitch letters
    text: { 1: '˧˧', 2: '˨˩', 3: '˧˦', 4: '˧˩', 5: '˦ˀ˥', 6: '˧˨ʔ' },
    glyphs: {
      1: { color: '#3B7DD8', d: 'M4,10 L26,10' },                 // ngang: mid, level
      2: { color: '#0E9AA7', d: 'M4,11 L26,17' },                 // huyền: low, falling gently
      3: { color: '#2FA66B', d: 'M4,13 L26,4' },                  // sắc: rising
      4: { color: '#8B5CF6', d: 'M4,9 C12,19 19,19 26,13' },      // hỏi: dipping
      5: { color: '#E08A1E', d: 'M4,11 L12,8 M17,9 L26,3' },      // ngã: rising, broken by a catch
      6: { color: '#E24C4C', d: 'M4,11 L17,17 M23,17 L23,17' },   // nặng: low, cut off by a stop
    },
  },
}
function toneSet(lang = currentMeta?.languageCode) {
  return TONE_SETS[lang] || TONE_SETS.zh
}
function formatPronunciation(word) {
  if (!word.ipa) return ''
  if (!word.tone || !word.tone.length) return word.ipa
  const set = toneSet()
  if (set.perSyllable && word.ipaSyllables?.length === word.tone.length) {
    return '[' + word.ipaSyllables.map((syl, i) => syl + (set.text[word.tone[i]] || '')).join(' ') + ']'
  }
  return word.ipa + word.tone.map(t => set.text[t] || '').join('')
}

// ── Tone glyphs (Mandarin, Vietnamese) ──────────────
// A contour sparkline over each syllable's own ipa chunk, colored per tone —
// the glyph rides with the pronunciation text (word.ipaSyllables), not with
// the written word itself.
const SVG_NS = 'http://www.w3.org/2000/svg'

function toneSvg(tone) {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', '0 0 30 20')
  svg.setAttribute('width', '20')
  svg.setAttribute('height', '13')
  const glyph = toneSet().glyphs[tone]
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
// to plain ipa text — every language except Chinese and Vietnamese.
function buildToneBracket(word) {
  if (!word.ipaSyllables || !word.tone || word.ipaSyllables.length !== word.tone.length) return null
  const wrap = document.createElement('span')
  wrap.className = 'tone-bracket'
  if (toneSet().perSyllable) wrap.classList.add('tone-bracket-spaced')
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
// when available (Chinese, Vietnamese), otherwise plain ipa text (unchanged behavior
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
  if (code === 'it') return italianArticle(word)
  const map  = ARTICLES[code] || {}
  if (word.countability === 'plural-only') {
    if (word.gender === 'feminine' && map.pluralFeminine) return map.pluralFeminine
    return map.plural ?? ''
  }
  if (!word.gender) return ''
  // Indefinite articles ("a/an") don't go with uncountable nouns
  // (Danish mad, not "en mad"; Romanian apă, not "o apă").
  if (word.countability === 'mass' && INDEFINITE_ARTICLE_LANGS.has(code)) return ''

  // French elision: le/la → l' before vowel-initial words or h muet
  if (code === 'fr') {
    const tf    = targetFieldName()
    const first = (word[tf] || '')[0]?.toLowerCase() || ''
    if (ELISION_STARTERS.has(first) || (first === 'h' && word.hMuet)) return "l'"
  }

  return map[word.gender] ?? ''
}

// Italian picks its article from how the noun begins, not just its gender:
// l' before a vowel, lo / gli before s + consonant, z, gn, ps, pn, x, y.
const IT_LO_START = /^(s[^aeiouàèéìòóù]|z|gn|ps|pn|x|y)/
const IT_VOWEL_START = /^[aeiouàèéìòóù]/
function italianArticle(word) {
  if (!word.gender) return ''
  const pluralOnly = word.countability === 'plural-only'
  const text = ((pluralOnly ? word.plural : null) || word[targetFieldName()] || '').toLowerCase()
  const vowel = IT_VOWEL_START.test(text)
  const lo    = IT_LO_START.test(text)
  if (word.gender === 'feminine') return pluralOnly ? 'le' : (vowel ? "l'" : 'la')
  if (pluralOnly) return (vowel || lo) ? 'gli' : 'i'
  return vowel ? "l'" : (lo ? 'lo' : 'il')
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
  setFlagAndText($('welcome-flag'), currentMeta?.languageCode)
  // The tagline itself is fixed (set in index.html) — it doesn't name the
  // language last studied.
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
// Declined and conjugated forms carry a `baseId` linking them back to their
// dictionary word (the nominative singular, or for verbs the infinitive).
// Before a form is freshly introduced:
//   1) its base word must already be learned (no endings before the word itself)
//   2) if it's a plural case, the matching singular case must already be
//      learned too (no plural forms before their corresponding singular forms)
//   3) if it's a gendered form (adjectives, and gender-declining pronouns like
//      "ten"/"můj"), the masculine form of the same case/number must already
//      be learned too (masculine before feminine or neuter)
// A candidate that fails any rule is swapped for the specific prerequisite
// form it's missing — never for an unrelated word. Resolution recurses since
// satisfying rule 3 can surface a form that itself still needs rule 2 (or
// vice versa) before it's a valid next step.
const GATED_DECLENSION_TYPES = ['noun-declension', 'pronoun-declension', 'adjective-declension', 'verb-conjugation']

function resolveDeclensionGate(word) {
  if (!GATED_DECLENSION_TYPES.includes(word['part-of-speech']) || !word.baseId) return word
  const base = wordById(word.baseId)
  if (!base) return word

  if (!base.learned) return base

  const grammar = word.grammar || ''

  const genderMatch = grammar.match(/^(masc|fem|neut)\.,\s*(.+)$/)
  if (genderMatch && genderMatch[1] !== 'masc') {
    const mascGrammar = `masc., ${genderMatch[2]}`
    const mascCounterpart = formOf(word.baseId, mascGrammar)
    if (mascCounterpart && !mascCounterpart.learned) return resolveDeclensionGate(mascCounterpart)
  }

  if (grammar.endsWith(' pl') && grammar !== 'nominative pl') {
    const sgGrammar = grammar.slice(0, -3) + ' sg'
    const sgCounterpart = formOf(word.baseId, sgGrammar)
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
// ── Word families ─────────────────────────────────────
// Declension and conjugation entries point at their dictionary word through
// baseId (stored in the vocabulary file). The reverse index — dictionary word
// → its forms — is built once per load, and rebuilt lazily after the editor
// adds words.
// Alongside it, two lookup tables — words by id, and forms by (baseId,
// grammar) — so the session-selection rules don't scan every word for each
// candidate. With Czech's ~135,000 entries those scans made choosing a
// session's words take several seconds.
let wordFamilies = null
let wordsById = null
let formsByBaseAndGrammar = null
function buildWordIndexes() {
  wordFamilies = new Map()
  wordsById = new Map()
  formsByBaseAndGrammar = new Map()
  for (const w of allWords) {
    wordsById.set(w.id, w)
    if (!w.baseId) continue
    if (!wordFamilies.has(w.baseId)) wordFamilies.set(w.baseId, [])
    wordFamilies.get(w.baseId).push(w)
    const key = w.baseId + '\u0000' + (w.grammar || '')
    if (!formsByBaseAndGrammar.has(key)) formsByBaseAndGrammar.set(key, w)
  }
}
function familyIndex() {
  if (!wordFamilies) buildWordIndexes()
  return wordFamilies
}
function wordById(id) {
  if (!wordFamilies) buildWordIndexes()
  return wordsById.get(id)
}
function formOf(baseId, grammar) {
  if (!wordFamilies) buildWordIndexes()
  return formsByBaseAndGrammar.get(baseId + '\u0000' + grammar)
}

// The other members of a form's family: its sibling forms plus the
// dictionary word itself (the nominative or infinitive). Empty for words
// that aren't forms of anything.
function familyOf(word) {
  if (!word.baseId) return []
  const base = wordById(word.baseId)
  const members = [...(familyIndex().get(word.baseId) || [])]
  if (base) members.push(base)
  return members.filter(w => w.id !== word.id)
}

// ── Pictures ──────────────────────────────────────────
// A word's "image" names an SVG in the shared picture library. The markup is
// parsed and cleaned before it goes into the page (no scripts, event
// handlers or outside links), then inlined so its strokes can take the
// text color through currentColor.
function picturesOn() {
  return preferences.usePictures !== false
}

function languageHasPictures() {
  return allWords.some(hasPicture)
}

function updatePictureToggle() {
  const btn = $('picture-toggle-btn')
  btn.classList.toggle('hidden', !languageHasPictures())
  btn.classList.toggle('active', picturesOn())
  btn.textContent = picturesOn() ? '🖼 Pictures' : '🔤 Words'
}

// Switching before answering swaps English and pictures on the current
// question and keeps its direction: an English prompt becomes the picture
// (same choices), English choices become pictures. A hint already used on
// this question still counts.
function togglePictures() {
  preferences.usePictures = !picturesOn()
  window.api.savePreferences(preferences)
  updatePictureToggle()
  const answered = !$('next-btn').classList.contains('hidden')
  if (!currentQ || answered || !hasPicture(currentQ.word) || currentQ.word.baseId) return
  const word   = wordById(currentQ.word.id)
  const hinted = contextHintUsed
  if (currentQ.showNative) {
    // Another choice drawn with the same picture would also be right once
    // the picture is the prompt, so redraw the choices in that case.
    const clash = picturesOn() && currentQ.choices.some(c => c.id !== word.id && c.image === word.image)
    currentQ = clash
      ? makeQuestion(word, { showNative: true })
      : { ...currentQ, mode: picturesOn() ? 'picture-prompt' : 'words' }
  } else {
    currentQ = makeQuestion(word, { showNative: false })
  }
  displayQuestion(currentQ)
  contextHintUsed = hinted
}

function hasPicture(word) {
  return !!(word && word.image && pictureLibrary[word.image])
}

function pictureElement(name) {
  const doc = new DOMParser().parseFromString(pictureLibrary[name] || '', 'image/svg+xml')
  const svg = doc.documentElement
  if (!svg || svg.nodeName !== 'svg') return document.createElement('span')
  svg.querySelectorAll('script, foreignObject, iframe').forEach(n => n.remove())
  for (const el of [svg, ...svg.querySelectorAll('*')]) {
    for (const attr of [...el.attributes]) {
      const n = attr.name.toLowerCase()
      if (n.startsWith('on') || ((n === 'href' || n === 'xlink:href') && !attr.value.startsWith('#'))) {
        el.removeAttribute(attr.name)
      }
    }
  }
  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.classList.add('picture')
  svg.setAttribute('aria-hidden', 'true')
  return document.importNode(svg, true)
}

// The Pictures switch replaces English with pictures wherever English
// would appear: a word-to-English question gets picture choices, and an
// English-to-word question gets the picture as its prompt. Wrong pictures
// can come from anywhere in the library, since a picture choice needs no
// word behind it. Forms of a word (which test endings, not meaning) and
// words without a picture keep English.
function canUsePicture(word) {
  return picturesOn() && hasPicture(word) && !word.baseId
}

// Wrong pictures come first from words of the same part of speech in this
// language, so a verb's picture isn't the only action among objects; the
// rest of the library fills in when there aren't enough.
function makePictureChoices(word) {
  const others = Object.keys(pictureLibrary).filter(n => n !== word.image)
  if (others.length < CHOICES_COUNT - 1) return null
  const pos = word['part-of-speech']
  const samePos = new Set(allWords
    .filter(w => w['part-of-speech'] === pos && hasPicture(w))
    .map(w => w.image))
  const preferred = shuffle(others.filter(n => samePos.has(n)))
  const rest      = shuffle(others.filter(n => !samePos.has(n)))
  const distractors = [...preferred, ...rest].slice(0, CHOICES_COUNT - 1)
    .map(name => ({ id: `picture:${name}`, image: name }))
  return { word, showNative: false, mode: 'picture-choices', choices: shuffle([word, ...distractors]) }
}

function makeQuestion(word, { showNative = Math.random() < 0.5 } = {}) {
  if (!showNative && canUsePicture(word)) {
    const q = makePictureChoices(word)
    if (q) return q
  }
  const pictureprompt = showNative && canUsePicture(word)
  const mode   = pictureprompt ? 'picture-prompt' : 'words'
  const label  = w => showNative ? formatTarget(w) : w.english
  const prompt = w => showNative ? w.english : formatTarget(w)
  // With a picture as the question, another word drawn with the same
  // picture would also be a right answer.
  const usable = w => !pictureprompt || w.image !== word.image

  // A declined or conjugated form is quizzed against the other forms of the
  // same word, so the question tests the ending, not the vocabulary. There
  // may be fewer than CHOICES_COUNT of them; then fewer buttons are shown.
  // A sibling that reads the same as the question (Czech hradu is both
  // genitive and dative) would also be a right answer, so it's left out.
  // Forms can list alternatives ("hradě / hradu"), so two forms clash if they
  // share any alternative, not only when the whole strings match.
  const family = familyOf(word)
  if (family.length > 0) {
    const alts    = text => String(text).split(' / ').map(t => t.trim())
    const overlap = (a, b) => alts(a).some(x => alts(b).includes(x))
    const taken = [label(word)]
    const distractors = []
    for (const w of shuffle(family)) {
      if (distractors.length >= CHOICES_COUNT - 1) break
      const lbl = label(w)
      if (taken.some(t => overlap(t, lbl)) || overlap(prompt(w), prompt(word))) continue
      taken.push(lbl)
      distractors.push(w)
    }
    if (distractors.length > 0) {
      return { word, showNative, mode, choices: shuffle([word, ...distractors]) }
    }
  }

  const samePOS = allWords.filter(
    w => w['part-of-speech'] === word['part-of-speech'] && w.id !== word.id && usable(w)
  )
  const pool = samePOS.length >= CHOICES_COUNT - 1
    ? samePOS
    : allWords.filter(w => w.id !== word.id && usable(w))

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
    for (const w of shuffle(allWords.filter(w => w.id !== word.id && usable(w)))) {
      if (distractors.length >= CHOICES_COUNT - 1) break
      const lbl = label(w)
      if (!seen.has(lbl)) {
        seen.add(lbl)
        distractors.push(w)
      }
    }
  }

  return { word, showNative, mode, choices: shuffle([word, ...distractors]) }
}

// ── Display a Question ────────────────────────────────
function displayQuestion(q) {
  const { word, showNative, choices } = q
  const mode = q.mode || 'words'

  const nativeLang = currentMeta?.nativeLanguage || 'English'
  const targetLang = currentMeta?.language       || 'Target'
  const fromLang = mode === 'picture-prompt' ? 'Picture' : showNative ? nativeLang : targetLang
  const toLang   = mode === 'picture-choices' ? 'Picture' : showNative ? targetLang : nativeLang
  setFlagAndText($('direction-badge'), currentMeta?.languageCode, `\u00a0 ${fromLang} → ${toLang}`)

  const level = currentCefrLevel()
  $('cefr-level-chip').textContent = level ? `Level ${level}` : '✓ All'

  const display = $('word-display')
  display.classList.toggle('word-display-picture', mode === 'picture-prompt')
  if (mode === 'picture-prompt') display.replaceChildren(pictureElement(word.image))
  else setEmphasizedText(display, showNative ? word.english : formatTarget(word))

  // Register only describes the target-language word, so it's shown alongside
  // it (like IPA) — not when English is the head word and the target is hidden.
  const registers = word.register && word.register.length ? word.register : ['All']
  const showRegister = !showNative && !(registers.length === 1 && registers[0] === 'All')
  $('word-register').classList.toggle('hidden', !showRegister)
  $('word-register').textContent = showRegister ? formatRegisters(currentLangCode(), registers) : ''
  $('word-register').title = showRegister ? registers.map(r => registerGloss(currentLangCode(), r)).filter(Boolean).join(', ') : ''

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

  // The note often contains the answer (an example with its translation),
  // so before answering it is a hint: opening it means a correct answer
  // earns no point. After answering it opens by itself.
  contextHintUsed = false
  if (word.context?.trim()) {
    $('context-area').classList.remove('hidden')
    $('context-reveal-btn').classList.remove('hidden')
    $('context-text').classList.add('hidden')
    $('context-text').textContent = isolateRTL(word.context)
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
  grid.classList.toggle('picture-choices', mode === 'picture-choices')
  grid.style.setProperty('--non-latin-scale', (currentScript && currentScript.fontScale) || 1.25)
  choices.forEach(choice => {
    const btn   = document.createElement('button')
    btn.className  = 'choice-btn'
    btn.dataset.id = choice.id
    if (mode === 'picture-choices') {
      btn.appendChild(pictureElement(choice.image))
      btn.addEventListener('click', () => handleChoice(btn, choice))
      grid.appendChild(btn)
      return
    }
    const label = showNative ? formatTarget(choice) : choice.english
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

  updatePictureToggle()
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
  const word    = wordById(currentQ.word.id)

  const prevScore = word.score
  const hinted    = correct && contextHintUsed
  if (hinted) {
    word.correctAttempts++
    sessionCorrect++
  } else if (correct) {
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
    nowLearned: word.learned,
    hinted
  })

  // The answer is out, so the note can no longer give it away.
  if (currentQ.word.context?.trim()) {
    $('context-reveal-btn').classList.add('hidden')
    $('context-text').classList.remove('hidden')
  }

  document.querySelectorAll('.choice-btn').forEach(b => {
    b.disabled = true
    if (b.dataset.id === currentQ.word.id) b.classList.add('correct')
    if (b === btn && !correct)             b.classList.add('incorrect')
  })

  const fb = $('feedback-bar')
  fb.className = `feedback-bar ${correct ? 'correct-fb' : 'incorrect-fb'}`
  $('feedback-icon').textContent = correct ? '✓' : '✗'
  if (correct) {
    const msg = hinted
      ? `Correct, but a hint was used, so no point this time (${word.score}/${learnedThreshold()} pts)`
      : word.score >= learnedThreshold()
      ? `Excellent! "${currentQ.word.english}" is now learned!`
      : `Correct! (${word.score}/${learnedThreshold()} pts)`
    $('feedback-text').textContent = msg
  } else {
    // With picture choices the right picture is highlighted; the English
    // meaning is safe to show now that the question is answered.
    const answer = currentQ.showNative
      ? formatTarget(currentQ.word)
      : currentQ.word.english
    // <bdi> keeps a right-to-left answer from reordering the English around it
    const bdi = document.createElement('bdi')
    bdi.textContent = answer
    $('feedback-text').replaceChildren('The answer was: ', bdi)
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
  const word = wordById(currentQ.word.id)
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
  for (const [value, gloss] of [['All', ''], ...options]) {
    const label = document.createElement('label')
    label.className = 'checkbox-label'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.value = value
    input.checked = selected.has(value)
    const span = document.createElement('span')
    span.textContent = gloss ? `${value} — ${gloss}` : value
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
  const word = wordById(currentQ.word.id)
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
  wordFamilies = null   // the grammar label is part of the form lookup key

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
        <bdi class="result-target">${formatTarget(r.word)}</bdi>
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
  introMode  = 'new'
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
  $('intro-register').textContent = showRegister ? formatRegisters(currentLangCode(), registers) : ''
  $('intro-register').title = showRegister ? registers.map(r => registerGloss(currentLangCode(), r)).filter(Boolean).join(', ') : ''

  renderPronunciationInto($('intro-ipa'), word)
  const countabilityTag = { mass: ' · mass', collective: ' · collective', 'plural-only': ' · plural only' }
  $('intro-pos').textContent = word['part-of-speech'] + (countabilityTag[word.countability] || '')
  $('intro-meaning').textContent = word.english
  const picture = hasPicture(word) ? pictureElement(word.image) : null
  $('intro-picture').classList.toggle('hidden', !picture)
  $('intro-picture').replaceChildren(...(picture ? [picture] : []))

  const grammar = word.grammar?.trim() || ''
  $('intro-grammar').classList.toggle('hidden', !grammar)
  $('intro-grammar').textContent = isolateRTL(grammar)

  const context = word.context?.trim() || ''
  $('intro-context').classList.toggle('hidden', !context)
  $('intro-context').textContent = isolateRTL(context)

  const review = introMode === 'review'
  $('intro-badge').textContent = review ? `📖 Review · ${word.learned ? 'learned' : `${word.score} / ${learnedThreshold()} pts`}` : '✨ New word'
  $('intro-quit-btn').classList.toggle('hidden', review)
  $('intro-skip-btn').textContent = review ? 'Back to Quiz' : 'Skip to Quiz'
  $('intro-back-btn').disabled = introIndex === 0
  $('intro-next-btn').textContent = isLast ? (review ? 'Back to Quiz →' : 'Start Quiz →') : 'Next Word →'
}

function nextIntroCard() {
  if (introIndex < introWords.length - 1) {
    introIndex++
    displayIntroCard()
  } else {
    leaveIntro()
  }
}

function leaveIntro() {
  if (introMode === 'review') closeReview()
  else startQuiz()
}

// ── Review ────────────────────────────────────────────
// Study cards for the words in the current session, the ones the quiz is
// asking about, weakest first. Opened before answering, the cards give the
// answer away, so it counts as a hint, the same as opening the note.
function learningWords() {
  return sessionWords
    .map(w => wordById(w.id))
    .filter(Boolean)
    .sort((a, b) => a.score - b.score || formatTarget(a).localeCompare(formatTarget(b)))
}

function openReview() {
  const words = learningWords()
  if (words.length === 0) return
  const answered = !$('next-btn').classList.contains('hidden')
  if (!answered) contextHintUsed = true
  clearTimeout(autoAdvanceTimer)
  autoAdvanceTimer = null
  savedIntro = { words: introWords, index: introIndex }
  introWords = words
  // Start at the word on screen when it's already answered, else at the top.
  const here = answered ? words.findIndex(w => w.id === currentQ.word.id) : -1
  introIndex = Math.max(here, 0)
  introMode  = 'review'
  displayIntroCard()
  showScreen('intro-screen')
}

function closeReview() {
  introWords = savedIntro ? savedIntro.words : []
  introIndex = savedIntro ? savedIntro.index : 0
  savedIntro = null
  introMode  = 'new'
  showScreen('quiz-screen')
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
    setFlagAndText(btn, entry.languageCode, ` ${entry.language}`)
    btn.title       = entry.language   // full name if the button truncates it
    // The editor only edits vocabulary, so it skips the mode picker
    // (quiz vs. reading) and goes straight to browsing the words.
    btn.addEventListener('click', () => {
      if (editorMode && entry.hasVocabulary) loadVocabulary(entry.slug)
      else renderModePicker(entry)
    })
    container.appendChild(btn)
  })
  const paged = entries.length > LANGUAGES_PER_PAGE
  $('language-viewport').classList.toggle('paged', paged)
  // Pad the last page with empty slots so every page is exactly one row of
  // LANGUAGES_PER_PAGE and paging always lands on a page boundary.
  if (paged) {
    const missing = (LANGUAGES_PER_PAGE - entries.length % LANGUAGES_PER_PAGE) % LANGUAGES_PER_PAGE
    for (let i = 0; i < missing; i++) {
      const filler = document.createElement('span')
      filler.className = 'lang-filler'
      filler.setAttribute('aria-hidden', 'true')
      container.appendChild(filler)
    }
  }
  languagePage = 0
  showLanguagePage()

  const toggle = $('language-picker-toggle')
  if (favorites.length === 0) {
    toggle.classList.add('hidden')
  } else {
    toggle.classList.remove('hidden')
    toggle.textContent = languagePickerShowAll ? 'Show favorites only' : 'Show all languages'
  }
}

// ── Language Carousel ─────────────────────────────────
// The picker shows one row of LANGUAGES_PER_PAGE buttons (sized in CSS);
// beyond that, the arrows page through the rest a full row at a time.
// The row slides with a CSS transform rather than scrolling: Electron's
// smooth programmatic scrolling inside an overflow:hidden box only moves once.
const LANGUAGES_PER_PAGE = 4
let languagePage = 0

function showLanguagePage() {
  const track = $('language-buttons')
  const items = track.children
  const paged = items.length > LANGUAGES_PER_PAGE
  const pages = Math.ceil(items.length / LANGUAGES_PER_PAGE)
  // One page = LANGUAGES_PER_PAGE buttons plus their gaps, measured from the
  // layout so it always matches the CSS.
  const stride = paged ? items[LANGUAGES_PER_PAGE].offsetLeft - items[0].offsetLeft : 0
  track.style.transform = `translateX(${-languagePage * stride}px)`
  $('language-prev').classList.toggle('hidden', !paged)
  $('language-next').classList.toggle('hidden', !paged)
  $('language-prev').disabled = languagePage <= 0
  $('language-next').disabled = languagePage >= pages - 1
}

function pageLanguages(direction) {
  const pages = Math.ceil($('language-buttons').children.length / LANGUAGES_PER_PAGE)
  languagePage = Math.max(0, Math.min(languagePage + direction, pages - 1))
  showLanguagePage()
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
  pictureLibrary = result.images || {}
  // Default targetField to lowercase language name if not specified
  if (!currentMeta.targetField && currentMeta.language) {
    currentMeta.targetField = currentMeta.language.toLowerCase()
  }
  const progressById = result.progress?.progress || {}
  allWords = (result.vocab.words || [])
    .map(word => ensureDefaults(Object.assign({}, word, progressById[word.id])))
  wordFamilies = null

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
// The guide button appears on both the word-intro and quiz screens.
function updateScriptGuideButton() {
  for (const id of ['script-guide-btn', 'intro-guide-btn']) {
    $(id).classList.toggle('hidden', !currentScript)
    // One name for every language, whatever the guide covers (script,
    // pronunciation, grammar); the guide's own title says what's inside.
    $(id).textContent = 'Language Guide'
  }
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
      p.textContent = isolateRTL(t)
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
      // charGlyph/ipaGlyph (optional, tonal languages) carry the same
      // {ipaSyllables, tone} shape buildToneBracket already draws for the
      // quiz screens — reused here so the guide shows the real contour
      // notation instead of a separately-maintained description of it.
      if (item.charGlyph) {
        char.appendChild(buildToneBracket(item.charGlyph))
        if (item.charSuffix) char.appendChild(document.createTextNode(' ' + item.charSuffix))
      } else {
        char.textContent = item.char
        char.dir = 'auto'
      }
      const ipa = document.createElement('div')
      ipa.className = 'script-char-ipa'
      if (item.ipaGlyph) {
        ipa.appendChild(buildToneBracket(item.ipaGlyph))
        if (item.ipaSuffix) ipa.appendChild(document.createTextNode(' ' + item.ipaSuffix))
      } else {
        ipa.textContent = isolateRTL(item.ipa)
      }
      cell.appendChild(char)
      cell.appendChild(ipa)
      if (item.note) {
        const note = document.createElement('div')
        note.className = 'script-char-note'
        note.textContent = isolateRTL(item.note)
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
      th.textContent = isolateRTL(c)
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
      td.textContent = isolateRTL(cell)
      // scriptColumns (optional): columns of letters in the guide's script,
      // shown larger — Arabic letter shapes are unreadable at table size
      if (table.scriptColumns?.includes(i)) td.classList.add('guide-script-cell')
      tr.appendChild(td)
    })
    tbody.appendChild(tr)
  }
  el.appendChild(tbody)
  wrap.appendChild(el)
  if (table.note) {
    const note = document.createElement('p')
    note.className = 'guide-table-note'
    note.textContent = isolateRTL(table.note)
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
    label.appendChild(flagNode(entry.languageCode))
    label.appendChild(document.createTextNode(` ${entry.language}`))
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
    [['All', ''], ...options].map(([v, gloss]) => `<option value="${escHtml(v)}">${escHtml(gloss ? `${v} — ${gloss}` : v)}</option>`).join('')
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
      // 'All' means natural in every register, so it matches any filter
      if (!wordRegisters.includes(register) && !wordRegisters.includes('All')) return false
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
    wordFamilies = null
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
  wordFamilies = null

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
  $('language-prev').addEventListener('click', () => pageLanguages(-1))
  $('language-next').addEventListener('click', () => pageLanguages(1))

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
  $('intro-skip-btn').addEventListener('click', leaveIntro)
  $('review-btn-quiz').addEventListener('click', openReview)
  $('picture-toggle-btn').addEventListener('click', togglePictures)

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
    contextHintUsed = true
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
  $('intro-guide-btn').addEventListener('click', showScriptGuide)
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
    wordFamilies = null
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
  const lang = readingMeta?.language || 'Reading'
  const n    = readingPassages.length
  setFlagAndText($('reading-lobby-flag'), readingMeta?.languageCode)
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
  readingVocabById = byId
  readingTargetField = targetField

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
      const key = variant.trim().toLowerCase().split(/\s+/).join(' ')
      if (!key) continue
      const existing = index.get(key)
      if (!existing || (!existing.isBase && isBase)) {
        index.set(key, { english: gloss, isBase })
      }
    }
  }
  return index
}

// Words of a passage, matched against the vocabulary. A word is a run of
// letters with their combining marks (so Devanagari and Bengali vowel signs
// stay inside the word); up to four space-separated words can form one entry
// (Vietnamese bệnh viện); and Chinese and Japanese, written without spaces,
// are split by longest match.
const READING_WORD = /[\p{L}\p{M}\p{Nd}]+(?:['’][\p{L}\p{M}]+)*/gu
const CJK_CHAR = /[぀-ヿ㐀-鿿]/u
function segmentPassage(text, has) {
  const toks = [...text.matchAll(READING_WORD)].map(m => ({ s: m[0], a: m.index, b: m.index + m[0].length }))
  const out = []   // { a, b, key|null }
  for (let i = 0; i < toks.length;) {
    const t = toks[i]
    if (CJK_CHAR.test(t.s)) {
      for (let j = 0; j < t.s.length;) {
        let n = Math.min(10, t.s.length - j)
        for (; n > 0; n--) if (has(t.s.slice(j, j + n).toLowerCase())) break
        const len = n || 1
        out.push({ a: t.a + j, b: t.a + j + len, key: n ? t.s.slice(j, j + len).toLowerCase() : null })
        j += len
      }
      i++
      continue
    }
    let hit = 0
    for (let n = Math.min(4, toks.length - i); n > 0 && !hit; n--) {
      const span = toks.slice(i, i + n)
      if (span.some((x, k) => k > 0 && text.slice(span[k - 1].b, x.a).trim() !== '')) continue
      const key = span.map(x => x.s.normalize('NFC').toLowerCase()).join(' ')
      if (has(key)) { out.push({ a: span[0].a, b: span[n - 1].b, key }); hit = n }
    }
    if (!hit) { out.push({ a: t.a, b: t.b, key: null }); hit = 1 }
    i += hit
  }
  return out
}

// Wrap each word in `text` that has a match with a span carrying its gloss
// as a data attribute (shown via a pure-CSS tooltip). A passage's `words`
// map (word as written → vocabulary id) names the exact entry for each word,
// including inflected forms (comen → comer) and the right sense of words
// spelled alike; other words fall back to an exact-spelling lookup.
function renderHoverablePassage(text, words = {}) {
  if (!readingHoverIndex) return escHtml(text)
  const has = key => key in words || readingHoverIndex.has(key)
  let html = ''
  let last = 0
  for (const seg of segmentPassage(text, has)) {
    html += escHtml(text.slice(last, seg.a))
    const word = text.slice(seg.a, seg.b)
    let gloss = null
    const linked = seg.key && words[seg.key] && readingVocabById?.get(words[seg.key])
    if (linked) {
      const lemma = linked[readingTargetField] || ''
      gloss = lemma.toLowerCase() === seg.key ? linked.english : `${lemma}: ${linked.english}`
    } else if (seg.key && readingHoverIndex.has(seg.key)) {
      gloss = readingHoverIndex.get(seg.key).english
    }
    html += gloss
      ? `<span class="hoverable-word" data-gloss="${escHtml(gloss).replace(/"/g, '&quot;')}">${escHtml(word)}</span>`
      : escHtml(word)
    last = seg.b
  }
  html += escHtml(text.slice(last))
  return html
}

// Reading text runs right to left for Arabic and Hebrew; the screens' own
// English labels stay left to right.
function readingDir() {
  return ['ar', 'he'].includes(readingMeta?.languageCode) ? 'rtl' : 'ltr'
}

function showReadingPassage() {
  const passage = readingSession[readingPassageIdx]
  const total   = readingSession.length
  $('reading-passage-counter').textContent      = `Passage ${readingPassageIdx + 1} of ${total}`
  $('reading-passage-progress').style.width     = `${(readingPassageIdx / total) * 100}%`
  $('reading-passage-text').innerHTML           = renderHoverablePassage(passage.text, passage.words)
  $('reading-passage-text').dir                 = readingDir()
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
  $('reading-question-passage').dir          = readingDir()
  $('reading-question-text').dir             = readingDir()
  $('reading-question-counter').textContent  = `Question ${readingQuestionIdx + 1} of ${qTotal}`

  const grid = $('reading-choices-grid')
  grid.innerHTML = ''
  question.choices.forEach((choice, i) => {
    const btn = document.createElement('button')
    btn.className   = 'reading-choice-btn'
    btn.textContent = choice
    btn.dir         = readingDir()
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
    textEl.dir         = readingDir()
    block.appendChild(textEl)

    r.passage.questions.forEach((q, qi) => {
      const chosen  = r.answers[qi]
      const correct = q.answer
      const isRight = chosen === correct

      const qBlock = document.createElement('div')
      qBlock.className = 'review-question-block'
      qBlock.dir       = readingDir()

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
