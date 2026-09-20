#!/usr/bin/env python3
"""
Migrate alwaysPlural/collective boolean flags to a single countability field.

  alwaysPlural: true  →  countability: 'plural-only'
  collective: true    →  countability: 'collective'
  (neither)           →  no countability field (default: countable)

Run: python3 tools/migrate-countability.py
"""

import json, os, glob

VOCAB_FILES = glob.glob('language-data/*-vocabulary.json')

for path in sorted(VOCAB_FILES):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    words = data['words'] if isinstance(data, dict) else data
    migrated = 0

    for w in words:
        if w.get('part-of-speech') != 'noun':
            continue
        if w.pop('alwaysPlural', None):
            w['countability'] = 'plural-only'
            migrated += 1
        elif w.pop('collective', None):
            w['countability'] = 'collective'
            migrated += 1

    if migrated:
        with open(path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        size_mb = os.path.getsize(path) / (1024 * 1024)
        print(f'{path}: {migrated} entries migrated  ({size_mb:.1f} MB)')
    else:
        print(f'{path}: nothing to migrate')

print('Done.')
