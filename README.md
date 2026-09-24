# Japanese Academy

Study companion for a two-part beginner Japanese course (Greetings and
Lessons 1–23). Two parts, one site:

- **Kanji** — a WaniKani-style spaced-repetition trainer for the course's kanji
  and the vocabulary written with them: lessons, reviews, and unlimited practice.
- **Exam** — an 11,523-question multiple-choice test of the whole course, with
  listening, scoring and a report.

Every word is spoken in two voices, female and male.

It replaced the earlier N4 Coach app on 2026-09-23. N4 Coach is still in the
git history.

## Run it

1. **Windows**: double-click `start.ps1`. **Mac/Linux**: run `./start.sh` in a
   terminal. It checks Node (installs it through NVM if needed), installs the
   dependencies, starts the app and opens http://127.0.0.1:3000.
2. Or by hand:

   ```bash
   npm install
   npm start           # → http://localhost:3000
   ```

The app only listens on this computer (127.0.0.1): other devices on your
network can't reach it. Host and port are in `package.json` under `config`.

Node 22 (tested on 22.15). The app itself runs on Node 18+, but the dev tools
need more: the tests 21+, and the PDF page tool and the browser tests 20.9+.
Dependencies: Express, and wanakana for typing readings in romaji.

### Not in git

These stay on this computer only. On a new computer, copy them in by hand:

- `books/` — the scanned course books (`textbook-1.pdf`, `workbook-1.pdf`,
  `textbook-2.pdf`, `workbook-2.pdf`, `answer-key.pdf`), and your notes. Only
  the PDF page tool needs them.
- `.env` — your Google Cloud key, only needed to make new audio (below).

---

## Audio

The audio is made with **Google Cloud Text-to-Speech**, in two voices
(`ja-JP-Neural2-B`, female, and `ja-JP-Neural2-C`, male). The clips are in git
(`data/audio/`), so the app plays them on any computer, without a key. In
lessons and reviews the two voices take turns; each exam listening question
uses one of them.

You need a key only to make clips for new words (after adding vocabulary):

1. In the Google Cloud console, create a project, turn on billing, and enable
   the **Cloud Text-to-Speech API**. This amount of text stays inside the free
   tier.
2. Under **APIs & Services → Credentials**, create an **API key**, and restrict
   it to the Cloud Text-to-Speech API.
3. Put it in a file named `.env` in this folder (git ignores it):
   `GOOGLE_TTS_API_KEY=your-key`
4. Run `npm run build:audio`. It only sends the words that have no clip yet.
   `npm run build:audio -- --dry-run` shows what it would send, without a key.

---

## Kanji

**1,373 study items**: the 316 kanji of the course's kanji lists (々 aside —
it has no reading of its own to ask for) and the 1,057 words, from the
vocabulary lists and the example compounds of the kanji lists, that are written
only with those kanji. Every word has audio.

### How it works

It follows WaniKani's loop:

1. **Lessons** — new items in batches (5 by default; 3 or 10 if you prefer).
   Each is shown with its meaning, readings and example words, then a short quiz
   fixes it into the schedule.
2. **Reviews** — when an item is due, you type its meaning in English and its
   reading in kana. Romaji turns into kana as you type (`taberu` → たべる).
3. **The SRS schedule** — WaniKani's, exactly: Apprentice I–IV, Guru I–II,
   Master, Enlightened, Burned, with reviews after 4 h, 8 h, 1 day, 2 days,
   1 week, 2 weeks, 1 month and 4 months. A clean review moves the item up one
   stage; a review with mistakes drops it `ceil(mistakes / 2)` stages — doubled
   from Guru upwards — never below Apprentice I.

Vocabulary becomes available once its kanji have been learned — 大学 after 大 and
学 — and is filed under the lesson of its latest kanji.

### What is different from WaniKani — on purpose

- **No time locks.** Take as many lesson batches as you want, whenever you want.
  There is no daily limit and no level gating.
- **Practice, as often as you like.** Drill any item you've learned, at any time
  — all of them, the weakest, recent mistakes, recent lessons, one SRS stage, some
  lessons, kanji or vocabulary, meaning or reading only. Practice keeps its own
  statistics (which power "weakest" and "recent mistakes") but **never changes
  your SRS stages or review times**, so drilling can't knock the schedule out of
  shape.
- **Course order.** Items are grouped by course lesson (3–23) instead of
  WaniKani levels, and you can take lessons from any lesson you choose.
- **No radicals, no ready-made mnemonics.** The course doesn't provide either.
  Every item has two note fields (meaning and reading) for your own mnemonics,
  shown in lessons and on the item page.

