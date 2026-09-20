#!/usr/bin/env python3
"""
Extract new French vocabulary from 'Le Fantôme de l'Opéra' (Gutenberg ID 62215)
and append new words to french-vocabulary.json.

Steps:
  1. Download the plain text from Project Gutenberg
  2. Tokenize with French-aware elision handling
  3. Load kaikki.org French data: lemma entries + inflected-form → lemma map
  4. Load hermitdave French frequency list for CEFR assignment
  5. Find text words whose lemma is not already in french-vocabulary.json
  6. Add the top --max candidates (ranked by frequency in the text)

Run: python3 tools/build-phantom-vocabulary.py [--max 250]
"""

import argparse, json, re, ssl, sys, unicodedata, urllib.request, uuid
from collections import Counter

_SSL_CTX = ssl._create_unverified_context()

TEXT_URL    = 'https://www.gutenberg.org/files/62215/62215-0.txt'
KAIKKI_BASE = (
    'https://kaikki.org/dictionary/French/pos-{pos}/'
    'kaikki.org-dictionary-French-by-pos-{pos}.jsonl'
)
FREQ_URL = (
    'https://raw.githubusercontent.com/hermitdave/FrequencyWords'
    '/master/content/2018/fr/fr_50k.txt'
)

POS_MAP = {
    'noun': 'noun',
    'verb': 'verb',
    'adj':  'adjective',
    'adv':  'adverb',
    'prep': 'preposition',
    'conj': 'conjunction',
    'intj': 'interjection',
}

# Tokens in an English gloss that signal a grammatical-form entry (not a lemma)
GRAM_TOKENS = {
    'inflection', 'conjugate', 'form', 'plural', 'singular',
    'participle', 'gerund', 'comparative', 'superlative',
    'feminine', 'masculine', 'diminutive', 'augmentative',
    'alternative', 'archaic', 'obsolete', 'misspelling',
    'abbreviation', 'clipping', 'initialism', 'spelling',
    'female', 'male', 'equivalent', 'variant',
}

# Substring phrases that also disqualify a gloss
BAD_PHRASES = (
    'female equivalent', 'male equivalent',
    'post-1990 spelling', 'alternative spelling', 'alternative form',
    'archaic form', 'obsolete form', 'variant of', 'synonym of',
    'eye dialect', 'misspelling of', 'abbreviation of',
)

def is_lemma_gloss(gloss: str) -> bool:
    low = gloss.lower().strip()
    if any(p in low for p in BAD_PHRASES):
        return False
    tokens = re.split(r'[\s/\-,]+', low)
    return not any(t in GRAM_TOKENS for t in tokens[:4])


# ── Network helpers ─────────────────────────────────────────────────────────────

def fetch_text(url: str, label: str) -> str:
    print(f'Downloading {label}…', flush=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=120, context=_SSL_CTX) as resp:
        return resp.read().decode('utf-8', errors='replace')


