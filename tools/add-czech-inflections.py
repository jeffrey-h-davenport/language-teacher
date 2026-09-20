#!/usr/bin/env python3
"""
Add Czech inflection entries to czech-vocabulary.json using kaikki.org form data.

Generates:
  Nouns:      13 case × number forms (skip nominative singular)
  Adjectives: case × number × gender forms (skip masculine nominative singular)
  Verbs:      past tense (11 entries), conditional (11), imperative (2)

Run: python3 tools/add-czech-inflections.py
"""

import json
import ssl
import sys
import urllib.request
import uuid

_SSL_CTX = ssl._create_unverified_context()
KAIKKI_BASE = (
    'https://kaikki.org/dictionary/Czech/pos-{pos}/'
    'kaikki.org-dictionary-Czech-by-pos-{pos}.jsonl'
)

# ── English morphology helpers ─────────────────────────────────────────────────

IRREGULAR_PAST = {
    'be': 'was/were', 'have': 'had', 'do': 'did', 'go': 'went',
    'come': 'came', 'see': 'saw', 'give': 'gave', 'take': 'took',
    'know': 'knew', 'get': 'got', 'make': 'made', 'think': 'thought',
    'say': 'said', 'tell': 'told', 'put': 'put', 'bring': 'brought',
    'find': 'found', 'buy': 'bought', 'leave': 'left', 'feel': 'felt',
    'keep': 'kept', 'meet': 'met', 'sit': 'sat', 'stand': 'stood',
    'hear': 'heard', 'write': 'wrote', 'read': 'read', 'run': 'ran',
    'fall': 'fell', 'hold': 'held', 'cut': 'cut', 'hit': 'hit',
    'let': 'let', 'set': 'set', 'send': 'sent', 'lose': 'lost',
    'pay': 'paid', 'break': 'broke', 'grow': 'grew', 'eat': 'ate',
    'drink': 'drank', 'sleep': 'slept', 'speak': 'spoke',
    'teach': 'taught', 'catch': 'caught', 'build': 'built',
    'win': 'won', 'spend': 'spent', 'lead': 'led', 'begin': 'began',
    'fight': 'fought', 'understand': 'understood', 'choose': 'chose',
    'forget': 'forgot', 'rise': 'rose', 'ring': 'rang', 'sing': 'sang',
    'swim': 'swam', 'throw': 'threw', 'fly': 'flew', 'blow': 'blew',
    'draw': 'drew', 'wear': 'wore', 'tear': 'tore', 'steal': 'stole',
    'freeze': 'froze', 'ride': 'rode', 'bite': 'bit', 'hide': 'hid',
    'become': 'became', 'drive': 'drove', 'sell': 'sold', 'mean': 'meant',
    'deal': 'dealt', 'kneel': 'knelt', 'shine': 'shone', 'sink': 'sank',
    'spring': 'sprang', 'show': 'showed', 'lend': 'lent', 'wake': 'woke',
    'hang': 'hung', 'strike': 'struck', 'shoot': 'shot', 'shut': 'shut',
    'spread': 'spread', 'split': 'split', 'hurt': 'hurt', 'beat': 'beat',
    'swear': 'swore', 'bear': 'bore', 'wind': 'wound', 'bind': 'bound',
    'grind': 'ground', 'burst': 'burst', 'cast': 'cast', 'cost': 'cost',
    'quit': 'quit', 'rid': 'rid', 'shed': 'shed', 'spin': 'spun',
    'string': 'strung', 'swear': 'swore', 'weep': 'wept', 'sweep': 'swept',
    'creep': 'crept', 'leap': 'leaped', 'smell': 'smelled',
    'learn': 'learned', 'burn': 'burned', 'dream': 'dreamed',
    'lie': 'lay', 'lay': 'laid',
}

