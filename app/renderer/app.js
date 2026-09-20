'use strict'

// ── Constants ───────────────────────────────────────
const WORDS_PER_SESSION = 20
function learnedThreshold() { return currentMeta?.learnedThreshold ?? 10 }
const CHOICES_COUNT     = 6

// ── State ────────────────────────────────────────────
let allWords       = []
let sessionWords   = []
let questionIndex  = 0
let currentQ       = null   // { word, showNative, choices }
let currentMeta    = null   // { language, languageCode, nativeLanguage, targetField }
let sessionScore   = 0
let sessionCorrect = 0
let sessionTotal   = 0
let sessionResults = []
let autoAdvanceTimer  = null
let editReturnScreen   = 'quiz-screen'
let searchReturnScreen = 'welcome-screen'
let savedQuizQ         = null
let lastDuplicatePair  = null   // { sourceId, newId } — positions dup below source after render
let searchResultsFull  = []     // full filtered+sorted result set
let searchPage         = 0      // current page index (0-based)
const SEARCH_PAGE_SIZE = 200
let openKebabRowId     = null   // id of the row whose action menu is currently open, or null
let selectedWordIds    = new Set() // ids checked for mass-edit; persists across pages/filters within a browse visit
let searchPageIds      = []     // ids of the rows on the currently-rendered page (for the header "select all" checkbox)

// Attributes the user can toggle on/off in the Browse Words table via the
// Columns picker. 'target'/'english'/'pos'/'cefr'/'score' are shown by
// default, matching the table's original fixed layout; the rest are opt-in.
const AVAILABLE_COLUMNS = [
  { id: 'target',       label: 'Word',          default: true,  render: w => escHtml(formatTarget(w)) },
  { id: 'english',      label: 'English',       default: true,  render: w => escHtml(w.english || '') },
  { id: 'pos',          label: 'Part of Speech', default: true, render: w => `<span class="pos-badge">${escHtml((w['part-of-speech'] || '').slice(0, 8))}</span>` },
  { id: 'cefr',         label: 'CEFR Level',    default: true,  render: w => `<span class="cefr-badge cefr-${escHtml(w.cefr || '')}">${escHtml(w.cefr || '—')}</span>` },
  { id: 'score',        label: 'Score',         default: true,  render: w => escHtml(w.learned ? '✓ Learned' : (w.score > 0 ? `${w.score} / ${learnedThreshold()}` : '—')) },
  { id: 'gender',       label: 'Gender',        default: false, render: w => escHtml(w.gender || '—') },
  { id: 'register',     label: 'Register',      default: false, render: w => escHtml((w.register && w.register.length ? w.register : ['All']).join(', ')) },
  { id: 'ipa',          label: 'IPA',           default: false, render: w => escHtml(w.ipa || '—') },
  { id: 'grammar',      label: 'Grammar',       default: false, render: w => escHtml(w.grammar || '—') },
  { id: 'context',      label: 'Context',       default: false, render: w => escHtml(w.context || '—') },
  { id: 'plural',       label: 'Plural',        default: false, render: w => escHtml(w.plural || '—') },
  { id: 'countability', label: 'Countability',  default: false, render: w => escHtml(w.countability || 'countable') },
]
let searchVisibleColumns = new Set(AVAILABLE_COLUMNS.filter(c => c.default).map(c => c.id))

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
  'nl': { masculine: 'de',  feminine: 'de',  neuter: 'het', plural: 'de' },
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
const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']

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

