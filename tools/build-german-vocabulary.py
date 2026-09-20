#!/usr/bin/env python3
"""
Builds vocabulary.json from two sources:
  1. Nordsword3m/German-Words  — main source (nouns, verbs, adjectives with EN translations + frequency)
  2. gambolputty/german-nouns  — fallback for noun gender/plural where missing from source 1

Run:
  python3 build-vocabulary.py \
    --words    <path/to/german-words/data/all.json> \
    --nouns    <path/to/german-nouns.csv>           \
    --out      vocabulary.json                      \
    --max      10000
"""

import argparse
import csv
import json
import os
import uuid

GENDER_MAP = {'m': 'masculine', 'f': 'feminine', 'n': 'neuter'}


def load_nordsword(path: str) -> list[dict]:
    print(f"Loading {path} …")
    with open(path, encoding='utf-8') as f:
        return json.load(f)


def load_gambolputty(path: str) -> dict[str, dict]:
    """Returns {lemma: {gender, plural}} from the CSV (primary columns only)."""
    print(f"Loading {path} …")
    result = {}
    with open(path, encoding='utf-8', newline='') as f:
        reader = csv.DictReader(f)
        for row in reader:
            lemma = row.get('lemma', '').strip()
            if not lemma:
                continue

            # Gender — prefer 'genus', fall back to numbered variants
            raw_gender = (
                row.get('genus') or
                row.get('genus 1') or ''
            ).strip().lower()
            gender = None
            if raw_gender in ('m', 'maskulinum'):
                gender = 'masculine'
            elif raw_gender in ('f', 'femininum'):
                gender = 'feminine'
            elif raw_gender in ('n', 'neutrum'):
                gender = 'neuter'

            # Plural nominative — prefer plain column, then numbered variants
            plural = (
                row.get('nominativ plural') or
                row.get('nominativ plural 1') or
                row.get('nominativ plural*') or ''
            ).strip() or None

            if gender or plural:
                result[lemma] = {'gender': gender, 'plural': plural}

    print(f"  {len(result):,} nouns loaded from gambolputty")
    return result


def convert(words_path: str, nouns_path: str | None, out_path: str, max_words: int):
    raw       = load_nordsword(words_path)
    gam_nouns = load_gambolputty(nouns_path) if nouns_path and os.path.exists(nouns_path) else {}

    # ── Filter: must have an English translation ────────────────────────────
    filtered = [w for w in raw if w.get('translations', {}).get('en')]
    print(f"Entries with English translation: {len(filtered):,}")

    # ── Sort by frequency descending (missing freq → 0) ─────────────────────
    filtered.sort(key=lambda w: w.get('frequency') or 0, reverse=True)

    output = []
    skipped = 0

    for word in filtered:
        if len(output) >= max_words:
            break

        wtype  = word.get('type', '')
        lemma  = word.get('lemma', '')
        en_translations = word.get('translations', {}).get('en', [])
        english = en_translations[0] if en_translations else None

        if not english or not lemma:
            skipped += 1
            continue

        # Remove "to " prefix that some verbs carry in English translations
        # (keep it — it's useful in the quiz: "to run" vs "run")
        # Actually English verb translations in this dataset don't consistently
        # use "to", so we leave them as-is.

        entry: dict = {
            'id':             str(uuid.uuid4()),
            'part-of-speech': wtype,  # 'noun' | 'verb' | 'adjective'
            'english':        english,
            'german':         lemma,
        }

        # ── Noun-specific fields ─────────────────────────────────────────────
        if wtype == 'noun':
            raw_gender = word.get('gender')
            gender = GENDER_MAP.get(raw_gender) if raw_gender else None

            plural = (
                word.get('cases', {})
                    .get('nominative', {})
                    .get('plural')
            )

            # Fill gaps from gambolputty
            if (not gender or not plural) and lemma in gam_nouns:
                gam = gam_nouns[lemma]
                if not gender:
                    gender = gam.get('gender')
                if not plural:
                    plural = gam.get('plural')

            if gender:
                entry['gender'] = gender
            if plural:
                entry['plural'] = plural

        output.append(entry)

    # ── Write (with metadata wrapper) ────────────────────────────────────────
    wrapped = {
        'meta': {
            'language':       'German',
            'languageCode':   'de',
            'nativeLanguage': 'English',
            'targetField':    'german',
        },
        'words': output,
    }
    with open(out_path, 'w', encoding='utf-8') as f:
        json.dump(wrapped, f, ensure_ascii=False, indent=2)

    # ── Report ───────────────────────────────────────────────────────────────
    nouns = [e for e in output if e['part-of-speech'] == 'noun']
    verbs = [e for e in output if e['part-of-speech'] == 'verb']
    adjs  = [e for e in output if e['part-of-speech'] == 'adjective']
    nouns_with_gender = sum(1 for n in nouns if 'gender' in n)
    nouns_with_plural = sum(1 for n in nouns if 'plural' in n)

    print(f"\n{'='*50}")
    print(f"Output: {out_path}")
    print(f"  Total words:       {len(output):,}")
    print(f"  Nouns:             {len(nouns):,}")
    print(f"    With gender:     {nouns_with_gender:,} ({nouns_with_gender/len(nouns)*100:.1f}%)" if nouns else "")
    print(f"    With plural:     {nouns_with_plural:,} ({nouns_with_plural/len(nouns)*100:.1f}%)" if nouns else "")
    print(f"  Verbs:             {len(verbs):,}")
    print(f"  Adjectives:        {len(adjs):,}")
    print(f"  Skipped (no data): {skipped}")
    size_kb = os.path.getsize(out_path) / 1024
    print(f"  File size:         {size_kb:.0f} KB")
    print(f"{'='*50}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Build vocabulary JSON')
    parser.add_argument('--words', required=True,  help='Path to all.json from Nordsword3m/German-Words')
    parser.add_argument('--nouns', required=False, help='Path to nouns.csv from gambolputty/german-nouns')
    parser.add_argument('--out',   default='language-data/vocabulary.json', help='Output file path')
    parser.add_argument('--max',   type=int, default=10000,   help='Maximum number of words (default 10000)')
    args = parser.parse_args()

    convert(
        words_path=args.words,
        nouns_path=args.nouns,
        out_path=args.out,
        max_words=args.max,
    )