PLURAL_IRREG = {
    'person': 'people', 'man': 'men', 'woman': 'women',
    'child': 'children', 'tooth': 'teeth', 'foot': 'feet',
    'mouse': 'mice', 'goose': 'geese', 'ox': 'oxen',
    'leaf': 'leaves', 'knife': 'knives', 'life': 'lives',
    'wife': 'wives', 'wolf': 'wolves', 'half': 'halves',
    'shelf': 'shelves', 'thief': 'thieves', 'self': 'selves',
    'loaf': 'loaves', 'scarf': 'scarves', 'calf': 'calves',
}

def to_past(english_inf: str) -> str:
    b = english_inf.strip()
    if b.startswith('to '):
        b = b[3:].strip()
    b = b.lower()
    if b in IRREGULAR_PAST:
        return IRREGULAR_PAST[b]
    if b.endswith('e') and not b.endswith(('ee', 'oe')):
        return b + 'd'
    if b.endswith('y') and len(b) > 1 and b[-2] not in 'aeiou':
        return b[:-1] + 'ied'
    if (len(b) >= 3 and b[-1] not in 'aeiouhwxy'
            and b[-2] in 'aeiou' and b[-3] not in 'aeiou' and len(b) <= 5):
        return b + b[-1] + 'ed'
    return b + 'ed'

def to_plural(english: str) -> str:
    w = english.strip().lower()
    if w in PLURAL_IRREG:
        return PLURAL_IRREG[w]
    if w.endswith(('s', 'sh', 'ch', 'x', 'z')):
        return english + 'es'
    if w.endswith('y') and len(w) > 1 and w[-2] not in 'aeiou':
        return english[:-1] + 'ies'
    if w.endswith('fe') and w not in ('cafe',):
        return english[:-2] + 'ves'
    return english + 's'

def base_verb(english: str) -> str:
    b = english.strip()
    if b.startswith('to '):
        b = b[3:].strip()
    return b

def combine_mf(m: str, f: str) -> str:
    """Combine masculine/feminine forms: miloval/milovala → miloval(a)."""
    if not f or f == m:
        return m
    if f.startswith(m):
        return m + '(' + f[len(m):] + ')'
    return m + '/' + f


# ── English description builders ───────────────────────────────────────────────

def noun_en(english: str, case: str, number: str) -> str:
    w  = english
    wp = to_plural(english)
    return {
        ('genitive',     'singular'): f'of {w}',
        ('dative',       'singular'): f'to/for {w}',
        ('accusative',   'singular'): f'{w} (direct object)',
        ('vocative',     'singular'): f'{w}! (direct address)',
        ('locative',     'singular'): f'about {w}',
        ('instrumental', 'singular'): f'with {w}',
        ('nominative',   'plural'):   wp,
        ('genitive',     'plural'):   f'of {wp}',
        ('dative',       'plural'):   f'to/for {wp}',
        ('accusative',   'plural'):   f'{wp} (direct object)',
        ('vocative',     'plural'):   f'{wp}! (direct address)',
        ('locative',     'plural'):   f'about {wp}',
        ('instrumental', 'plural'):   f'with {wp}',
    }.get((case, number), '')

GSHORT = {'masculine': 'masc.', 'feminine': 'fem.', 'neuter': 'neut.'}
NSHORT = {'singular': 'sg', 'plural': 'pl'}

def adj_en(english: str, case: str, number: str, gender: str) -> str:
    return f'{english} ({GSHORT.get(gender, gender)}, {case} {NSHORT.get(number, number)})'


# ── kaikki.org streaming ────────────────────────────────────────────────────────

