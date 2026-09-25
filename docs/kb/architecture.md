# Architecture

A local, single-user study app. Plain PHP 8 (no framework, no Composer) runs
under PHP's built-in web server and keeps everything in PostgreSQL; the
browser gets plain HTML/CSS/JS (no framework, no build step).

```
                 data/source/*.tsv  ──php src/build-data.php──▶  data/vocab.json
   (transcribed from the scanned books)                          data/kanji.json
                                                                 data/grammar-index.json
   data/vocab.json + the SRS vocabulary ──php src/build-audio.php──▶  data/audio.json + data/audio/*.mp3
   (Google Cloud Text-to-Speech, two voices)

   data/*.json + data/authored-items-part1|2.php
        │   src/content.php: content_sync() when the server starts (and in setup.php),
        │   only if data/ or the code that builds from it changed (~3 s)
        │
        ├─▶ src/generate.php ── question bank (11,523) ──▶ table exam_questions
        │      └ src/conjugate.php   verb/adjective forms (both conjugation charts)
        │
        └─▶ src/srs/catalog.php ── kanji SRS items (1,373) ──▶ table srs_items

   requests (server.php)
        ├─ /api/meta /api/exam /api/submit /api/attempts /report/:id ── src/exam.php
        │      └ src/score.php  marking and breakdowns · src/report.php  standalone HTML report
        │      └ table exam_attempts (each attempt with its report)
        └─ /api/kanji/* ── src/srs/routes.php
               └ src/srs/srs.php    WaniKani schedule
               └ src/srs/store.php  tables srs_progress, srs_settings, srs_daily, srs_log

   src/speech.php — what a word is spoken as and which clips hold it; used by
                    the audio builder, the catalog and the listening questions
```

## Server — `server.php`

