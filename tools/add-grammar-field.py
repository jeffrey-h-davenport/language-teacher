#!/usr/bin/env python3
"""
Back-fill a 'grammar' field on all Czech inflection entries in czech-vocabulary.json.

Noun entries:   infer case + number from the English description pattern.
Adjective entries: extract grammar from the parenthetical already in English
                   and clean the English to remove it.
Verb entries:   infer tense/mood + person/number from the English pattern.

Run: python3 tools/add-grammar-field.py
"""

import json, re, sys

# ── Pluralisation (must match add-czech-inflections.py exactly) ────────────────

PLURAL_IRREG = {
    'person': 'people', 'man': 'men', 'woman': 'women',
    'child': 'children', 'tooth': 'teeth', 'foot': 'feet',
    'mouse': 'mice', 'goose': 'geese', 'ox': 'oxen',
    'leaf': 'leaves', 'knife': 'knives', 'life': 'lives',
    'wife': 'wives', 'wolf': 'wolves', 'half': 'halves',
    'shelf': 'shelves', 'thief': 'thieves', 'self': 'selves',
    'loaf': 'loaves', 'scarf': 'scarves', 'calf': 'calves',
}

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


# ── Grammar inferrers ──────────────────────────────────────────────────────────

def grammar_noun(desc: str, singular_set: set, plural_map: dict) -> str:
    """Infer 'case number' from a noun English description."""
    d = desc.strip()

    if d.endswith('! (direct address)'):
        case = 'vocative'
        content = d[:-len('! (direct address)')].rstrip().rstrip('!').strip()
    elif d.endswith(' (direct object)'):
        case = 'accusative'
        content = d[:-len(' (direct object)')].strip()
    elif d.startswith('of '):
        case = 'genitive'
        content = d[3:].strip()
    elif d.startswith('to/for '):
        case = 'dative'
        content = d[7:].strip()
    elif d.startswith('about '):
        case = 'locative'
        content = d[6:].strip()
    elif d.startswith('with '):
        case = 'instrumental'
        content = d[5:].strip()
    else:
        # Nominative plural — the description IS the plural word
        return 'nominative pl'

    # Determine singular vs plural from whether content matches a base noun
    if content in singular_set:
        number = 'sg'
    elif content in plural_map:
        number = 'pl'
    else:
        # Fall back: if content ends with a common plural suffix assume plural
        number = 'pl' if (
            content.endswith('s') and content[:-1] in singular_set
        ) else 'sg'

    return f'{case} {number}'


def grammar_adj(desc: str) -> tuple[str, str]:
    """
    Extract grammar from 'word (gender, case number)' pattern.
    Returns (cleaned_english, grammar_label).
    """
    m = re.search(r'\(([^)]+)\)\s*$', desc)
    if m:
        grammar = m.group(1).strip()
        cleaned = desc[:m.start()].strip()
        return cleaned, grammar
    return desc, ''


def grammar_verb(desc: str) -> str:
    """Infer verb grammar from English description."""
    d = desc.strip()

    if d.endswith('(command, singular)'):
        return 'imperative 2sg'
    if d.endswith('(command, plural)'):
        return 'imperative 2pl'

    if 'would' in d:
        mood = 'cond.'
    else:
        mood = 'past'

    if d.startswith('I '):
        return f'{mood} 1sg'
    if d.startswith('you all '):
        gender = 'masc.' if '(masc.)' in d else ('fem.' if '(fem.)' in d else '')
        return f'{mood} 2pl' + (f' {gender}' if gender else '')
    if d.startswith('you '):
        return f'{mood} 2sg'
    if d.startswith('he '):
        return f'{mood} 3sg masc.'
    if d.startswith('she '):
        return f'{mood} 3sg fem.'
    if d.startswith('it '):
        return f'{mood} 3sg neut.'
    if d.startswith('we '):
        gender = 'masc.' if '(masc.)' in d else ('fem.' if '(fem.)' in d else '')
        return f'{mood} 1pl' + (f' {gender}' if gender else '')
    if d.startswith('they '):
        gender = 'masc.' if '(masc.)' in d else ('fem.' if '(fem.)' in d else '')
        return f'{mood} 3pl' + (f' {gender}' if gender else '')

    return ''


# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    path = 'language-data/czech-vocabulary.json'
    print(f'Loading {path}…', flush=True)
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    words = data['words']

    # Build singular and plural lookup sets from base (non-inflection) nouns
    base_nouns = [
        w for w in words
        if w.get('part-of-speech') in ('noun', 'pronoun')
        and 'grammar' not in w
    ]
    singular_set = {w['english'] for w in base_nouns}
    plural_map   = {to_plural(w['english']): w['english'] for w in base_nouns}

    print(f'Base noun singles: {len(singular_set):,}  plurals: {len(plural_map):,}')

    stats = {'noun': 0, 'adj': 0, 'verb': 0, 'skip': 0, 'already': 0}
    adj_english_cleaned = 0

    for w in words:
        if w.get('part-of-speech') != 'inflection':
            continue
        if 'grammar' in w:
            stats['already'] += 1
            continue

        desc = w.get('english', '')
        czech = w.get('czech', '')

        # Determine which generator produced this entry by pattern matching
        # Verb entries: start with subject pronoun or end with "(command, ...)"
        VERB_STARTS = ('I ', 'you ', 'he ', 'she ', 'it ', 'we ', 'they ')
        is_verb = (
            any(desc.startswith(s) for s in VERB_STARTS)
            or desc.endswith('(command, singular)')
            or desc.endswith('(command, plural)')
        )

        # Adjective entries: contain a parenthetical with "masc.", "fem.", or "neut."
        is_adj = bool(re.search(r'\((masc\.|fem\.|neut\.)', desc))

        if is_verb:
            w['grammar'] = grammar_verb(desc)
            stats['verb'] += 1
        elif is_adj:
            cleaned, grammar = grammar_adj(desc)
            w['grammar'] = grammar
            if cleaned != desc:
                w['english'] = cleaned
                adj_english_cleaned += 1
            stats['adj'] += 1
        else:
            # Noun (or unknown) — infer case/number
            w['grammar'] = grammar_noun(desc, singular_set, plural_map)
            stats['noun'] += 1

    print(f'\nGrammar fields added:')
    print(f'  Noun entries:      {stats["noun"]:>8,}')
    print(f'  Adjective entries: {stats["adj"]:>8,}  '
          f'({adj_english_cleaned:,} English descriptions cleaned)')
    print(f'  Verb entries:      {stats["verb"]:>8,}')
    print(f'  Already had field: {stats["already"]:>8,}')
    total = stats['noun'] + stats['adj'] + stats['verb']
    print(f'  Total updated:     {total:>8,}')

    print(f'\nWriting file…', flush=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    import os
    size_mb = os.path.getsize(path) / (1024 * 1024)
    print(f'Done. File size: {size_mb:.1f} MB')


if __name__ == '__main__':
    main()
