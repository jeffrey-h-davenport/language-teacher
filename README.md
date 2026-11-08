# Language Teacher

A vocabulary and reading-comprehension trainer for macOS, built with Electron. Supports Chinese, Czech, Dutch, Finnish, French, German, Hindi, Korean, Spanish, Swedish, and Turkish, including dedicated script-literacy content (graphemes, contrast pairs, a script reference guide) for non-Latin scripts like Hindi and Korean.

## Running in development

Requires [Node.js](https://nodejs.org) and npm.

```bash
npm install
npm start
```

This launches the app directly from source via Electron — no build step needed for day-to-day development.

## Building a standalone Mac app

To package the app as a normal double-clickable macOS application:

```bash
npm run dist
```

This produces, in `dist/`:

- `dist/mac-arm64/Language Teacher.app` — the app bundle itself
- `dist/Language Teacher-<version>-arm64.dmg` — a disk-image installer

To install it, open the `.dmg` and drag **Language Teacher** into your **Applications** folder (or just copy the `.app` there directly).

### First launch

The app isn't code-signed with an Apple Developer ID, so macOS Gatekeeper will initially refuse to open it with a plain double-click ("Language Teacher can't be opened because Apple cannot check it for malicious software"). To approve it once:

1. Right-click (or Control-click) **Language Teacher.app** in Applications.
2. Choose **Open**.
3. Click **Open** again in the dialog that appears.

After that first approval, it launches normally like any other app.

## Data

The `language-data/*.json` files in this repo are the app's content: vocabulary, reading passages, and script-guide content, tracked in git. The app reads them straight from its bundle, so every install or update ships the latest content. Learners can't change content.

Anything the app itself writes — your learning progress and preferences — lives outside the app entirely, in `~/Library/Application Support/language-teacher/`. Because this lives outside the app bundle, reinstalling or updating the app never wipes it.

Builds before 1.14.0 kept an editable personal copy of each vocabulary file there. On first launch of 1.14.0 or later, those copies are moved into `language-data/retired/` (never deleted). Any word in a copy that differed from the shipped file is also saved to `retired/<language>-unshipped-edits.json`, so an edit that never made it into the repo can be recovered.

## Editing vocabulary (creator only)

```bash
npm run edit
```

This launches the app from source in editor mode (the version label on the welcome screen reads "· Editor"). It turns on Edit Word, Duplicate, and bulk Duplicate, and saves go straight into `language-data/` in this repo, so every edit shows up in `git diff` to review and commit. Editor mode is never available in a packaged build; `npm start` runs from source without it.
