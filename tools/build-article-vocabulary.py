#!/usr/bin/env python3
"""
Extract French vocabulary from a text file and append new words to french-vocabulary.json.

Run: python3 tools/build-article-vocabulary.py --file article.txt [--min-count 1] [--max 200]
     python3 tools/build-article-vocabulary.py --file article.txt --vocab language-data/german-vocabulary.json --lang German
"""

import argparse, json, re, ssl, unicodedata, urllib.request, uuid
from collections import Counter

_SSL_CTX = ssl._create_unverified_context()

KAIKKI_BASE = (
    'https://kaikki.org/dictionary/{lang}/pos-{pos}/'
    'kaikki.org-dictionary-{lang}-by-pos-{pos}.jsonl'
)
FREQ_URLS = {
    'French':  'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt',
    'German':  'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/de/de_50k.txt',
}
VOCAB_FIELD = {
    'French': 'french',
    'German': 'german',
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

ELISION_PREFIXES = {
    'l', 'j', 'm', 't', 's', 'n', 'd', 'c',
    'qu', 'jusqu', 'lorsqu', 'puisqu', 'quoiqu',
}

POS_MAP = {
    'noun': 'noun', 'verb': 'verb', 'adj': 'adjective',
    'adv': 'adverb', 'prep': 'preposition', 'conj': 'conjunction',
    'intj': 'interjection',
}


def find_proper_nouns_fr(text: str) -> set[str]:
    """
    Return lowercase forms of words that appear predominantly capitalized
    in non-sentence-initial positions (i.e. proper nouns in French text).
    Threshold: ≥50% of occurrences are mid-sentence capitals.
    """
    text = text.replace('‘', "'").replace('’', "'")
    sentence_end = re.compile(r'[.!?»]\s*$')
    cap_count:   Counter = Counter()
    total_count: Counter = Counter()
    prev_ends_sentence = True

    for raw in re.split(r'\s+', text):
        clean = re.sub(r'^[^\wÀ-ɏ\']+|[^\wÀ-ɏ\']+$', '', raw)
        if not clean or len(clean) <= 2:
            if sentence_end.search(raw):
                prev_ends_sentence = True
            continue
        lower = clean.lower()
        total_count[lower] += 1
        if clean[0].isupper() and not prev_ends_sentence:
            cap_count[lower] += 1
        prev_ends_sentence = bool(sentence_end.search(raw))

    return {w for w, total in total_count.items()
            if total >= 1 and cap_count.get(w, 0) / total >= 0.5}


def is_lemma_gloss(gloss: str) -> bool:
    low = gloss.lower().strip()
    if any(p in low for p in BAD_PHRASES):
        return False
    tokens = re.split(r'[\s/\-,]+', low)
    return not any(t in GRAM_TOKENS for t in tokens[:4])


def strip_accents(s: str) -> str:
    return unicodedata.normalize('NFD', s).encode('ascii', 'ignore').decode().lower()


def tokenize_fr(text: str) -> list[str]:
    text = text.replace('‘', "'").replace('’', "'")
    tokens = []
    for chunk in re.split(r'\s+', text):
        chunk = re.sub(r'^[^\wÀ-ɏ\-\']+|[^\wÀ-ɏ\-\']+$', '', chunk)
        if not chunk:
            continue
        if chunk == chunk.upper() and re.search(r'[A-Z]', chunk):
            continue
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
        if re.match(r'^\d+[\d.,]*$', chunk) or len(chunk) <= 1:
            continue
        tokens.append(chunk.lower())
    return tokens


def tokenize_de(text: str) -> list[str]:
    tokens = []
    for chunk in re.split(r'\s+', text):
        chunk = re.sub(r'^[^\wÄÖÜäöüß\-]+|[^\wÄÖÜäöüß\-]+$', '', chunk)
        if not chunk:
            continue
        if chunk == chunk.upper() and re.search(r'[A-ZÄÖÜ]', chunk):
            continue
        if re.match(r'^\d+\.?$', chunk):
            continue
        if len(chunk) <= 2:
            continue
        if '-' in chunk:
            continue
        tokens.append(chunk)
    return tokens


def stream_kaikki(lang: str, pos: str) -> tuple[dict, dict]:
    url = KAIKKI_BASE.format(lang=lang, pos=pos)
    print(f'Streaming kaikki.org {lang} {pos}…', flush=True)
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
            # For French, capitalized lemmas are proper nouns / demonyms
            if lang == 'French' and word[0].isupper():
                continue
            english = None
            for sense in entry.get('senses', []):
                glosses = sense.get('glosses', [])
                if glosses and is_lemma_gloss(glosses[0]):
                    english = glosses[0].strip()
                    break
            if not english:
                continue

            gender = ''
            if pos == 'noun':
                for ht in entry.get('head_templates', []):
                    g = ht.get('args', {}).get('g', ht.get('args', {}).get('1', ''))
                    if g.startswith('m'):
                        gender = 'masculine'; break
                    elif g.startswith('f'):
                        gender = 'feminine'; break
                    elif g in ('n', 'nm', 'nf'):
                        gender = 'neuter'; break
                if not gender:
                    for tag in entry.get('tags', []):
                        if tag in ('masculine', 'feminine', 'neuter'):
                            gender = tag; break

            plural = ''
            if pos == 'noun':
                for f in entry.get('forms', []):
                    tags = set(f.get('tags', []))
                    if 'plural' in tags and ('nominative' in tags or lang == 'French'):
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
            form_to_lemma[word.lower()] = word
            for f in entry.get('forms', []):
                fv = f.get('form', '').strip().lower()
                if fv and fv != '-' and len(fv) > 1 and fv not in form_to_lemma:
                    form_to_lemma[fv] = word

    print(f'  {len(lemma_entries):,} lemmas, {len(form_to_lemma):,} form mappings', flush=True)
    return lemma_entries, form_to_lemma


def load_freq(lang: str) -> dict[str, int]:
    url = FREQ_URLS[lang]
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


def main():
    parser = argparse.ArgumentParser(description='Add vocabulary from a text file')
    parser.add_argument('--file',      required=True,    help='Text file to process')
    parser.add_argument('--vocab',     default='language-data/french-vocabulary.json')
    parser.add_argument('--lang',      default='French', choices=['French', 'German'])
    parser.add_argument('--min-count', type=int, default=1,
                        help='Min occurrences in text to consider (default: 1)')
    parser.add_argument('--max',       type=int, default=200,
                        help='Max new entries to add (default: 200)')
    args = parser.parse_args()

    with open(args.file, encoding='utf-8') as f:
        text = f.read()

    if args.lang == 'French':
        proper_nouns = find_proper_nouns_fr(text)
        tokens = tokenize_fr(text)
    else:
        proper_nouns = set()
        tokens = tokenize_de(text)

    text_freq = Counter(tokens)
    print(f'Article: {len(tokens):,} tokens, {len(text_freq):,} unique'
          + (f', {len(proper_nouns):,} proper noun forms filtered' if proper_nouns else ''))

    with open(args.vocab, encoding='utf-8') as f:
        data = json.load(f)
    words     = data.get('words', [])
    lang_field = VOCAB_FIELD[args.lang]
    existing: set[str] = set()
    for w in words:
        val = w.get(lang_field, '')
        existing.add(val.lower())
        existing.add(strip_accents(val))
    print(f'Existing vocab: {len(words):,} words')

    all_lemmas: dict = {}
    all_forms:  dict = {}
    for pos in ('noun', 'verb', 'adj', 'adv'):
        lemmas, forms = stream_kaikki(args.lang, pos)
        for w, info in lemmas.items():
            if w not in all_lemmas:
                all_lemmas[w] = info
        for f, lemma in forms.items():
            if f not in all_forms:
                all_forms[f] = lemma

    rank_map = load_freq(args.lang)

    lemma_freq: Counter = Counter()
    for form, count in text_freq.items():
        if count < args.min_count:
            continue
        if form in proper_nouns:
            continue
        if form in existing or strip_accents(form) in existing:
            continue
        if rank_map.get(form, 999999) <= 300:
            continue
        lemma = all_forms.get(form, form)
        if form != lemma.lower() and rank_map.get(form, 999999) <= 500:
            continue
        if lemma.lower() not in existing and strip_accents(lemma) not in existing \
                and lemma in all_lemmas:
            lemma_freq[lemma] += count

    print(f'\nNew lemma candidates: {len(lemma_freq):,}')

    seen_lower: set[str] = set()
    top_candidates: list[tuple[str, int]] = []
    for lemma, count in lemma_freq.most_common():
        if lemma.lower() not in seen_lower:
            seen_lower.add(lemma.lower())
            top_candidates.append((lemma, count))
        if len(top_candidates) >= args.max:
            break

    new_entries = []
    for lemma, _ in top_candidates:
        info  = all_lemmas[lemma]
        rank  = rank_map.get(lemma.lower())
        entry: dict = {
            'id':             str(uuid.uuid4()),
            'part-of-speech': info['pos'],
            'english':        info['english'],
            lang_field:       lemma,
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
    with open(args.vocab, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    by_cefr = Counter(e['cefr'] for e in new_entries)
    print(f'\nAdded {len(new_entries):,} new entries to {args.vocab}')
    print(f'CEFR breakdown: {dict(sorted(by_cefr.items()))}')
    print(f'Total words now: {len(data["words"]):,}')
    print(f'\nAll new words by frequency in article:')
    print(f'  {"Word":<28} {"Freq":>4}  {"POS":<12}  English')
    print(f'  {"-"*28} {"-"*4}  {"-"*12}  {"-"*45}')
    for lemma, count in top_candidates:
        info = all_lemmas[lemma]
        print(f'  {lemma:<28} {count:>4}  {info["pos"]:<12}  {info["english"][:45]}')


if __name__ == '__main__':
    main()