### Answers

- Meanings forgive case, punctuation, "to"/"be"/"the"/"a", parenthesised parts
  ("older brother" for "(my) older brother") and small typos, scaled to the
  word's length. A typo that happens to spell another item's meaning is *not*
  forgiven — "night" is wrong for 右, even though it's one letter from "right".
- Number words and digits are interchangeable: "300" = "three hundred".
- Readings accept hiragana or katakana, and katakana long vowels typed out
  (サービス = さあびす). A kanji accepts any of its on'yomi or kun'yomi.
- If you know your answer is right but it isn't accepted, **My answer was right**
  saves it as your own synonym (or extra reading) and counts it. You can review
  and remove these on the item page.

Keys: **Enter** submits, and Enter again moves on. **F** opens the item info
once you've answered. Lessons move with **←/→** or Enter.

### Your progress

Saved in `progress/kanji.json`. Every save is written to a temp file and renamed
into place. There's a daily copy in `progress/backups/` (the last 14 are kept),
and every answer is also appended to `progress/kanji-log.jsonl`. The dashboard
has a link to download a copy. `progress/`, `results/` and `reports/` are kept
in git too, so your history is saved with every commit (`progress/backups/` is
not).

---

## Exam

**11,523 questions** in 15 sections — listening, vocabulary both ways, kanji
readings, meanings and writing, verb conjugation (every form on both
conjugation charts), adjectives, kana, grammar, particles, counters and
translation. Pick Part 1, Part 2 or both, 40 to 500 questions, and narrow by
lesson or section. Each attempt is saved to `results/`, with a standalone HTML
report in `reports/` broken down by part, skill and lesson. Pass mark 70%.

---

## Data

```
data/source/
  vocab-part1.tsv  vocab-part2.tsv     vocabulary index (J–E), transcribed
  kanji-part1.tsv  kanji-part2.tsv     the per-lesson kanji lists
  grammar-index-part1/2.tsv            grammar points by lesson
data/vocab.json kanji.json grammar-index.json   (npm run build)
data/audio.json audio/                          (npm run build:audio)
data/authored-items-part1.js  -part2.js         hand-written exam items
```

The books are page scans with no text layer, so the vocabulary, kanji and
grammar data was transcribed from the page images. The counts check out
against the books, but any typo will be in `data/source/*.tsv` — fix it there
and run `npm run build` (and `npm run build:audio` if a word's spelling or
reading changed).

## Layout

```
start.ps1 start.sh .nvmrc  one-click start (checks Node, installs, opens the browser)
server.js                  HTTP server: pages, exam API, kanji API, audio
src/srs/                   kanji SRS: catalog, schedule, storage, API routes
src/generate.js score.js report.js conjugate.js    the exam
src/speech.js              what each word is spoken as, and its clips
src/build-data.js build-audio.js                   data and audio builders
public/index.html          home page
public/kanji.html kanji/   the kanji trainer (plain JS, no framework)
public/exam.html exam.js   the exam
public/css/                shared, kanji and exam styles (light and dark)
tests/                     unit, API and browser tests
tools/pdf/pages.js         page images from the scanned books
docs/kb/                   knowledge base: architecture, data sources, SRS, exam, testing
progress/                  your kanji progress
results/ reports/          your exam attempts
books/                     the scanned books (not in git)
.claude/                   Claude Code: skills, review agents, rules
```

## Development

```bash
npm test               # unit + API tests (~5 s)
npm run test:browser   # the whole study loop and an exam, in Edge
npm run screens        # screenshots of every screen, light/dark/phone → tests/browser/shots/
node tools/pdf/pages.js textbook-1 366 --book-page   # a book page as an image
```

The tests never touch `progress/`, `results/` or `reports/`, and never call
Google. They run against temporary folders set through `ACADEMY_PROGRESS_DIR`,
`ACADEMY_RESULTS_DIR` and `ACADEMY_REPORTS_DIR`, and you can set the same
variables to run a scratch copy of the app. The browser tests use the installed
Edge through `playwright-core`; set `BROWSER_PATH` to use another Chromium
browser.

The books have no text layer, so `tools/pdf/pages.js` pulls out each page's
image to read. `docs/kb/` is the reference for changing anything: where the
data came from (with page maps of every book), how the SRS, the audio and the
exam work, what to test, and why things are the way they are.

For Claude Code, `CLAUDE.md` holds the project rules, and `.claude/` holds the
rest: path-scoped rules, the `academy-*` skills (run, test, ui-check, data,
pdf, exam-items), and four review agents (code, UI, Japanese, data).
