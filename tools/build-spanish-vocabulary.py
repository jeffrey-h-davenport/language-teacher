#!/usr/bin/env python3
"""
Builds spanish-vocabulary.json from:
  1. kaikki.org per-POS JSONL files (Spanish words from English Wiktionary)
  2. hermitdave/FrequencyWords for frequency ranking

Run:
  python3 tools/build-spanish-vocabulary.py [--out language-data/spanish-vocabulary.json] [--max 10000]

Data is streamed from the internet; no pre-downloaded files required.
"""

import argparse
import json
import os
import ssl
import urllib.request
import uuid

# macOS Python installs often lack system CA certs; use unverified context
# for this data-download build script only.
_SSL_CTX = ssl._create_unverified_context()

FREQUENCY_URL = (
    'https://raw.githubusercontent.com/hermitdave/FrequencyWords'
    '/master/content/2018/es/es_50k.txt'
)

KAIKKI_BASE = (
    'https://kaikki.org/dictionary/Spanish/pos-{pos}/'
    'kaikki.org-dictionary-Spanish-by-pos-{pos}.jsonl'
)

# kaikki POS → app POS
POS_MAP = {
    'noun': 'noun',
    'verb': 'verb',
    'adj':  'adjective',
    'adv':  'adverb',
    'prep': 'preposition',
    'conj': 'conjunction',
    'intj': 'interjection',
}

# Gloss prefixes that indicate an inflected form, not a real lemma.
# More explicit than the French script to catch gender/number forms up front.
SKIP_PREFIXES = (
    # Generic inflection markers
    'inflection of', 'conjugate of', 'form of',
    'plural of', 'singular of',
    # Gender/number forms — both short and long variants
    'feminine of', 'masculine of',
    'feminine singular of', 'feminine plural of',
    'masculine singular of', 'masculine plural of',
    'female equivalent of', 'male equivalent of',
    # Participles / mood
    'past participle of', 'present participle of',
    'comparative of', 'superlative of',
    # Conjugated verb forms (person/tense/mood)
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
    """Return True if this gloss looks like a real English definition."""
    low = gloss.lower().strip()
    return not any(low.startswith(p) for p in SKIP_PREFIXES)


def extract_gender(entry: dict) -> str | None:
    """Scan senses.tags then head_templates for gender."""
    for sense in entry.get('senses', []):
        tags = sense.get('tags', [])
        if 'masculine' in tags:
            return 'masculine'
        if 'feminine' in tags:
            return 'feminine'
    for tmpl in entry.get('head_templates', []):
        arg = tmpl.get('args', {}).get('1', '')
        if arg == 'm':
            return 'masculine'
        if arg == 'f':
            return 'feminine'
    return None


def extract_plural(entry: dict) -> str | None:
    """Return the plural form, if present."""
    for form in entry.get('forms', []):
        tags = form.get('tags', [])
        if 'plural' in tags:
            val = form.get('form', '').strip()
            if val and val != '-':
                return val
    return None


def extract_entry(raw: dict, kaikki_pos: str) -> dict | None:
    """Convert one kaikki JSONL line into our format, or return None to skip."""
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
        gender = extract_gender(raw)
        plural = extract_plural(raw)
        if gender:
            result['gender'] = gender
        if plural:
            result['plural'] = plural

    return result


# ── Downloaders ───────────────────────────────────────────────────────────────

def load_frequencies(url: str) -> dict[str, int]:
    """Download and parse hermitdave-style frequency file (word count per line)."""
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
    """
    Stream the kaikki.org JSONL for the given POS and return a dict
    { word → entry } keeping only the best (highest-frequency) entry per word.
    """
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


# ── Main ──────────────────────────────────────────────────────────────────────

def build(out_path: str, max_words: int) -> None:
    # 1. Frequency data
    freq = load_frequencies(FREQUENCY_URL)

    # 2. Stream each POS (verbs last — largest file)
    all_entries: dict[str, dict] = {}
    for pos in ('noun', 'adj', 'adv', 'verb'):
        entries = stream_kaikki(pos, freq)
        for word, entry in entries.items():
            if word not in all_entries:
                all_entries[word] = entry

    print(f'\nTotal unique words with English translations: {len(all_entries):,}')

    # 3. Sort by frequency (descending), then alphabetically for ties
    def sort_key(entry: dict) -> tuple:
        return (-freq.get(entry['word'], 0), entry['word'])

    sorted_entries = sorted(all_entries.values(), key=sort_key)
    top = sorted_entries[:max_words]

    # 4. Build final output objects with UUIDs
    output = []
    for entry in top:
        obj: dict = {
            'id':             str(uuid.uuid4()),
            'part-of-speech': entry['pos'],
            'english':        entry['english'],
            'spanish':        entry['word'],
        }
        if 'gender' in entry:
            obj['gender'] = entry['gender']
        if 'plural' in entry:
            obj['plural'] = entry['plural']
        output.append(obj)

    # 5. Wrap with metadata and write
    wrapped = {
        'meta': {
            'language':       'Spanish',
            'languageCode':   'es',
            'nativeLanguage': 'English',
            'targetField':    'spanish',
        },
        'words': output,
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(wrapped, f, ensure_ascii=False, indent=2)

    # 6. Report
    nouns = [e for e in output if e['part-of-speech'] == 'noun']
    verbs = [e for e in output if e['part-of-speech'] == 'verb']
    adjs  = [e for e in output if e['part-of-speech'] == 'adjective']
    advs  = [e for e in output if e['part-of-speech'] == 'adverb']
    n_gender = sum(1 for n in nouns if 'gender' in n)
    n_plural = sum(1 for n in nouns if 'plural' in n)

    size_kb = os.path.getsize(out_path) / 1024
    print(f"\n{'='*52}")
    print(f"Output: {out_path}")
    print(f"  Total words:       {len(output):,}")
    print(f"  Nouns:             {len(nouns):,}")
    if nouns:
        print(f"    With gender:     {n_gender:,} ({n_gender/len(nouns)*100:.1f}%)")
        print(f"    With plural:     {n_plural:,} ({n_plural/len(nouns)*100:.1f}%)")
    print(f"  Verbs:             {len(verbs):,}")
    print(f"  Adjectives:        {len(adjs):,}")
    print(f"  Adverbs:           {len(advs):,}")
    print(f"  File size:         {size_kb:.0f} KB")
    print(f"{'='*52}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build Spanish vocabulary JSON')
    parser.add_argument('--out', default='language-data/spanish-vocabulary.json',
                        help='Output file (default: language-data/spanish-vocabulary.json)')
    parser.add_argument('--max', type=int, default=10000,
                        help='Maximum words to include (default: 10000)')
    args = parser.parse_args()
    build(out_path=args.out, max_words=args.max)
