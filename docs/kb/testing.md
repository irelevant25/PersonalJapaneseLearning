# Testing

Every test that needs the database gets a **throwaway database**:
`academy_test_<…>`, a copy of `academy_test_template` (tables and study
content, brought up to date at the start of each run by
`php tests/tools/testdb.php template` — a few seconds when `data/` or the
generators changed, instant otherwise). Backups go to a temp folder. The
database is dropped when the test file ends; set `ACADEMY_KEEP_TEMP=1` to keep
it and the folder for inspection. Databases a killed run left behind are swept
6 hours later. No test can reach your database (`japanese_academy`) or
`backups/`, no test reads `progress/`, `results/` or `reports/`, and no test
sends anything to Google.

How the isolation works, like the old `isolate()`:

- PHP: `tests/lib.php` is the first thing every PHP test file loads. It sets
  `ACADEMY_DB_NAME` / `ACADEMY_BACKUPS_DIR` before the app loads and refuses to
  go on if the app was loaded first, or if the database name isn't a test
  name. `start_app()` then starts the real server and checks, through
  `/api/health`, that it uses that database and folder.
- Node (browser suites, `answer.test.js`): `tests/helpers.js` `isolate()` picks
  the names; `startApp()` makes the database, starts the server (PHP's built-in
  web server, as `npm start` does) and makes the same check.
- `tests/tools/testdb.php` (create, drop, sweep, sql) only touches databases
  named `academy_test_…`.

| Command | What | Time |
|---|---|---|
| `npm test` | `php tests/run.php` (every `tests/unit/*.test.php` and `tests/api/*.test.php`, four files at a time, each in its own process and database) + `node --test tests/unit/*.test.js` | ~12 s |
| `npm run test:browser` | `tests/browser/run.js` — Edge, the whole study loop + an exam | ~1 min |
| `npm run screens [filter]` | `tests/browser/screens.js` — 9 screens × light/dark/phone into `tests/browser/shots/` | ~1 min |
| `php tests/run.php tests/unit/srs.test.php` | some PHP files (with PHP 8 — `npm test` finds it; see [environment.md](environment.md)) | |

## What each suite pins down

PHP (`tests/lib.php`: `test()`, `before()`, `after()`, `assert_same()` —
strict, `assert_true()`, `assert_match()`, `assert_throws()`, `start_app()`,
`call()`):

- `unit/conjugation.test.php` — both conjugation charts cell by cell (70 + 84),
  the くる/つくる trap, kanji spelling, honorific ます-forms, adjective forms.
- `unit/srs.test.php` — WaniKani intervals, penalties, floor, burn, that
  practice leaves the schedule alone, and that the autumn's repeated hour
  floors to its first occurrence (as the browser-era JavaScript did).
- `unit/catalog.test.php` — 317 kanji numbered 1–317 with the book's
  per-lesson totals; SRS ids unique; vocabulary uses only the course's kanji
  and sits in its latest kanji's lesson; every vocabulary item has a clip in
  both voices, and every clip in `data/audio.json` exists in `data/audio/`.
- `unit/exam-bank.test.php` — bank size, distinct options, seed
  reproducibility, part/lesson scope, answer index correctness, and that the
  seeded RNG still gives the first (JavaScript) version's numbers, so a seed
  gives the paper it always gave.
- `unit/audio.test.php` — what a word is spoken as (`speech_spoken()`), the
  requests (kanji with yomigana), and the builder with a fake voice in temp
  folders: each word once per voice, a rebuild sends only what is missing,
  unused clips are removed, a changed recipe or voice remakes exactly its clips
  (also after a `--limit` run), a failed request or a stop keeps what was made
  and deletes nothing, an unreadable index stops the build, a refused word is
  skipped, a dry run sends nothing.
- `unit/build-data.test.php` — building `data/source/*.tsv` again gives exactly
  the `data/*.json` in the repository.