function pickSessionWords() {
  const inProgress = shuffle(allWords.filter(w => w.score > 0 && !w.learned))
  const learned    = shuffle(allWords.filter(w => w.learned))

  // Expand CEFR levels one at a time until the fresh pool is large enough
  let freshPool = []
  for (const level of CEFR_ORDER) {
    const lvWords = shuffle(allWords.filter(w => w.score === 0 && !w.learned && w.cefr === level))
    freshPool = [...freshPool, ...lvWords]
    if (freshPool.length >= WORDS_PER_SESSION) break
  }
  // Words with no cefr field fall in last
  const uncategorized = shuffle(allWords.filter(w => w.score === 0 && !w.learned && !w.cefr))
  freshPool = [...freshPool, ...uncategorized]
  freshPool = freshPool.map(resolveDeclensionGate)

  const combined = [...inProgress, ...freshPool, ...learned]
  const seen = new Set()
  const deduped = []
  for (const w of combined) {
    if (!seen.has(w.id)) {
      seen.add(w.id)
      deduped.push(w)
    }
  }
  return deduped.slice(0, WORDS_PER_SESSION)
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

  $('word-display').textContent = showNative ? word.english : formatTarget(word)

  // Register only describes the target-language word, so it's shown alongside
  // it (like IPA) — not when English is the head word and the target is hidden.
  const registers = word.register && word.register.length ? word.register : ['All']
  const showRegister = !showNative && !(registers.length === 1 && registers[0] === 'All')
  $('word-register').classList.toggle('hidden', !showRegister)
  $('word-register').textContent = showRegister ? registers.join(', ') : ''

  $('word-ipa').textContent     = (!showNative && word.ipa) ? word.ipa : ''
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
  choices.forEach(choice => {
    const label = showNative ? formatTarget(choice) : choice.english
    const btn   = document.createElement('button')
    btn.className  = 'choice-btn'
    btn.dataset.id = choice.id
    const span = document.createElement('span')
    span.className   = 'choice-text'
    span.textContent = label
    btn.appendChild(span)
    btn.addEventListener('click', () => handleChoice(btn, choice))
    grid.appendChild(btn)
  })

  // After layout, show tooltip only for buttons whose text is actually clipped
  requestAnimationFrame(() => {
    grid.querySelectorAll('.choice-btn').forEach(btn => {
      const span = btn.querySelector('.choice-text')
      if (span && span.scrollHeight > span.clientHeight) {
        btn.dataset.tooltip = span.textContent
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
  const total = Math.min(sessionWords.length, WORDS_PER_SESSION)
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

  window.api.saveData(currentMeta ? { meta: currentMeta, words: allWords } : allWords)
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

  window.api.saveData(currentMeta ? { meta: currentMeta, words: allWords } : allWords)
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
  const thresh = learnedThreshold()
  $('edit-score-label').textContent = `Score (0 – ${thresh})`
  $('edit-score').max   = thresh
  $('edit-score').value = word.score ?? 0

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

  const rawScore = parseInt($('edit-score').value, 10)
  if (!isNaN(rawScore)) {
    word.score   = Math.max(0, Math.min(rawScore, learnedThreshold()))
    word.learned = word.score >= learnedThreshold()
  }

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

  window.api.saveData(currentMeta ? { meta: currentMeta, words: allWords } : allWords)

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

  currentQ = makeQuestion(sessionWords[0])
  displayQuestion(currentQ)
  showScreen('quiz-screen')
}

// ── File Loading ──────────────────────────────────────
async function openFile() {
  const result = await window.api.openFile()
  if (!result) return
  if (result.error) { alert(result.error); return }

  const raw = result.data
  if (raw.passages) {
    // Reading comprehension file
    readingMeta       = raw.meta || {}
    readingPassages   = raw.passages || []
    readingHoverIndex = null

    // Best-effort: silently load the paired {language}-vocabulary.json
    // sitting next to this reading file to power hover-translation hints.
    const vocabPath = result.path.replace(/-reading\.json$/, '-vocabulary.json')
    if (vocabPath !== result.path) {
      const vocabResult = await window.api.readJsonFile(vocabPath)
      if (vocabResult && !vocabResult.error && vocabResult.data?.words) {
        readingHoverIndex = buildReadingHoverIndex(vocabResult.data.words)
      }
    }

    showReadingLobby()
    return
  }

  if (Array.isArray(raw)) {
    // Legacy format: plain array — assume German for backward compat
    currentMeta = {
      language:       'German',
      languageCode:   'de',
      nativeLanguage: 'English',
      targetField:    'german',
    }
    allWords = raw.map(ensureDefaults)
  } else {
    currentMeta = raw.meta || {}
    // Default targetField to lowercase language name if not specified
    if (!currentMeta.targetField && currentMeta.language) {
      currentMeta.targetField = currentMeta.language.toLowerCase()
    }
    allWords = (raw.words || []).map(ensureDefaults)
  }

  updateWelcomeScreen()
  startSession()
}

// ── Search / Browse ───────────────────────────────────
function escHtml(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function showSearchScreen(returnTo) {
  searchReturnScreen = returnTo || 'welcome-screen'
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
  list.innerHTML = AVAILABLE_COLUMNS.map(col => `
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

  const columns = AVAILABLE_COLUMNS.filter(c => searchVisibleColumns.has(c.id))

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
          <button class="kebab-edit" data-action="edit" data-id="${escHtml(word.id)}">Edit</button>
          <button class="kebab-dup" data-action="dup" data-id="${escHtml(word.id)}">Duplicate</button>
          <button class="${learnedAction}" data-action="learned" data-id="${escHtml(word.id)}">${learnedLabel}</button>
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
  window.api.saveData(currentMeta ? { meta: currentMeta, words: allWords } : allWords)
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
  window.api.saveData(currentMeta ? { meta: currentMeta, words: allWords } : allWords)
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
  window.api.saveData(currentMeta ? { meta: currentMeta, words: allWords } : allWords)
  applySearch()
}

function toggleLearnedFromSearch(wordId) {
  const word = allWords.find(w => w.id === wordId)
  if (!word) return
  if (word.learned) {
    word.learned = false
    word.score   = Math.max(0, learnedThreshold() - 1)
  } else {
    word.learned = true
    word.score   = learnedThreshold()
  }
  window.api.saveData(currentMeta ? { meta: currentMeta, words: allWords } : allWords)
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

  $('open-file-btn').addEventListener('click', openFile)

  $('quit-btn').addEventListener('click', () => {
    if (confirm('End this session?')) showScreen('welcome-screen')
  })

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
    showScreen('welcome-screen')
  })

  // ── Reading event wiring ───────────────────────────
  $('reading-start-btn').addEventListener('click', startReadingSession)

  $('reading-change-file-btn').addEventListener('click', () => {
    readingPassages = []
    readingMeta     = null
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
  $('reading-home-btn').addEventListener('click', () => showScreen('welcome-screen'))
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
function buildReadingHoverIndex(vocabWords) {
  const byId = new Map(vocabWords.map(w => [w.id, w]))
  const index = new Map()

  for (const w of vocabWords) {
    if (!w.czech || !w.english) continue
    const isBase = BASE_POS.has(w['part-of-speech'])
    let gloss = w.english
    if (w.baseId) {
      const base = byId.get(w.baseId)
      if (base?.english) gloss = base.english
    }

    for (const variant of w.czech.split(' / ')) {
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
