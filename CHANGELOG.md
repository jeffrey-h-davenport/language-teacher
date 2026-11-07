# Changelog

## 1.14.3 — 2026-11-04
- Editor mode: Browse no longer offers anything based on learning progress — the Score column, the status filter (Not started / In progress / Learned), and sorting by score are hidden
- No change for learners

## 1.14.2 — 2026-11-04
- Editor mode no longer touches learning progress: the Score field is gone from the edit screen, Mark Learned / Unlearn are hidden, and progress is never saved while editing — edits only change the vocabulary file
- No change for learners

## 1.14.1 — 2026-11-04
- Editor mode: picking a language now goes straight to browsing its words, skipping the quiz/reading choice and the quiz itself; Back returns to the language list (no change for learners)

## 1.14.0 — 2026-11-03
- Vocabulary is now read-only in the app and always comes straight from the shipped files, so every update brings the latest words — there's no longer a separate personal copy that can fall out of date
- Edit Word and Duplicate are gone from the learner app; Mark as Learned (and un-learning from Browse) still work, since they only change your progress
- Word editing moved to a creator-only editor mode (`npm run edit` from the source code), which saves directly to the vocabulary files under version control
- Existing personal vocabulary copies are set aside, not deleted, along with any edits that weren't yet in the shipped files

## 1.13.1 — 2026-11-03
- Vocabulary fixes made in the app (11 French, 22 German, 2 Spanish words — mostly clearer English meanings) are now part of the shipped vocabulary

## 1.13.0 — 2026-11-03
- Vocabulary updates now reach your installed copy: on startup the app merges any changes in the shipped vocabulary into your personal copy, instead of only copying it the very first time
- Your own edits are safe — the merge goes field by field, so anything you've edited in Browse/Edit keeps your version, while everything you haven't touched picks up the shipped fixes; newly shipped words are added and words you created are kept
- A backup of your copy from just before each merge that changes it is kept alongside it

## 1.12.2 — 2026-11-03
- French vocabulary: "fenêtre" now uses the same slash (phonemic) IPA style as the rest of the file — /fə.nɛtʁ/ instead of [fə.nɛ.tʁə]

## 1.12.1 — 2026-11-02
- Removed the "Also reviewing this session" list from the last intro card — the intro now shows only the new words, and words you've already started or learned go straight to the quiz