def stream_kaikki(pos: str) -> tuple[dict, dict]:
    """
    Returns:
      lemma_entries  : {lemma: {english, pos, gender, plural}}
      form_to_lemma  : {inflected_form_lower: lemma}
    """
    url = KAIKKI_BASE.format(pos=pos)
    print(f'Streaming kaikki.org French {pos}…', flush=True)
    lemma_entries: dict  = {}
    form_to_lemma: dict  = {}

    with urllib.request.urlopen(url, timeout=300, context=_SSL_CTX) as resp:
        for raw in resp:
            raw = raw.strip()
            if not raw:
                continue
            try:
                entry = json.loads(raw)
            except json.JSONDecodeError:
                continue
            word = entry.get('word', '').strip()
            if not word or ' ' in word:
                continue

            # English gloss (first lemma-level sense)
            english = None
            for sense in entry.get('senses', []):
                glosses = sense.get('glosses', [])
                if glosses and is_lemma_gloss(glosses[0]):
                    english = glosses[0].strip()
                    break
            if not english:
                continue

            # Gender for nouns (check head_templates, entry tags, then form tags)
            gender = ''
            if pos == 'noun':
                for ht in entry.get('head_templates', []):
                    g = ht.get('args', {}).get('g', ht.get('args', {}).get('1', ''))
                    if g.startswith('m'):
                        gender = 'masculine'; break
                    elif g.startswith('f'):
                        gender = 'feminine';  break
                if not gender:
                    for tag in entry.get('tags', []):
                        if tag in ('masculine', 'feminine'):
                            gender = tag; break
                if not gender:
                    for f in entry.get('forms', []):
                        tags = set(f.get('tags', []))
                        if 'singular' in tags:
                            for t in tags:
                                if t in ('masculine', 'feminine'):
                                    gender = t; break
                        if gender:
                            break

            # Plural for nouns
            plural = ''
            if pos == 'noun':
                for f in entry.get('forms', []):
                    tags = set(f.get('tags', []))
                    if 'plural' in tags:
                        v = f.get('form', '').strip()
                        if v and v != '-' and v != word:
                            plural = v; break

            # Store lemma entry
            if word not in lemma_entries:
                lemma_entries[word] = {
                    'english': english,
                    'pos':     POS_MAP.get(pos, pos),
                    'gender':  gender,
                    'plural':  plural,
                }

            # Reverse map: every form (and the lemma itself) → lemma
            form_to_lemma[word.lower()] = word
            for f in entry.get('forms', []):
                fv = f.get('form', '').strip().lower()
                if fv and fv != '-' and len(fv) > 1 and fv not in form_to_lemma:
                    form_to_lemma[fv] = word

    print(f'  {len(lemma_entries):,} lemmas, {len(form_to_lemma):,} form mappings', flush=True)
    return lemma_entries, form_to_lemma


def load_freq(url: str) -> dict[str, int]:
    print('Loading frequency list…', flush=True)
    ranks: dict[str, int] = {}
    text = fetch_text(url, 'frequency list')
    for i, line in enumerate(text.splitlines(), 1):
        parts = line.strip().split()
        if parts:
            ranks[parts[0].lower()] = i
    print(f'  {len(ranks):,} entries', flush=True)
    return ranks

def rank_to_cefr(rank: int | None) -> str:
    if rank is None or rank > 15000: return 'C2'
    if rank > 7000:  return 'C1'
    if rank > 3500:  return 'B2'
    if rank > 1500:  return 'B1'
    if rank > 600:   return 'A2'
    return 'A1'


# ── French tokenizer ─────────────────────────────────────────────────────────────

# Short prefixes that get elided before a vowel (l'opéra → opéra)
ELISION_PREFIXES = {
    'l', 'j', 'm', 't', 's', 'n', 'd', 'c',
    'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu',
}

def strip_accents(s: str) -> str:
    """Return ASCII-folded lowercase string (for duplicate-checking only)."""
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()

def tokenize_fr(text: str) -> list[str]:
    # Strip Gutenberg boilerplate
    text = re.sub(r'\*{3}.*?START.*?\*{3}', '', text, flags=re.DOTALL | re.IGNORECASE)
    text = re.sub(r'\*{3}.*?END.*', '',       text, flags=re.DOTALL | re.IGNORECASE)

    # Normalize typographic apostrophes
    text = text.replace(''', "'").replace(''', "'")

    tokens = []
    for chunk in re.split(r'\s+', text):
        # Strip leading/trailing punctuation (keep internal hyphens and apostrophes)
        chunk = re.sub(r'^[^\wÀ-ɏ\-\']+|[^\wÀ-ɏ\-\']+$', '', chunk)
        if not chunk:
            continue
        # Skip all-uppercase tokens (abbreviations, chapter headings, etc.)
        if chunk == chunk.upper() and re.search(r'[A-Z]', chunk):
            continue
        # Handle elision: l'opéra → opéra, d'accord → accord
        if "'" in chunk:
            parts = chunk.split("'", 1)
            if parts[0].lower() in ELISION_PREFIXES:
                chunk = parts[1]
            else:
                for p in parts:
                    p = p.strip()
                    if p and len(p) > 1 and not re.match(r'^\d+$', p):
                        tokens.append(p.lower())
                continue
        # Skip numbers and single characters
        if re.match(r'^\d+$', chunk) or len(chunk) <= 1:
            continue
        tokens.append(chunk.lower())
    return tokens


