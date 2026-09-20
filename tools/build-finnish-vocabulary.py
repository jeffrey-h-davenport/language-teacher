#!/usr/bin/env python3
"""
Builds finnish-vocabulary.json from:
  1. kaikki.org per-POS JSONL files (Finnish words from English Wiktionary)
  2. hermitdave/FrequencyWords for frequency ranking

Run:
  python3 tools/build-finnish-vocabulary.py [--out language-data/finnish-vocabulary.json] [--max 10000]

Data is streamed from the internet; no pre-downloaded files required.
"""

import argparse
import json
import os
import ssl
import urllib.request
import uuid

_SSL_CTX = ssl._create_unverified_context()

FREQUENCY_URL = (
    'https://raw.githubusercontent.com/hermitdave/FrequencyWords'
    '/master/content/2018/fi/fi_50k.txt'
)

KAIKKI_BASE = (
    'https://kaikki.org/dictionary/Finnish/pos-{pos}/'
    'kaikki.org-dictionary-Finnish-by-pos-{pos}.jsonl'
)

POS_MAP = {
    'noun': 'noun',
    'verb': 'verb',
    'adj':  'adjective',
    'adv':  'adverb',
    'prep': 'preposition',
    'conj': 'conjunction',
    'intj': 'interjection',
    'part': 'particle',
    'num':  'numeral',
}

# Finnish has 15 grammatical cases — filter all inflected/derived forms.
SKIP_PREFIXES = (
    # Generic inflection markers
    'inflection of', 'conjugate of', 'form of',
    'plural of', 'singular of',
    # Finnish grammatical cases (all 15)
    'nominative of', 'genitive of', 'partitive of', 'accusative of',
    'inessive of', 'elative of', 'illative of',
    'adessive of', 'ablative of', 'allative of',
    'essive of', 'translative of', 'instructive of',
    'abessive of', 'comitative of',
    # Case + number combinations
    'nominative plural of', 'genitive plural of', 'partitive plural of',
    'accusative plural of', 'inessive plural of', 'elative plural of',
    'illative plural of', 'adessive plural of', 'ablative plural of',
    'allative plural of', 'essive plural of', 'translative plural of',
    'instructive plural of', 'abessive plural of', 'comitative plural of',
    'nominative singular of', 'genitive singular of', 'partitive singular of',
    # Verbal / mood forms
    'past tense of', 'present tense of',
    'past participle of', 'present participle of',
    'passive past participle of', 'passive present participle of',
    'passive of', 'conditional of', 'imperative of', 'potential of',
    'comparative of', 'superlative of',
    'verbal noun of', 'gerund of',
    'negative of', 'negation of',
    'first-person', 'second-person', 'third-person',
    'first/', 'second/', 'third/',
    # Alternates / errors
    'alternative form of', 'alternative spelling of',
    'misspelling of', 'obsolete form of', 'archaic form of',
    'abbreviation of', 'initialism of', 'eye dialect of',
    'diminutive of', 'augmentative of',
    'short form of', 'clipping of',
)


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_lemma_gloss(gloss: str) -> bool:
    low = gloss.lower().strip()
    return not any(low.startswith(p) for p in SKIP_PREFIXES)


def extract_plural(entry: dict) -> str | None:
    """Return the nominative plural form (ends in -t in Finnish)."""
    for form in entry.get('forms', []):
        tags = form.get('tags', [])
        if 'plural' in tags and 'nominative' in tags:
            val = form.get('form', '').strip()
            if val and val != '-':
                return val
    for form in entry.get('forms', []):
        tags = form.get('tags', [])
        if 'plural' in tags:
            val = form.get('form', '').strip()
            if val and val != '-':
                return val
    return None


def extract_entry(raw: dict, kaikki_pos: str) -> dict | None:
    word = raw.get('word', '').strip()
    if not word or ' ' in word:
        return None

    english = None
    for sense in raw.get('senses', []):
        glosses = sense.get('glosses', [])
        if not glosses:
            continue
        gloss = glosses[0].strip()
        if gloss and is_lemma_gloss(gloss):
            english = gloss
            break

    if not english:
        return None

    app_pos = POS_MAP.get(kaikki_pos, kaikki_pos)
    result: dict = {'word': word, 'english': english, 'pos': app_pos}

    if kaikki_pos == 'noun':
        plural = extract_plural(raw)
        if plural:
            result['plural'] = plural

    return result


# ── Downloaders ───────────────────────────────────────────────────────────────

def load_frequencies(url: str) -> dict[str, int]:
    print(f'Loading frequency data from {url} …')
    freq: dict[str, int] = {}
    with urllib.request.urlopen(url, timeout=30, context=_SSL_CTX) as resp:
        for line in resp:
            parts = line.decode('utf-8').strip().split()
            if len(parts) >= 2:
                try:
                    freq[parts[0]] = int(parts[1])
                except ValueError:
                    pass
    print(f'  {len(freq):,} frequency entries loaded')
    return freq