`php server.php` checks the database (it must exist and be migrated: that is
`php setup.php`'s job), rebuilds the study content if `data/` changed, takes
today's backup, prints the counts, then runs PHP's built-in web server on
127.0.0.1:3000 with `public/` as the web root and `server.php` as its router.
Host and port come from `src/config.php` (`HOST` / `PORT` override them);
`php server.php --url` prints the address (the launchers use it).

| Route | What |
|---|---|
| `GET /` `/kanji.html` `/exam.html`, css, js | the pages and their files, from `public/` (the built-in server sends them) |
| `GET /api/meta` | exam: parts, sections, lessons, bank size, attempt count |
| `POST /api/exam` | exam: build a paper from `{size, books, lessons, sections, seed}` — questions without answers |
| `POST /api/submit` | exam: `{spec, responses, meta}` → score, store the attempt and its report |
| `GET /api/attempts` | exam history, newest first |
| `GET /report/:id` | one report (HTML, from the database) |
| `/api/kanji/*` | kanji SRS — see [kanji-srs.md](kanji-srs.md) |
| `GET /audio/:name` | a clip from `data/audio/`; only names of 16 hex digits + `.mp3`; byte ranges (206) |
| `GET /api/health` | `{ok, database, backups, contentCurrent}` — the tests and the launchers ask it |

Anything else is a 404 (the router answers it: left alone, the built-in server
would send `index.html` for an unknown path). The built-in server handles one
request at a time; each takes 5–10 ms, because the database connection stays
open between requests (see [decisions.md](decisions.md)). A 250-question paper
takes about 65 ms.

`public/vendor/wanakana.min.js` (MIT, romaji→kana as you type) is a copy of
the npm package's file, so running the app needs no npm.

## Setup — `setup.php`

Run by the launchers on every start; does only what is missing:

1. the database settings — asked once, saved in `src/config.local.php`
   (gitignored; `--db-host=… --db-port=… --db-user=… --db-password=…` skips the
   questions);
2. the database (`japanese_academy` by default) — created if missing;
3. its tables — the migrations in `src/migrations/` not yet applied (with a
   raw copy of every table first, if the database already holds study data);
4. the study content — rebuilt from `data/` when it changed;
5. the one-time import of the JSON files the app used before the database
   (`progress/`, `results/`, `reports/` — only read, never changed; see
   below).

Also `--check` (report only; it changes nothing, not even the settings),
`--sync`, `--backup`, `--restore=FILE`, `--import=FOLDER`. The header of
`setup.php` lists them. PostgreSQL 13 or newer (tested with 18).

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

## The database (PostgreSQL)

Tables are created by `src/migrations/*.sql` (applied in order by
`setup.php`; a migration that is committed is never edited — add the next
number instead). Times the browser sees are milliseconds; the columns are
`timestamptz`, converted by the SQL functions `academy_ms()` / `academy_time()`.

| Table | Contents |
|---|---|
| `srs_progress` | one row per kanji-trainer item you touched: stage, review times, counters, notes, synonyms |
| `srs_settings` | the trainer's settings (one row), and when this progress started / last changed |
| `srs_daily` | lessons, reviews, practice per local day (the dashboard) |
| `srs_log` | every lesson, review and practice answer and every reset — only ever added to |
| `exam_attempts` | every exam attempt: the whole record (as `results/<id>.json` held it) and its HTML report |
| `imports` | what `setup.php` imported from the old JSON files |
| `srs_items`, `exam_questions`, `content_state` | the study content, rebuilt from `data/` — not your data |

Only `npm start` / the launchers use your database. The tests make their own
throwaway databases (`academy_test_…`, see [testing.md](testing.md)).

## Your data outside the database (never delete)

| Path | Contents |
|---|---|
| `backups/` (gitignored) | `academy-<date>.json`: a copy of all your study data (progress, answer log, exam attempts with their reports), taken each day the server starts (or, for a server left running, at the first page load of a new day); the last 14 are kept. Also one before a full reset or a restore, and a raw copy of every table (`….raw.json`) before a migration. `php setup.php --restore=<file>` puts a `.json` back |
| `progress/kanji.json`, `progress/kanji-log.jsonl`, `results/`, `reports/` | the history from before the database (to 2026-09-24), imported once by `setup.php`. Tracked in git; the app no longer writes them |
| `progress/backups/` | the old app's daily copies (gitignored) |

`ACADEMY_DB_NAME` and `ACADEMY_BACKUPS_DIR` point the app elsewhere (the
tests and throwaway servers use them); `php server.php` warns when they are
set. A database named by `ACADEMY_DB_NAME` without `ACADEMY_BACKUPS_DIR`
keeps its backups in the temp folder (`academy-backups-<name>`), never in
`backups/`.

## Audio — `data/audio/`, `data/audio.json`

Made by `php src/build-audio.php` (`npm run build:audio`) with Google Cloud
Text-to-Speech: every vocabulary word, in a female and a male voice. The clips
are in git, so a fresh clone plays sound without a key. Only a rebuild needs
the API key, from `GOOGLE_TTS_API_KEY` or the gitignored `.env`. Details in
[kanji-srs.md](kanji-srs.md) and [exam.md](exam.md).

## Local only (gitignored)

| Path | Contents |
|---|---|
| `src/config.local.php` | this computer's database settings, with the password (written by `setup.php`) |
| `backups/` | copies of your study data (above) |
| `books/` | the five scanned course books (`textbook-1.pdf` …), read by `tools/pdf/pages.js`, plus the owner's notes |
| `.env` | `GOOGLE_TTS_API_KEY=…`, for `php src/build-audio.php` |
| `temp/` | the owner's scratch folder (e.g. `voices.html`: a sample of every Japanese voice) |

A fresh clone has none of these: `setup.php` writes the settings; copy the
books in by hand, and create `.env` only to make new audio.

## What Node is still for

Nothing at run time. `npm` runs the developer tools: the Node test of the
browser's answer checking (`tests/unit/answer.test.js`), the Edge browser
suites (`playwright-core`), and the PDF page tool (`sharp`). The npm scripts
start PHP through `tools/php.js`, which finds a PHP 8.1+ with the needed
extensions (plain `php` may be an older one — it is on this PC).

## Parts and lessons

Lesson numbers alone identify the part: Greetings = 0 and Lessons 1–12 are
Part 1; 13–23 are Part 2 (`BOOKS` in `src/generate.php`). Kanji are taught
from Lesson 3, so SRS lessons run 3–23.
