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

You need **PHP 8.1 or newer** with the extensions `pdo_pgsql`, `mbstring` and
`intl` (and `curl`, only to make audio), and **PostgreSQL 13 or newer**
running on this computer. No web server, framework or Composer: PHP's own web server runs the
app.

1. **Windows**: double-click `start.ps1`. **Mac/Linux**: run `./start.sh` in a
   terminal. It finds a PHP that can run the app (even when an older PHP comes
   first on PATH), gets the database ready, starts the app and opens
   http://127.0.0.1:3000.
2. Or by hand, with that PHP:

   ```bash
   php setup.php       # the first time it asks for the database settings
   php server.php      # → http://127.0.0.1:3000
   ```

**The first time**, `setup.php` asks for the PostgreSQL server, port, user and
password, checks them and saves them in `src/config.local.php`. Then it creates
the database `japanese_academy` and its tables, builds the study content into
it, and imports your progress and exam history from the files the app used
before (`progress/`, `results/`, `reports/` — it only reads them). After that it
only does what is missing, so the launchers run it on every start. Run
`php setup.php --check` to see whether anything is missing; the top of
`setup.php` lists its other options.

The app only listens on this computer (127.0.0.1): other devices on your
network can't reach it. Host, port and the database defaults are in
`src/config.php`.

### Not in git

These stay on this computer only:

- `src/config.local.php` — your database settings, with the password
  (`setup.php` writes it).
- `backups/` — copies of your study data (see *Your progress* below). Copy
  the newest to a new computer to bring your progress along.
- `books/` — the scanned course books (`textbook-1.pdf`, `workbook-1.pdf`,
  `textbook-2.pdf`, `workbook-2.pdf`, `answer-key.pdf`), and your notes. Only
  the PDF page tool needs them. Copy them in by hand.
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
4. Run `php src/build-audio.php` (or `npm run build:audio`). It only sends the
   words that have no clip yet. `php src/build-audio.php --dry-run` shows what
   it would send, without a key. Restart the app afterwards.

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

Saved in the PostgreSQL database `japanese_academy`. Each answer is saved
whole or not at all, and every answer is also written to a log that is never
changed. The dashboard has a link to download your kanji progress.

Each day, when the app starts (or, if it runs overnight, at the first page you
open the next day), it writes a copy of all your study data — kanji progress,
the answer log and every exam attempt with its report — to
`backups/academy-<date>.json` (the last 14 are kept), and it writes one before
a full reset too. To go back to a copy:

```bash
php setup.php --restore=backups/academy-2026-09-24.json
```

It saves what is there now first. `php setup.php --backup` writes a copy any
time.

The files the app used before the database — `progress/`, `results/` and
`reports/` — are kept in git as your history until 2026-09-24. `setup.php`
imported them once; the app doesn't change them any more.

---

## Exam

**11,523 questions** in 15 sections — listening, vocabulary both ways, kanji
readings, meanings and writing, verb conjugation (every form on both
conjugation charts), adjectives, kana, grammar, particles, counters and
translation. Pick Part 1, Part 2 or both, 40 to 500 questions, and narrow by
lesson or section. Each attempt is saved in the database with a standalone
HTML report (open it from the history), broken down by part, skill and lesson.
Pass mark 70%.

---

## Data

```
data/source/
  vocab-part1.tsv  vocab-part2.tsv     vocabulary index (J–E), transcribed
  kanji-part1.tsv  kanji-part2.tsv     the per-lesson kanji lists
  grammar-index-part1/2.tsv            grammar points by lesson
data/vocab.json kanji.json grammar-index.json   (php src/build-data.php)
data/audio.json audio/                          (php src/build-audio.php)
data/authored-items-part1.php  -part2.php       hand-written exam items
```

The books are page scans with no text layer, so the vocabulary, kanji and
grammar data was transcribed from the page images. The counts check out
against the books, but any typo will be in `data/source/*.tsv` — fix it there
and run `php src/build-data.php` (and `php src/build-audio.php` if a word's
spelling or reading changed). The next start of the app rebuilds the study
content in the database.

## Layout

```
start.ps1 start.sh         one-click start (finds PHP, runs setup.php, opens the browser)
setup.php                  database settings, the database and its tables, the first import
server.php                 the server: pages, exam API, kanji API, audio (PHP's built-in web server)
src/config.php             settings (src/config.local.php: this computer's, not in git)
src/migrations/            the database tables
src/srs/                   kanji SRS: catalog, schedule, storage, API routes
src/generate.php score.php report.php conjugate.php exam.php    the exam
src/speech.php             what each word is spoken as, and its clips
src/content.php backup.php the study content in the database; backups, restore, import
src/build-data.php build-audio.php                  data and audio builders
public/index.html          home page
public/kanji.html kanji/   the kanji trainer (plain JS, no framework)
public/exam.html exam.js   the exam
public/css/ vendor/        shared, kanji and exam styles (light and dark); wanakana
tests/                     PHP unit and API tests, Node browser tests
tools/pdf/pages.js         page images from the scanned books
tools/php.js               finds the PHP for the npm scripts
docs/kb/                   knowledge base: architecture, data sources, SRS, exam, testing
backups/                   copies of your study data (not in git)
progress/ results/ reports/  your history from before the database
books/                     the scanned books (not in git)
.claude/                   Claude Code: skills, review agents, rules
```

## Development

Node (22, see `.nvmrc`) is only for the developer tools: `npm install` once,
then

```bash
npm test               # PHP unit + API tests, and the test of the browser's answer checking (~12 s)
npm run test:browser   # the whole study loop and an exam, in Edge
npm run screens        # screenshots of every screen, light/dark/phone → tests/browser/shots/
npm run build          # php src/build-data.php
node tools/pdf/pages.js textbook-1 366 --book-page   # a book page as an image
```

The npm scripts find the right PHP themselves (`tools/php.js`; set
`ACADEMY_PHP` to choose one). The tests never touch your database or
`backups/`, never read `progress/`, `results/` or `reports/`, and never call
Google: each run makes throwaway databases (`academy_test_…`) and drops them
again. The browser tests use the installed Edge through `playwright-core`; set
`BROWSER_PATH` to use another Chromium browser.

The books have no text layer, so `tools/pdf/pages.js` pulls out each page's
image to read. `docs/kb/` is the reference for changing anything: where the
data came from (with page maps of every book), how the SRS, the audio and the
exam work, what to test, and why things are the way they are.

For Claude Code, `CLAUDE.md` holds the project rules, and `.claude/` holds the
rest: path-scoped rules, the `academy-*` skills (run, test, ui-check, data,
pdf, exam-items), and four review agents (code, UI, Japanese, data).