- `unit/source-names.test.php` — no file and no file name that git would
  publish (`git ls-files -co --exclude-standard`) names the course the data
  comes from (the owner's requirement). The owner's study history
  (`progress/`, `results/`, `reports/`) is left out: tests never read it.
  Commit messages are not checked: keep them clean by hand.
- `api/kanji-api.test.php` — learn / review / practice / notes / settings /
  export / reset through HTTP, moving the clock by editing the test database;
  every answer in `srs_log`; the day's backup taken by a page load and never by
  an answer; a full reset backed up first (with the log) and the log kept.
- `api/exam-api.test.php` — no answer leaks, perfect/zero/70 % scoring,
  foreign answers refused (409, nothing saved), report and history, clips
  streaming from `data/audio` (byte ranges too; a bad or escaping name answers
  404), unknown addresses answer 404, and the server logged no PHP warning.
- `api/backup.test.php` — the day's backup (nothing for an empty database; a
  complete copy once a day, naming its database; the last 14 kept), a
  throwaway database's backups kept out of `backups/`, the raw copy of every
  table before a migration, a restore bringing everything back, the one-time
  import of the old JSON files from a fixture (once, only into an empty
  database, the files unchanged, a short old record completed, unreadable lines
  listed, an unreadable progress file importing nothing and named in the error,
  no file read at all when the database holds data), and `setup.php --import` /
  `--check`.

Node:

- `unit/answer.test.js` — the browser's answer checking
  (`public/kanji/answer.js`): meaning/reading acceptance cases, and that
  **every** catalog item (built by the PHP code, `tests/tools/catalog.php`) is
  answerable and accepts its own printed answers.
- `browser/run.js` — types answers like a person (romaji readings, one miss on
  purpose), makes reviews due, practises, uses "My answer was right", clicks
  the links that point at the current address after a session (Dashboard after
  a lesson started there, "New practice"), holds a practice save back for 1.5 s
  and leaves while it saves (the summary must not come back over the
  dashboard), checks browse and a listening exam; fails on any page error or
  failed request.

The audio checks (catalog, exam bank, exam API, the browser's listening exam)
need the clips of `npm run build:audio`, which are in git.

The PHP port was checked against the JavaScript it replaced before that was
removed: the same bank (all 11,523 questions), catalog, papers, scores,
reports, schedule and every API answer (see [decisions.md](decisions.md)).

## What to run for a change

| Changed | Run |
|---|---|
| anything | `npm test` |
| `public/**` or anything the pages render | `npm test`, `npm run test:browser`, `npm run screens` + look at the shots |
| `data/source/**`, build scripts | `npm run build` (and `build:audio` when words changed), `npm test` |
| `src/conjugate.php`, `src/generate.php`, authored items | `npm test` + the `academy-japanese-reviewer` agent |
| `src/migrations/` | `npm test` (the template picks new migrations up) and `php setup.php --check` |

## Reading results — expected noise

- Audio requests answer **206** (the browser asks for byte ranges) — correct.
- An exam verdict text like "32.5% FAIL · F" is the exam's own output for
  random answers, not a test failure.
- `/api/kanji/learn` and `/review` can legitimately answer 409 (double submit);
  the browser suite ignores those in its error check.
- `academy_test_template: updated (3 s)` at the start of `npm test` means the
  content or a migration changed since the last run.

## Adding tests

PHP: a new `tests/unit/<area>.test.php` or `tests/api/<area>.test.php`,
starting with `require __DIR__ . '/../lib.php';` — before anything else. Then
`test('name', function (): void { … })` with the assertions above. API tests:
`before(function (): void { $GLOBALS['app'] = start_app(); })`, then
`call($GLOBALS['app']['base'], 'POST', '/api/kanji/learn', ['id' => 'k:大'])`
→ `['status', 'body', 'raw', 'headers']`. The app's own functions work in the
test process too, on the same throwaway database (`test_db()` makes it): move
the SRS clock with
`db_exec('UPDATE srs_progress SET next_review = academy_time(?) WHERE item_id = ?', [now_ms() - 1000, $id])`.

Browser scripts: `tests/browser/browser.js` finds Edge/Chrome (`BROWSER_PATH`
overrides) and provides `launch()`, `watch()` (collects page errors) and a
reporter; `app.makeDue(ids)` makes reviews due. Navigate through `about:blank`
when the target URL equals the current one, or the page won't reload. Audio
tests pass `audio_build()` a fake `synth` and temp folders.