# ── Main ─────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="Add French vocabulary from Le Fantôme de l'Opéra")
    parser.add_argument('--max', type=int, default=250,
                        help='Max new entries to add (default: 250)')
    args = parser.parse_args()

    # Load existing vocab
    vocab_path = 'language-data/french-vocabulary.json'
    with open(vocab_path, encoding='utf-8') as f:
        data = json.load(f)
    words = data.get('words', [])
    # Build existing set with both exact and accent-stripped forms so that
    # e.g. "fut" in text doesn't slip through as new when "fût" is in vocab
    existing: set[str] = set()
    for w in words:
        fr = w.get('french', '')
        existing.add(fr.lower())
        existing.add(strip_accents(fr))
    print(f'Existing French vocab: {len(words):,} words')

    # Download and tokenize the book
    raw_text   = fetch_text(TEXT_URL, "Le Fantôme de l'Opéra")
    tokens     = tokenize_fr(raw_text)
    text_freq  = Counter(tokens)
    print(f'Unique word forms in text: {len(text_freq):,}  '
          f'(total tokens: {sum(text_freq.values()):,})')

    # Load kaikki.org French data for all relevant POS
    all_lemmas: dict = {}
    all_forms:  dict = {}
    for pos in ('noun', 'verb', 'adj', 'adv'):
        lemmas, forms = stream_kaikki(pos)
        for w, info in lemmas.items():
            if w not in all_lemmas:
                all_lemmas[w] = info
        for f, lemma in forms.items():
            if f not in all_forms:
                all_forms[f] = lemma

    # Load frequency ranking for CEFR
    rank_map = load_freq(FREQ_URL)

    # Accumulate frequency per lemma for words not already in vocab
    lemma_freq: Counter = Counter()
    for form, count in text_freq.items():
        # Skip rare forms (< 3 occurrences) — likely proper nouns or OCR noise
        if count < 3:
            continue
        # Skip if this exact form is already a known French word
        if form in existing or strip_accents(form) in existing:
            continue
        # Skip very high-frequency forms (function words like ce, va, quand)
        # that aren't in our vocab — they're not worth adding as vocabulary items
        if rank_map.get(form, 999999) <= 300:
            continue
        lemma = all_forms.get(form, form)
        # Guard against common-word mis-mappings (e.g. "lui" → "luire"):
        # if the form is a common French word (rank ≤ 500) mapping to a
        # different lemma, it's almost certainly a false mapping.
        if form != lemma.lower() and rank_map.get(form, 999999) <= 500:
            continue
        if lemma.lower() not in existing and strip_accents(lemma) not in existing \
                and lemma in all_lemmas:
            lemma_freq[lemma] += count

    print(f'\nNew lemma candidates: {len(lemma_freq):,}')

    # Deduplicate case-insensitively (e.g. keep only one of Monsieur/monsieur)
    seen_lower: set[str] = set()
    deduped: list[tuple[str, int]] = []
    for lemma, count in lemma_freq.most_common():
        key = lemma.lower()
        if key not in seen_lower:
            seen_lower.add(key)
            deduped.append((lemma, count))

    # Take top N by frequency in the text
    top_candidates = deduped[:args.max]

    new_entries = []
    for lemma, _ in top_candidates:
        info  = all_lemmas[lemma]
        rank  = rank_map.get(lemma.lower())
        entry: dict = {
            'id':             str(uuid.uuid4()),
            'part-of-speech': info['pos'],
            'english':        info['english'],
            'french':         lemma,
            'cefr':           rank_to_cefr(rank),
            'score':          0,
            'learned':        False,
        }
        if info.get('gender'):
            entry['gender'] = info['gender']
        if info.get('plural'):
            entry['plural'] = info['plural']
        new_entries.append(entry)

    data['words'] = words + new_entries
    with open(vocab_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    by_cefr = Counter(e['cefr'] for e in new_entries)
    print(f'\nAdded {len(new_entries):,} new entries to {vocab_path}')
    print(f'CEFR breakdown: {dict(sorted(by_cefr.items()))}')
    print(f'Total French words now: {len(data["words"]):,}')
    print(f'\nTop 25 new words by frequency in text:')
    print(f'  {"Word":<22} {"Freq":>5}  {"POS":<12}  English')
    print(f'  {"-"*22} {"-"*5}  {"-"*12}  {"-"*40}')
    for lemma, count in top_candidates[:25]:
        info = all_lemmas[lemma]
        print(f'  {lemma:<22} {count:>5}  {info["pos"]:<12}  {info["english"][:45]}')


if __name__ == '__main__':
    main()
