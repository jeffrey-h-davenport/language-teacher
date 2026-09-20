#!/usr/bin/env python3
"""
Add IPA pronunciations to French vocabulary entries that lack them.

Streams kaikki.org French data for each POS, extracts the first IPA
pronunciation from the `sounds` field, and updates french-vocabulary.json.

Run: python3 tools/add-french-ipa.py
"""

import json, ssl, urllib.request

_SSL_CTX = ssl._create_unverified_context()

KAIKKI_BASE = (
    'https://kaikki.org/dictionary/French/pos-{pos}/'
    'kaikki.org-dictionary-French-by-pos-{pos}.jsonl'
)

# kaikki.org POS slugs that cover the French vocabulary POS types
KAIKKI_POS = ['noun', 'verb', 'adj', 'adv', 'conj', 'intj', 'prep', 'particle', 'phrase']

VOCAB_PATH = 'language-data/french-vocabulary.json'


def fetch_ipa_map() -> dict[str, str]:
    """Stream kaikki.org French data and return word → IPA dict."""
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
        french = w.get('french', '').strip()
        if not french:
            continue
        ipa = ipa_map.get(french)
        if ipa:
            w['ipa'] = ipa
            added += 1
        else:
            not_found.append(french)

    print(f'\nAdded IPA to {added:,} entries')
    print(f'Still missing: {len(not_found):,} entries')
    if not_found[:30]:
        print('Examples not found:', ', '.join(not_found[:30]))

    print(f'\nWriting {VOCAB_PATH}…', flush=True)
    with open(VOCAB_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    import os
    size_mb = os.path.getsize(VOCAB_PATH) / (1024 * 1024)
    print(f'Done. File size: {size_mb:.1f} MB')


if __name__ == '__main__':
    main()
