#!/usr/bin/env python3
"""One-time migration: split learning-progress fields out of each
<slug>-vocabulary.json into a sibling <slug>-progress.json, keyed by word id.

Vocabulary files keep everything except the five progress fields. Progress
files only get an entry for words that have actually been engaged (nonzero
score/attempts, learned, or a recorded lastSeen) — untouched words simply
have no entry and fall back to zero-state defaults when the app loads them.
"""
import json
import re
from pathlib import Path

LANGUAGE_DATA = Path(__file__).resolve().parent.parent / 'language-data'
PROGRESS_FIELDS = ('score', 'learned', 'totalAttempts', 'correctAttempts', 'lastSeen')


def has_trailing_newline(path):
    with open(path, 'rb') as f:
        f.seek(-1, 2)
        return f.read(1) == b'\n'


def is_engaged(word):
    return (
        word.get('score', 0) > 0
        or word.get('learned', False)
        or word.get('totalAttempts', 0) > 0
        or word.get('lastSeen') is not None
    )


def split_file(vocab_path):
    slug = re.match(r'^(.+)-vocabulary\.json$', vocab_path.name).group(1)
    progress_path = vocab_path.parent / f'{slug}-progress.json'

    trailing_newline = has_trailing_newline(vocab_path)

    with open(vocab_path, encoding='utf-8') as f:
        data = json.load(f)

    words_before = len(data['words'])
    progress = {}
    stripped_words = []
    for word in data['words']:
        if is_engaged(word):
            progress[word['id']] = {field: word.get(field, _default(field)) for field in PROGRESS_FIELDS}
        stripped_words.append({k: v for k, v in word.items() if k not in PROGRESS_FIELDS})

    data['words'] = stripped_words
    assert len(data['words']) == words_before, f'{vocab_path.name}: word count changed ({words_before} -> {len(data["words"])})'

    with open(vocab_path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        if trailing_newline:
            f.write('\n')

    progress_doc = {
        'meta': {'languageCode': data.get('meta', {}).get('languageCode', slug)},
        'progress': progress,
    }
    with open(progress_path, 'w', encoding='utf-8') as f:
        json.dump(progress_doc, f, ensure_ascii=False, indent=2)

    print(f'{slug}: {words_before} words, {len(progress)} with progress -> {vocab_path.name} + {progress_path.name}')


def _default(field):
    return {'score': 0, 'learned': False, 'totalAttempts': 0, 'correctAttempts': 0, 'lastSeen': None}[field]


if __name__ == '__main__':
    vocab_files = sorted(LANGUAGE_DATA.glob('*-vocabulary.json'))
    print(f'Found {len(vocab_files)} vocabulary files\n')
    for path in vocab_files:
        split_file(path)
