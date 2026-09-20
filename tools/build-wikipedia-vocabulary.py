#!/usr/bin/env python3
"""
Extract new vocabulary from a German Wikipedia article
and append new words to german-vocabulary.json.

Run: python3 tools/build-wikipedia-vocabulary.py --article "Das Parfum" [--max 250]
     python3 tools/build-wikipedia-vocabulary.py --article "Der Herr der Ringe" --max 200
"""

import argparse, json, re, ssl, time, unicodedata, urllib.request, urllib.parse, uuid
from collections import Counter

_SSL_CTX = ssl._create_unverified_context()

WIKI_API    = 'https://de.wikipedia.org/w/api.php'
KAIKKI_BASE = (
    'https://kaikki.org/dictionary/German/pos-{pos}/'
    'kaikki.org-dictionary-German-by-pos-{pos}.jsonl'
)
FREQ_URL = (
    'https://raw.githubusercontent.com/hermitdave/FrequencyWords'
    '/master/content/2018/de/de_50k.txt'
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

GRAM_TOKENS = {
    'inflection', 'conjugate', 'form', 'plural', 'singular',
    'participle', 'gerund', 'comparative', 'superlative',
    'feminine', 'masculine', 'neuter', 'diminutive', 'augmentative',
    'alternative', 'archaic', 'obsolete', 'misspelling', 'spelling',
    'abbreviation', 'clipping', 'initialism', 'female', 'male',
    'equivalent', 'variant', 'genitive', 'dative', 'accusative',
}

BAD_PHRASES = (
    'female equivalent', 'male equivalent',
    'alternative spelling', 'alternative form',
    'archaic form', 'obsolete form', 'variant of', 'synonym of',
    'eye dialect', 'misspelling of', 'abbreviation of',
    'genitive of', 'dative of', 'accusative of', 'plural of',
    'past tense of', 'past participle of', 'preterite of',
)

def is_lemma_gloss(gloss: str) -> bool:
    low = gloss.lower().strip()
    if any(p in low for p in BAD_PHRASES):
        return False
    tokens = re.split(r'[\s/\-,]+', low)
    return not any(t in GRAM_TOKENS for t in tokens[:4])


# ── Wikipedia API ───────────────────────────────────────────────────────────────

def fetch_article(title: str) -> tuple[str, str]:
    """Fetch plain-text article extract. Returns (canonical_title, text)."""
    params = urllib.parse.urlencode({
        'action':      'query',
        'prop':        'extracts|info',
        'explaintext': 'true',
        'exsectionformat': 'plain',
        'titles':      title,
        'format':      'json',
        'inprop':      'displaytitle',
    })
    url = f'{WIKI_API}?{params}'
    req = urllib.request.Request(url, headers={'User-Agent': 'vocab-builder/1.0'})
    with urllib.request.urlopen(req, timeout=30, context=_SSL_CTX) as resp:
        data = json.load(resp)
    pages = data['query']['pages']
    page  = next(iter(pages.values()))
    canon = page.get('title', title)
    text  = page.get('extract', '')
    return canon, text


# ── kaikki.org streaming ────────────────────────────────────────────────────────

def stream_kaikki(pos: str) -> tuple[dict, dict]:
    """
    Returns:
      lemma_entries : {lemma: {english, pos, gender, plural}}
      form_to_lemma : {form_lower: lemma}
    """
    url = KAIKKI_BASE.format(pos=pos)
    print(f'Streaming kaikki.org German {pos}…', flush=True)
    lemma_entries: dict = {}
    form_to_lemma: dict = {}

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

            # English gloss
            english = None
            for sense in entry.get('senses', []):
                glosses = sense.get('glosses', [])
                if glosses and is_lemma_gloss(glosses[0]):
                    english = glosses[0].strip()
                    break
            if not english:
                continue

            # Gender for nouns
            gender = ''
            if pos == 'noun':
                for ht in entry.get('head_templates', []):
                    g = ht.get('args', {}).get('g', ht.get('args', {}).get('1', ''))
                    if g in ('m', 'mf', 'mn'):
                        gender = 'masculine'; break
                    elif g in ('f', 'fn'):
                        gender = 'feminine';  break
                    elif g in ('n', 'nm', 'nf'):
                        gender = 'neuter';    break
                if not gender:
                    for tag in entry.get('tags', []):
                        if tag in ('masculine', 'feminine', 'neuter'):
                            gender = tag; break

            # Plural for nouns
            plural = ''
            if pos == 'noun':
                for f in entry.get('forms', []):
                    tags = set(f.get('tags', []))
                    if 'plural' in tags and 'nominative' in tags:
                        v = f.get('form', '').strip()
                        if v and v != '-' and v != word:
                            plural = v; break
                if not plural:
                    for f in entry.get('forms', []):
                        if 'plural' in set(f.get('tags', [])):
                            v = f.get('form', '').strip()
                            if v and v != '-' and v != word:
                                plural = v; break

            if word not in lemma_entries:
                lemma_entries[word] = {
                    'english': english,
                    'pos':     POS_MAP.get(pos, pos),
                    'gender':  gender,
                    'plural':  plural,
                }

            # Reverse form map (lowercase keys)
            form_to_lemma[word.lower()] = word
            for f in entry.get('forms', []):
                fv = f.get('form', '').strip().lower()
                if fv and fv != '-' and len(fv) > 1 and fv not in form_to_lemma:
                    form_to_lemma[fv] = word

    print(f'  {len(lemma_entries):,} lemmas, {len(form_to_lemma):,} form mappings',
          flush=True)
    return lemma_entries, form_to_lemma


# ── Frequency / CEFR ────────────────────────────────────────────────────────────

def load_freq(url: str) -> dict[str, int]:
    print('Loading frequency list…', flush=True)
    req = urllib.request.Request(url, headers={'User-Agent': 'vocab-builder/1.0'})
    with urllib.request.urlopen(req, timeout=60, context=_SSL_CTX) as resp:
        raw = resp.read().decode('utf-8', errors='replace')
    ranks: dict[str, int] = {}
    for i, line in enumerate(raw.splitlines(), 1):
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


# ── German tokenizer ─────────────────────────────────────────────────────────────

def tokenize_de(text: str) -> list[str]:
    """
    Tokenize German text preserving capitalization (needed for noun lookup).
    Returns tokens in their original case.
    """
    tokens = []
    for chunk in re.split(r'\s+', text):
        # Strip surrounding punctuation; keep internal ÄÖÜäöüß and hyphens
        chunk = re.sub(r'^[^\wÄÖÜäöüß\-]+|[^\wÄÖÜäöüß\-]+$', '', chunk)
        if not chunk:
            continue
        # Skip all-caps tokens (acronyms, abbreviations, section headings)
        if chunk == chunk.upper() and re.search(r'[A-ZÄÖÜ]', chunk):
            continue
        # Skip pure numbers or ordinals (18., 1990, etc.)
        if re.match(r'^\d+\.?$', chunk):
            continue
        # Skip very short tokens
        if len(chunk) <= 2:
            continue
        # Skip hyphenated compounds — too noisy, rarely match kaikki.org cleanly
        if '-' in chunk:
            continue
        tokens.append(chunk)
    return tokens


# ── Main ─────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description='Add German vocabulary from a German Wikipedia article')
    parser.add_argument('--article', required=True,
                        help='German Wikipedia article title, e.g. "Das Parfum"')
    parser.add_argument('--max', type=int, default=250,
                        help='Max new entries to add (default: 250)')
    args = parser.parse_args()

    # Fetch Wikipedia article
    print(f'Fetching Wikipedia article: {args.article}…', flush=True)
    canon_title, article_text = fetch_article(args.article)
    print(f'  Found: "{canon_title}"  ({len(article_text):,} chars)')

    if not article_text:
        print('ERROR: Article not found or empty.', flush=True)
        return

    # Tokenize
    tokens    = tokenize_de(article_text)
    text_freq = Counter(tokens)
    print(f'  Unique tokens: {len(text_freq):,}  (total: {sum(text_freq.values()):,})')

    # Load existing German vocab
    vocab_path = 'language-data/german-vocabulary.json'
    with open(vocab_path, encoding='utf-8') as f:
        data = json.load(f)
    words = data.get('words', [])
    existing: set[str] = set()
    for w in words:
        de = w.get('german', '')
        existing.add(de)
        existing.add(de.lower())
    print(f'Existing German vocab: {len(words):,} words')

    # Load kaikki.org German data
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

    # Load German frequency ranking
    rank_map = load_freq(FREQ_URL)

    # Accumulate frequency per lemma for new words
    lemma_freq: Counter = Counter()
    for token, count in text_freq.items():
        # Skip rare tokens
        if count < 3:
            continue
        # Skip if already in vocab (check both original case and lowercase)
        if token in existing or token.lower() in existing:
            continue
        # Skip very high-frequency words (function words not worth adding)
        if rank_map.get(token.lower(), 999999) <= 300:
            continue
        # Look up via form→lemma map (using lowercase token as key)
        lemma = all_forms.get(token.lower(), token)
        # Avoid common-word mis-mappings
        if token.lower() != lemma.lower() and rank_map.get(token.lower(), 999999) <= 500:
            continue
        if lemma not in existing and lemma.lower() not in existing \
                and lemma in all_lemmas:
            lemma_freq[lemma] += count

    print(f'\nNew lemma candidates: {len(lemma_freq):,}')

    # Deduplicate case-insensitively and take top N
    seen_lower: set[str] = set()
    top_candidates: list[tuple[str, int]] = []
    for lemma, count in lemma_freq.most_common():
        if lemma.lower() not in seen_lower:
            seen_lower.add(lemma.lower())
            top_candidates.append((lemma, count))
        if len(top_candidates) >= args.max:
            break

    # Build new entries
    new_entries = []
    for lemma, _ in top_candidates:
        info  = all_lemmas[lemma]
        rank  = rank_map.get(lemma.lower())
        entry: dict = {
            'id':             str(uuid.uuid4()),
            'part-of-speech': info['pos'],
            'english':        info['english'],
            'german':         lemma,
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
    print(f'Total German words now: {len(data["words"]):,}')
    print(f'\nTop 30 new words by frequency in article:')
    print(f'  {"Word":<28} {"Freq":>5}  {"POS":<12}  English')
    print(f'  {"-"*28} {"-"*5}  {"-"*12}  {"-"*40}')
    for lemma, count in top_candidates[:30]:
        info = all_lemmas[lemma]
        print(f'  {lemma:<28} {count:>5}  {info["pos"]:<12}  {info["english"][:40]}')


if __name__ == '__main__':
    main()
