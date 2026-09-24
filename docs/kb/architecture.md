# Architecture

A local, single-user study app. Node + Express serves plain HTML/CSS/JS (no
framework, no build step) and keeps all state in JSON files on disk.

```
                 data/source/*.tsv  ──npm run build──▶  data/vocab.json
   (transcribed from the scanned books)                 data/kanji.json
                                                        data/grammar-index.json
   data/vocab.json + the SRS vocabulary ─build:audio─▶  data/audio.json + data/audio/*.mp3
   (Google Cloud Text-to-Speech, two voices)

   data/*.json + data/authored-items-part1|2.js
        │
        ├─▶ src/generate.js ── exam question bank ─▶ /api/exam, /api/submit
        │      └ src/conjugate.js   verb/adjective forms (both conjugation charts)
        │      └ src/score.js       marking and breakdowns
        │      └ src/report.js      standalone HTML report
        │
        └─▶ src/srs/catalog.js ── kanji SRS items (1,373) ─▶ /api/kanji/*
               └ src/srs/srs.js      WaniKani schedule
               └ src/srs/store.js    progress/kanji.json (+ log, backups)
               └ src/srs/routes.js   the API

   src/speech.js — what a word is spoken as and which clips hold it; used by
                   the audio builder, the catalog and the listening questions
```

## Server — `server.js`

| Route | What |
|---|---|
| `GET /` `/kanji.html` `/exam.html` | the three pages (from `public/`) |
| `GET /api/meta` | exam: parts, sections, lessons, bank size, attempt count |
| `POST /api/exam` | exam: build a paper from `{size, books, lessons, sections, seed}` — questions without answers |
| `POST /api/submit` | exam: `{spec, responses, meta}` → score, save `results/<id>.json`, write `reports/<id>.html` |
| `GET /api/attempts` | exam history, newest first |
| `GET /report/:id` | one report |
| `/api/kanji/*` | kanji SRS — see [kanji-srs.md](kanji-srs.md) |
| `GET /audio/:name` | a clip from `data/audio/`; only names of 16 hex digits + `.mp3` |
| `GET /vendor/wanakana.min.js` | romaji→kana as-you-type, from `node_modules` |

`node server.js` listens on 127.0.0.1:3000, from `config` in `package.json`
(`HOST` / `PORT` override it); `start.ps1` / `start.sh` read the same `config`.
`require('./server')` returns the Express app without listening — the tests
use that.

## Front end — `public/`

- `index.html` — the home page (inline script: kanji summary + exam history).
- `exam.html` + `exam.js` — the exam (single page with setup / test / result screens).
- `kanji.html` + `kanji/` — the trainer, a hash-routed single page:
  `answer.js` (answer checking, UMD so Node tests can require it) ·
  `core.js` (state, API client, `h()` DOM helper, shared item rendering,
  audio: the two voices take turns) ·
  `session.js` (the answering engine for lesson quiz / reviews / practice) ·
  `views.js` (dashboard, lessons, reviews, practice, browse, item) ·
  `app.js` (router + boot). Scripts load in that order as classic scripts on
  `window.KA`, not ES modules — keeps jsdom/Node testing possible.
  Lesson batches, sessions and their summaries draw over the screen they were
  started from and leave the address as it was, so `app.js` also routes a
  click on a link to the address already shown (the browser fires no
  `hashchange` for it).
- `css/base.css` (tokens, light + dark, nav, buttons, chips) · `css/kanji.css` ·
  `css/exam.css`. Colours come only from tokens in `base.css`.

## State on disk (the user's — never delete)

| Path | Contents | Override for tests |
|---|---|---|
| `progress/kanji.json` | SRS state per item, settings, daily counters | `ACADEMY_PROGRESS_DIR` |
| `progress/kanji-log.jsonl` | every lesson/review/practice answer, append-only | (same) |
| `progress/backups/` | daily copy (last 14) + a copy before any full reset | (same) |
| `results/<id>.json` | exam attempts | `ACADEMY_RESULTS_DIR` |
| `reports/<id>.html` | exam reports | `ACADEMY_REPORTS_DIR` |

All of these except `progress/backups/` are tracked in git (the owner's
choice), so they change after every study session.

## Audio — `data/audio/`, `data/audio.json`

Made by `npm run build:audio` (`src/build-audio.js`) with Google Cloud
Text-to-Speech: every vocabulary word, in a female and a male voice. The clips
are in git, so a fresh clone plays sound without a key. Only a rebuild needs
the API key, from `GOOGLE_TTS_API_KEY` or the gitignored `.env`. Details in
[kanji-srs.md](kanji-srs.md) and [exam.md](exam.md).

## Local only (gitignored)

| Path | Contents |
|---|---|
| `books/` | the five scanned course books (`textbook-1.pdf` …), read by `tools/pdf/pages.js`, plus the owner's notes |
| `.env` | `GOOGLE_TTS_API_KEY=…`, for `npm run build:audio` |
| `temp/` | the owner's scratch folder (e.g. `voices.html`: a sample of every Japanese voice) |

A fresh clone has neither: copy the books in by hand, and create `.env` only
to make new audio.

## Parts and lessons

Lesson numbers alone identify the part: Greetings = 0 and Lessons 1–12 are
Part 1; 13–23 are Part 2 (`BOOKS` in `src/generate.js`). Kanji are taught
from Lesson 3, so SRS lessons run 3–23.