## 1.12.0 — 2026-11-02
- New words are now introduced before the quiz starts: each session opens with one card per brand-new word showing the word, pronunciation, meaning, grammar and context all at once, with Back/Next to step through
- The last intro card also lists the words being reviewed this session (ones you've already started or learned); sessions with no new words go straight to the quiz
- "Skip to Quiz" in the header jumps past the intro at any point
- The quiz asks about words in a fresh random order after the intro, so it doesn't follow the order you just studied them in

## 1.11.0 — 2026-11-01
- Added 6 new color schemes to Preferences, adapted from popular editor/terminal palettes: Nordic Frost (Nord), Dracula, Mocha Mauve (Catppuccin), Retro Gruvbox, Tokyo Night, and Rosé Pine — each with its own accent, welcome gradient, and light-background tint
- Fixed a contrast bug caught before it shipped: several of these palettes' signature colors are calibrated for dark backgrounds and were too light to read as white text on a button — swapped in a darker member of each palette (an official light-mode variant where one exists) and added a dedicated token so this can't quietly break for a future scheme

## 1.10.0 — 2026-11-01
- Added Color Scheme to Preferences (currently just "Ocean Blue," today's look) — the accent color and welcome-screen gradient are now fully parameterized, so every hover state, focus ring, and selected-row highlight throughout the app follows the chosen accent automatically, not just the couple of places it touched before
- This is groundwork for adding real alternative color schemes next — a new one will only need its 8 color values added, no CSS changes

## 1.9.0 — 2026-11-01
- Added "Words per Session" to Preferences — set how many words appear per quiz session, individually by CEFR level
- Sessions now default to a smaller size at lower levels and a larger one at higher levels (A0: 6, A1: 7, A2: 8, B1: 9, B2: 10, C1: 11, C2: 12) instead of a flat 20 (8 for A0) for every level

## 1.8.1 — 2026-11-01
- The Mandarin Pronunciation Guide now shows the same tone-contour glyphs used in the quiz, instead of the old superscript-number notation, in every example throughout the guide

## 1.8.0 — 2026-11-01
- Chinese tone is now shown as a small drawn pitch-contour glyph (colored by tone) over each syllable's IPA, instead of superscript numbers — attached to the pronunciation, not the character, since the character carries meaning and the glyph is about sound
- Added a per-syllable pronunciation breakdown (`ipaSyllables`) so multi-syllable words get one correctly-aligned glyph per syllable, not one glyph for the whole word

## 1.7.0 — 2026-11-01
- Chinese vocabulary: tone is now stored separately from IPA (one tone per syllable) instead of being baked into the pronunciation text — groundwork for a clearer, non-numeric way of showing tone later. Pronunciation display looks the same for now.

## 1.6.0 — 2026-11-01
- Added Preferences (⚙ on the welcome screen) — pick your favorite languages and the language picker will show just those by default, with a "Show all languages" link to see everything else
- Preferences are saved locally and survive reinstalls and updates

## 1.5.0 — 2026-10-29
- Added a Mandarin Pronunciation Guide for Chinese (via the Script Guide button) — covers the tone system and the IPA sounds used throughout the vocabulary, with real example words for each
- Fixed two more silently-broken IPA symbols in Chinese: the vowel in words like 喝 "to drink" (was rendering as an unrelated consonant) and the retroflex hook on zh-/ch- sounds like 这 "this" and 吃 "to eat" (was rendering as a plain, unmarked "t")

## 1.4.2 — 2026-10-29
- Fixed Chinese tone marks rendering as garbled symbols — switched from IPA tone-bar glyphs (poorly supported by available fonts) to superscript tone numbers (e.g. ma²¹⁴), a standard linguistic notation that renders reliably

## 1.4.1 — 2026-10-29
- Fixed Chinese tone 1 (the flat, high tone) showing as a doubled pitch mark in the IPA instead of a single one

## 1.4.0 — 2026-10-29
- Added a Chinese (Mandarin) vocabulary set covering the A1 and A2 levels (350 words, in Simplified characters), with IPA pronunciation — including tone sandhi — for every entry instead of pinyin

## 1.3.0 — 2026-10-29
- Added a Turkish vocabulary set covering the A1 and A2 levels (344 words, with pronunciation for every entry)

## 1.2.0 — 2026-10-29
- Added a "What's New" screen — click the version number on the welcome screen to see what changed in this release and every release before it

## 1.1.1 — 2026-10-29
- Increased the legibility of the version number on the welcome screen (it was too pale to read comfortably)

## 1.1.0 — 2026-10-29
- Added the app's version number to the welcome screen, so you can confirm which build you're running after a reinstall
- Fixed a bug where long answer choices on the quiz screen stopped abbreviating with "…" and showing their full text on hover

## 1.0.0 — 2026-10-25
- Initial version: vocabulary quiz and reading comprehension for Czech, Finnish, French, German, Hindi, Korean, Spanish, and Swedish
- Script-literacy content for Hindi and Korean: individual letters, contrast-pair drills for easily-confused sounds, and a Script Guide reference
- Browse/search screen with mass-edit (duplicate, mark learned), inline word editing, and CEFR/part-of-speech/register filtering
- Packaged as a standalone macOS app with a custom icon, installable outside of the development environment
- Learning progress and word edits now stored outside the app bundle, so reinstalling or updating the app never erases them
- Assorted German vocabulary corrections (CEFR levels and English glosses for words in the teacher/pupil/student family)