def stream_kaikki(pos: str) -> dict[str, list]:
    """Returns {lemma: [form_objects]} — only entries that have forms."""
    url = KAIKKI_BASE.format(pos=pos)
    print(f'Streaming {pos}…', flush=True)
    data: dict[str, list] = {}
    n = 0
    try:
        with urllib.request.urlopen(url, timeout=300, context=_SSL_CTX) as resp:
            for raw in resp:
                raw = raw.strip()
                if not raw:
                    continue
                try:
                    entry = json.loads(raw)
                except json.JSONDecodeError:
                    continue
                word  = entry.get('word', '').strip()
                forms = entry.get('forms', [])
                if not word or not forms:
                    continue
                data.setdefault(word, [])
                data[word].extend(forms)
                n += 1
    except Exception as e:
        print(f'  ERROR: {e}', file=sys.stderr)
    print(f'  {len(data):,} lemmas with forms', flush=True)
    return data


# ── Form-picker helpers ─────────────────────────────────────────────────────────

def pick_first(forms: list, required: set, exclude: set = frozenset()) -> str | None:
    for f in forms:
        tags = set(f.get('tags', []))
        if required.issubset(tags) and not tags.intersection(exclude):
            v = f.get('form', '').strip()
            if v and v != '-':
                return v
    return None

def pick_all(forms: list, required: set, exclude: set = frozenset()) -> list[str]:
    seen, out = set(), []
    for f in forms:
        tags = set(f.get('tags', []))
        if required.issubset(tags) and not tags.intersection(exclude):
            v = f.get('form', '').strip()
            if v and v != '-' and v not in seen:
                seen.add(v)
                out.append(v)
    return out


# ── Entry generators ────────────────────────────────────────────────────────────

CASES   = ['nominative', 'genitive', 'dative', 'accusative', 'vocative', 'locative', 'instrumental']
NUMBERS = ['singular', 'plural']
GENDERS = ['masculine', 'feminine', 'neuter']

def make_entry(english: str, czech: str, cefr: str, grammar: str = '') -> dict:
    entry = {
        'id':             str(uuid.uuid4()),
        'part-of-speech': 'inflection',
        'english':        english,
        'czech':          czech,
        'cefr':           cefr,
        'score':          0,
        'learned':        False,
    }
    if grammar:
        entry['grammar'] = grammar
    return entry

def gen_noun(vocab_word: dict, forms: list) -> list:
    english = vocab_word.get('english', '')
    cefr    = vocab_word.get('cefr', '')
    entries = []
    for case in CASES:
        for num in NUMBERS:
            if case == 'nominative' and num == 'singular':
                continue
            cz_variants = pick_all(forms, {case, num},
                                   exclude={'table-tags', 'inflection-template', 'passive',
                                            'participle', 'colloquial'})
            if not cz_variants:
                continue
            cz = ' / '.join(cz_variants)
            en = noun_en(english, case, num)
            if en:
                num_short = 'sg' if num == 'singular' else 'pl'
                entries.append(make_entry(en, cz, cefr, f'{case} {num_short}'))
    return entries

def gen_adj(vocab_word: dict, forms: list) -> list:
    english = vocab_word.get('english', '')
    cefr    = vocab_word.get('cefr', '')
    entries = []
    for gender in GENDERS:
        for case in CASES:
            for num in NUMBERS:
                if gender == 'masculine' and case == 'nominative' and num == 'singular':
                    continue  # that's the vocab entry itself
                excl = {'table-tags', 'inflection-template', 'passive',
                        'participle', 'colloquial', 'comparative', 'superlative',
                        'adverb', 'transgressive'}
                # For feminine/neuter exclude the other genders
                gender_excl = set()
                if gender == 'feminine':
                    gender_excl = {'masculine', 'neuter'}
                elif gender == 'neuter':
                    gender_excl = {'masculine', 'feminine'}
                cz_variants = pick_all(forms, {gender, case, num},
                                       exclude=excl | gender_excl)
                if not cz_variants:
                    continue
                cz = ' / '.join(cz_variants)
                grammar = f'{GSHORT.get(gender, gender)}, {case} {NSHORT.get(num, num)}'
                en = english  # just the base meaning; grammar goes in the grammar field
                entries.append(make_entry(en, cz, cefr, grammar))
    return entries

