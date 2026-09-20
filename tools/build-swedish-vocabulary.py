#!/usr/bin/env python3
"""
Builds swedish-vocabulary.json from:
  1. kaikki.org per-POS JSONL files (Swedish words from English Wiktionary)
  2. hermitdave/FrequencyWords for frequency ranking

By default, output is restricted to A1/A2-level words (see --levels) since
that's the initial focus for this language.

Run:
  python3 tools/build-swedish-vocabulary.py [--out language-data/swedish-vocabulary.json] [--max 10000] [--levels A1,A2]

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
    '/master/content/2018/sv/sv_50k.txt'
)

KAIKKI_BASE = (
    'https://kaikki.org/dictionary/Swedish/pos-{pos}/'
    'kaikki.org-dictionary-Swedish-by-pos-{pos}.jsonl'
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

# Substrings anywhere in a gloss that indicate an inflected form or a
# non-lemma cross-reference, not a real standalone definition. Checked as
# "contains", not just prefix — Wiktionary often leads with a short label
# before the inflection note (e.g. "Dr; abbreviation of doktor").
SKIP_MARKERS = (
    'inflection of', 'conjugate of', 'form of',
    'plural of', 'singular of',
    'definite plural of', 'definite singular of',
    'indefinite plural of', 'indefinite singular of',
    'indefinite genitive', 'definite genitive',
    'genitive of', 'genitive plural of', 'genitive singular of',
    'past tense of', 'present tense of', 'past of ', 'present of ',
    'past participle of', 'present participle of',
    'passive of', 'imperative of', 'supine of', 'indicative of',
    'comparative of', 'superlative of', 'comparative degree of', 'superlative degree of',
    'first-person', 'second-person', 'third-person',
    'first/', 'second/', 'third/',
    'alternative form of', 'alternative spelling of',
    'misspelling of', 'obsolete form of', 'archaic form of',
    'abbreviation of', 'initialism of', 'eye dialect of',
    'diminutive of', 'augmentative of',
    'short form of', 'clipping of', 'contraction of',
)

# Pure grammatical function words (articles, personal/possessive/reflexive
# pronouns) whose only kaikki entries under noun/verb/adj/adv are rare,
# archaic, or misleading secondary senses — excluded outright rather than
# surfaced under a confusing gloss. Their real (pronoun/article) sense isn't
# covered by this pipeline at all.
FUNCTION_WORD_STOPLIST = {
    'en', 'ett', 'vi', 'min', 'mitt', 'mina', 'din', 'ditt', 'dina',
    'sin', 'sitt', 'sina', 'hans', 'hennes', 'dess', 'deras', 'vår',
    'vårt', 'våra', 'er', 'ert', 'era', 'det',
}

# Words that are common as an adverb/verb/interjection but whose kaikki
# NOUN-POS sense is a rare or archaic secondary meaning that would otherwise
# clutter the list right alongside the good entry for the same word (e.g.
# "vara" the noun "goods" vs. the far more useful "vara" the verb "to be").
NOUN_SENSE_STOPLIST = {
    'vara', 'göra', 'ja', 'nej', 'nu', 'här', 'så', 'för', 'med', 'tack',
    'van', 'väl', 'skulle',
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def is_lemma_gloss(gloss: str) -> bool:
    low = gloss.lower().strip()
    return not any(p in low for p in SKIP_MARKERS)


def extract_gender(entry: dict) -> str | None:
    """Swedish nouns are common (en-words) or neuter (ett-words)."""
    for tmpl in entry.get('head_templates', []):
        g = tmpl.get('args', {}).get('g', '')
        if g == 'c':
            return 'common'
        if g == 'n':
            return 'neuter'
    for sense in entry.get('senses', []):
        tags = sense.get('tags', [])
        if 'common-gender' in tags or 'common' in tags:
            return 'common'
        if 'neuter' in tags:
            return 'neuter'
    return None


def extract_plural(entry: dict) -> str | None:
    """Return the indefinite plural form (Swedish plurals take no article)."""
    for form in entry.get('forms', []):
        tags = form.get('tags', [])
        if 'plural' in tags and 'indefinite' in tags and 'nominative' in tags:
            val = form.get('form', '').strip()
            if val and val != '-':
                return val
    for form in entry.get('forms', []):
        tags = form.get('tags', [])
        if 'plural' in tags and 'indefinite' in tags:
            val = form.get('form', '').strip()
            if val and val != '-':
                return val
    return None


def extract_entry(raw: dict, kaikki_pos: str) -> dict | None:
    word = raw.get('word', '').strip()
    if not word or ' ' in word or len(word) < 2:
        return None
    if word.lower() in FUNCTION_WORD_STOPLIST:
        return None
    if kaikki_pos == 'noun' and word.lower() in NOUN_SENSE_STOPLIST:
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

def build(out_path: str, max_words: int, levels: set[str]) -> None:
    freq = load_frequencies(FREQUENCY_URL)

    # Keyed by (pos, word) — not word alone — so a word that's a common verb
    # AND has some rare, unrelated noun sense (e.g. "vara" = "to be" / "goods")
    # gets both entries instead of one silently blocking the other.
    all_entries: dict[tuple[str, str], dict] = {}
    for pos in ('noun', 'adj', 'adv', 'verb', 'intj'):
        entries = stream_kaikki(pos, freq)
        for word, entry in entries.items():
            all_entries[(pos, word)] = entry

    print(f'\nTotal unique (pos, word) entries with English translations: {len(all_entries):,}')

    def sort_key(entry: dict) -> tuple:
        return (-freq.get(entry['word'], 0), entry['word'])

    sorted_entries = sorted(all_entries.values(), key=sort_key)

    # Rank map (position in frequency list) for CEFR assignment
    rank_map: dict[str, int] = {}
    print('Re-loading frequency for CEFR rank mapping …')
    with urllib.request.urlopen(FREQUENCY_URL, timeout=30, context=_SSL_CTX) as resp:
        for i, line in enumerate(resp, 1):
            parts = line.decode('utf-8').strip().split()
            if parts:
                rank_map[parts[0].lower()] = i

    output = []
    for entry in sorted_entries:
        if len(output) >= max_words:
            break
        cefr = rank_to_cefr(rank_map.get(entry['word'].lower()))
        if cefr not in levels:
            continue

        obj: dict = {
            'id':             str(uuid.uuid4()),
            'part-of-speech': entry['pos'],
            'english':        entry['english'],
            'swedish':        entry['word'],
            'cefr':           cefr,
        }
        if 'gender' in entry:
            obj['gender'] = entry['gender']
        if 'plural' in entry:
            obj['plural'] = entry['plural']
        output.append(obj)

    wrapped = {
        'meta': {
            'language':       'Swedish',
            'languageCode':   'sv',
            'nativeLanguage': 'English',
            'targetField':    'swedish',
        },
        'words': output,
    }

    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(wrapped, f, ensure_ascii=False, indent=2)

    nouns = [e for e in output if e['part-of-speech'] == 'noun']
    verbs = [e for e in output if e['part-of-speech'] == 'verb']
    adjs  = [e for e in output if e['part-of-speech'] == 'adjective']
    advs  = [e for e in output if e['part-of-speech'] == 'adverb']
    n_gender = sum(1 for n in nouns if 'gender' in n)
    n_plural = sum(1 for n in nouns if 'plural' in n)
    by_cefr = {lv: sum(1 for e in output if e.get('cefr') == lv)
               for lv in ('A1', 'A2', 'B1', 'B2', 'C1', 'C2')}

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
    print(f"  CEFR:              {by_cefr}")
    print(f"  File size:         {size_kb:.0f} KB")
    print(f"{'='*52}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build Swedish vocabulary JSON')
    parser.add_argument('--out', default='language-data/swedish-vocabulary.json',
                        help='Output file (default: language-data/swedish-vocabulary.json)')
    parser.add_argument('--max', type=int, default=10000,
                        help='Maximum words to include (default: 10000)')
    parser.add_argument('--levels', default='A1,A2',
                        help='Comma-separated CEFR levels to include (default: A1,A2)')
    args = parser.parse_args()
    build(out_path=args.out, max_words=args.max, levels=set(args.levels.split(',')))
