# Language Teacher

A vocabulary and reading-comprehension trainer for macOS, built with Electron. Supports Czech, Finnish, French, German, Hindi, Korean, Spanish, and Swedish, including dedicated script-literacy content (graphemes, contrast pairs, a script reference guide) for non-Latin scripts like Hindi and Korean.

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

Vocabulary, reading passages, and script-guide content live in `language-data/*.json`, tracked in git. Per-word learning progress (scores, learned status) is stored separately in `language-data/*-progress.json`, which is gitignored and generated automatically the first time you use each language — a fresh install or a fresh clone always starts with no progress.