def gen_verb(vocab_word: dict, forms: list) -> list:
    english = vocab_word.get('english', '')
    cefr    = vocab_word.get('cefr', '')
    past_en = to_past(english)
    base_en = base_verb(english)
    entries = []

    # ── Past l-participle forms ────────────────────────────────────────────────
    excl = {'table-tags', 'inflection-template', 'passive', 'colloquial',
            'transgressive', 'adjectival', 'indicative', 'imperative', 'present',
            'infinitive', 'future'}

    m_sg = pick_first(forms, {'masculine', 'animate', 'participle', 'past', 'singular'}, excl)
    if not m_sg:
        m_sg = pick_first(forms, {'masculine', 'participle', 'past', 'singular'}, excl)
    f_sg  = pick_first(forms, {'feminine', 'participle', 'past', 'singular'}, excl)
    n_sg  = pick_first(forms, {'neuter',   'participle', 'past', 'singular'}, excl)
    m_pl  = pick_first(forms, {'masculine', 'animate', 'participle', 'past', 'plural'}, excl)
    if not m_pl:
        m_pl = pick_first(forms, {'masculine', 'participle', 'past', 'plural'}, excl)
    f_pl  = pick_first(forms, {'feminine', 'participle', 'past', 'plural'}, excl)
    if not f_pl:
        f_pl = pick_first(forms, {'inanimate', 'masculine', 'participle', 'past', 'plural'}, excl)

    # Past tense entries (using l-participle + auxiliary)
    if m_sg:
        mf_sg = combine_mf(m_sg, f_sg)
        mf_pl_m = m_pl or ''
        mf_pl_f = f_pl or ''

        # 1sg / 2sg: combined m/f form
        entries.append(make_entry(f'I {past_en}',         f'jsem {mf_sg}',   cefr, 'past 1sg'))
        entries.append(make_entry(f'you {past_en}',       f'jsi {mf_sg}',    cefr, 'past 2sg'))
        # 3sg: separate m / f / n
        entries.append(make_entry(f'he {past_en}',        m_sg,              cefr, 'past 3sg masc.'))
        if f_sg and f_sg != m_sg:
            entries.append(make_entry(f'she {past_en}',   f_sg,              cefr, 'past 3sg fem.'))
        if n_sg and n_sg not in (m_sg, f_sg):
            entries.append(make_entry(f'it {past_en}',    n_sg,              cefr, 'past 3sg neut.'))
        # 1pl / 2pl: masculine animate vs other
        if mf_pl_m:
            entries.append(make_entry(f'we {past_en} (masc.)',      f'jsme {mf_pl_m}',  cefr, 'past 1pl masc.'))
        if mf_pl_f and mf_pl_f != mf_pl_m:
            entries.append(make_entry(f'we {past_en} (fem.)',       f'jsme {mf_pl_f}',  cefr, 'past 1pl fem.'))
        if mf_pl_m:
            entries.append(make_entry(f'you all {past_en} (masc.)', f'jste {mf_pl_m}',  cefr, 'past 2pl masc.'))
        if mf_pl_f and mf_pl_f != mf_pl_m:
            entries.append(make_entry(f'you all {past_en} (fem.)',  f'jste {mf_pl_f}',  cefr, 'past 2pl fem.'))
        if mf_pl_m:
            entries.append(make_entry(f'they {past_en} (masc.)',    mf_pl_m,            cefr, 'past 3pl masc.'))
        if mf_pl_f and mf_pl_f != mf_pl_m:
            entries.append(make_entry(f'they {past_en} (fem.)',     mf_pl_f,            cefr, 'past 3pl fem.'))

        # ── Conditional (bych/bys/by/bychom/byste/by + l-participle) ────────
        COND = [
            ('I',        'bych',   mf_sg,           'cond. 1sg'),
            ('you',      'bys',    mf_sg,           'cond. 2sg'),
            ('he',       'by',     m_sg,            'cond. 3sg masc.'),
            ('she',      'by',     f_sg or m_sg,    'cond. 3sg fem.'),
            ('it',       'by',     n_sg or m_sg,    'cond. 3sg neut.'),
            ('we',       'bychom', mf_pl_m or mf_sg,'cond. 1pl'),
            ('you all',  'byste',  mf_pl_m or mf_sg,'cond. 2pl'),
            ('they',     'by',     mf_pl_m or mf_sg,'cond. 3pl'),
        ]
        for subj, aux, part, gram in COND:
            if not part:
                continue
            entries.append(make_entry(
                f'{subj} would {base_en}',
                f'{aux} {part}',
                cefr,
                gram,
            ))

    # ── Imperative ─────────────────────────────────────────────────────────────
    imp_excl = {'table-tags', 'inflection-template', 'passive', 'colloquial',
                'indicative', 'present', 'future', 'participle', 'transgressive'}
    imp_2sg = pick_first(forms, {'imperative', 'second-person', 'singular'}, imp_excl)
    imp_2pl = pick_first(forms, {'imperative', 'second-person', 'plural'},   imp_excl)

    if imp_2sg:
        entries.append(make_entry(f'{base_en}! (command, singular)', imp_2sg + '!', cefr, 'imperative 2sg'))
    if imp_2pl and imp_2pl != imp_2sg:
        entries.append(make_entry(f'{base_en}! (command, plural)',   imp_2pl + '!', cefr, 'imperative 2pl'))

    return entries