def stream_kaikki(pos: str, freq: dict[str, int]) -> dict[str, dict]:
    url = KAIKKI_BASE.format(pos=pos)
    print(f'Streaming {pos} from {url} …', flush=True)

    seen: dict[str, dict] = {}
    total = skipped = dupes = 0

    with urllib.request.urlopen(url, timeout=120, context=_SSL_CTX) as resp:
        for raw_line in resp:
            line = raw_line.strip()
            if not line:
                continue
            total += 1
            if total % 50_000 == 0:
                print(f'  … {total:,} lines processed', flush=True)

            try:
                raw = json.loads(line)
            except json.JSONDecodeError:
                skipped += 1
                continue

            entry = extract_entry(raw, pos)
            if entry is None:
                skipped += 1
                continue

            word = entry['word']
            new_freq = freq.get(word, 0)
            if word not in seen or new_freq > freq.get(seen[word]['word'], 0):
                seen[word] = entry
            else:
                dupes += 1

    kept = len(seen)
    print(f'  {total:,} lines → {kept:,} kept, {skipped:,} skipped, {dupes:,} dupes')
    return seen


# ── CEFR from frequency rank ──────────────────────────────────────────────────

def rank_to_cefr(rank: int | None) -> str:
    if rank is None or rank > 15000: return 'C2'
    if rank > 7000:  return 'C1'
    if rank > 3500:  return 'B2'
    if rank > 1500:  return 'B1'
    if rank > 600:   return 'A2'
    return 'A1'


# ── Main ──────────────────────────────────────────────────────────────────────

def build(out_path: str, max_words: int) -> None:
    freq = load_frequencies(FREQUENCY_URL)

    all_entries: dict[str, dict] = {}
    for pos in ('noun', 'adj', 'adv', 'verb'):
        entries = stream_kaikki(pos, freq)
        for word, entry in entries.items():
            if word not in all_entries:
                all_entries[word] = entry

    print(f'\nTotal unique words with English translations: {len(all_entries):,}')

    def sort_key(entry: dict) -> tuple:
        return (-freq.get(entry['word'], 0), entry['word'])

    sorted_entries = sorted(all_entries.values(), key=sort_key)
    top = sorted_entries[:max_words]

    # Build rank map (position in frequency list) for CEFR assignment
    rank_map: dict[str, int] = {}
    print('Re-loading frequency for CEFR rank mapping …')
    with urllib.request.urlopen(FREQUENCY_URL, timeout=30, context=_SSL_CTX) as resp:
        for i, line in enumerate(resp, 1):
            parts = line.decode('utf-8').strip().split()
            if parts:
                rank_map[parts[0].lower()] = i

    output = []
    for entry in top:
        obj: dict = {
            'id':             str(uuid.uuid4()),
            'part-of-speech': entry['pos'],
            'english':        entry['english'],
            'finnish':        entry['word'],
            'cefr':           rank_to_cefr(rank_map.get(entry['word'].lower())),
        }
        if 'plural' in entry:
            obj['plural'] = entry['plural']
        output.append(obj)

    wrapped = {
        'meta': {
            'language':         'Finnish',
            'languageCode':     'fi',
            'nativeLanguage':   'English',
            'targetField':      'finnish',
            'learnedThreshold': 15,
        },
        'words': output,
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(wrapped, f, ensure_ascii=False, indent=2)

    nouns = [e for e in output if e['part-of-speech'] == 'noun']
    verbs = [e for e in output if e['part-of-speech'] == 'verb']
    adjs  = [e for e in output if e['part-of-speech'] == 'adjective']
    advs  = [e for e in output if e['part-of-speech'] == 'adverb']
    by_cefr = {lv: sum(1 for e in output if e.get('cefr') == lv)
               for lv in ('A1','A2','B1','B2','C1','C2')}

    size_kb = os.path.getsize(out_path) / 1024
    print(f"\n{'='*52}")
    print(f"Output: {out_path}")
    print(f"  Total words:  {len(output):,}")
    print(f"  Nouns:        {len(nouns):,}")
    print(f"  Verbs:        {len(verbs):,}")
    print(f"  Adjectives:   {len(adjs):,}")
    print(f"  Adverbs:      {len(advs):,}")
    print(f"  CEFR:         {by_cefr}")
    print(f"  File size:    {size_kb:.0f} KB")
    print(f"{'='*52}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build Finnish vocabulary JSON')
    parser.add_argument('--out', default='language-data/finnish-vocabulary.json')
    parser.add_argument('--max', type=int, default=10000)
    args = parser.parse_args()
    build(out_path=args.out, max_words=args.max)
