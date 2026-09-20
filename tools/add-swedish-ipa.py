#!/usr/bin/env python3
"""
Add IPA pronunciations to Swedish vocabulary entries that lack them.

Streams kaikki.org Swedish data for each POS, extracts the first IPA
pronunciation from the `sounds` field, and updates swedish-vocabulary.json.

Run: python3 tools/add-swedish-ipa.py
"""

import json, ssl, urllib.request

_SSL_CTX = ssl._create_unverified_context()

KAIKKI_BASE = (
    'https://kaikki.org/dictionary/Swedish/pos-{pos}/'
    'kaikki.org-dictionary-Swedish-by-pos-{pos}.jsonl'
)

# kaikki.org POS slugs that cover the Swedish vocabulary POS types
KAIKKI_POS = ['noun', 'verb', 'adj', 'adv', 'intj']

VOCAB_PATH = 'language-data/swedish-vocabulary.json'


def fetch_ipa_map() -> dict[str, str]:
    """Stream kaikki.org Swedish data and return word → IPA dict."""
    ipa_map: dict[str, str] = {}

    for pos in KAIKKI_POS:
        url = KAIKKI_BASE.format(pos=pos)
        print(f'Streaming {pos}…', flush=True)
        try:
            with urllib.request.urlopen(url, timeout=300, context=_SSL_CTX) as resp:
                count = 0
                for raw in resp:
                    raw = raw.strip()
                    if not raw:
                        continue
                    try:
                        entry = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    word = entry.get('word', '').strip()
                    if not word:
                        continue

                    # Skip proper nouns / demonyms
                    if word[0].isupper():
                        continue

                    sounds = entry.get('sounds', [])
                    for s in sounds:
                        ipa = s.get('ipa', '').strip()
                        if ipa:
                            # Prefer entries that aren't tagged as a specific
                            # regional accent (tags-less entries first)
                            tags = s.get('tags', [])
                            if word not in ipa_map or not tags:
                                ipa_map[word] = ipa
                            if not tags:
                                break  # untagged = standard pronunciation, stop here

                    count += 1
                print(f'  {count:,} entries, {len(ipa_map):,} IPA entries total', flush=True)
        except Exception as e:
            print(f'  Error fetching {pos}: {e}', flush=True)

    return ipa_map


def main():
    print(f'Loading {VOCAB_PATH}…', flush=True)
    with open(VOCAB_PATH, encoding='utf-8') as f:
        data = json.load(f)

    words = data['words']
    total = len(words)
    missing = [w for w in words if not w.get('ipa', '').strip()]
    print(f'{total:,} total words, {len(missing):,} missing IPA\n')

    ipa_map = fetch_ipa_map()
    print(f'\nIPA map: {len(ipa_map):,} entries')

    added = 0
    not_found = []
    for w in words:
        if w.get('ipa', '').strip():
            continue
        swedish = w.get('swedish', '').strip()
        if not swedish:
            continue
        ipa = ipa_map.get(swedish)
        if ipa:
            w['ipa'] = ipa
            added += 1
        else:
            not_found.append(swedish)

    print(f'\nAdded IPA to {added:,} entries')
    print(f'Still missing: {len(not_found):,} entries')
    if not_found[:30]:
        print('Examples not found:', ', '.join(not_found[:30]))

    print(f'\nWriting {VOCAB_PATH}…', flush=True)
    with open(VOCAB_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    import os
    size_kb = os.path.getsize(VOCAB_PATH) / 1024
    print(f'Done. File size: {size_kb:.0f} KB')


if __name__ == '__main__':
    main()