# ── Main ────────────────────────────────────────────────────────────────────────

def main():
    path = 'language-data/czech-vocabulary.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    words = data.get('words', [])

    nouns = [w for w in words if w.get('part-of-speech') in ('noun', 'pronoun')]
    adjs  = [w for w in words if w.get('part-of-speech') == 'adjective']
    verbs = [w for w in words if w.get('part-of-speech') == 'verb']

    print(f'Czech vocab: {len(words):,} words  '
          f'({len(nouns):,} nouns, {len(adjs):,} adj, {len(verbs):,} verbs)')

    noun_db = stream_kaikki('noun')
    adj_db  = stream_kaikki('adj')
    verb_db = stream_kaikki('verb')

    new_entries = []
    stats = {'noun': [0, 0], 'adj': [0, 0], 'verb': [0, 0]}  # [added, missing]

    for w in nouns:
        cz    = w.get('czech', '')
        forms = noun_db.get(cz, [])
        if not forms:
            stats['noun'][1] += 1
            continue
        e = gen_noun(w, forms)
        new_entries.extend(e)
        stats['noun'][0] += len(e)

    for w in adjs:
        cz    = w.get('czech', '')
        forms = adj_db.get(cz, [])
        if not forms:
            stats['adj'][1] += 1
            continue
        e = gen_adj(w, forms)
        new_entries.extend(e)
        stats['adj'][0] += len(e)

    for w in verbs:
        cz    = w.get('czech', '')
        forms = verb_db.get(cz, [])
        if not forms:
            stats['verb'][1] += 1
            continue
        e = gen_verb(w, forms)
        new_entries.extend(e)
        stats['verb'][0] += len(e)

    print(f'\nGenerated inflection entries:')
    print(f'  From nouns:      {stats["noun"][0]:>7,}  ({stats["noun"][1]:,} words not in kaikki.org)')
    print(f'  From adjectives: {stats["adj"][0]:>7,}  ({stats["adj"][1]:,} words not in kaikki.org)')
    print(f'  From verbs:      {stats["verb"][0]:>7,}  ({stats["verb"][1]:,} words not in kaikki.org)')
    print(f'  Total new:       {len(new_entries):>7,}')

    data['words'] = new_entries + words

    print(f'\nWriting file… ({len(data["words"]):,} total entries)', flush=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    import os
    size_mb = os.path.getsize(path) / (1024 * 1024)
    print(f'Done. File size: {size_mb:.1f} MB')

if __name__ == '__main__':
    main()
