# Testing

Tests that run the server or the SRS store use **temporary data folders**.
`tests/helpers.js#isolate()` points `ACADEMY_PROGRESS_DIR`, `ACADEMY_RESULTS_DIR`
and `ACADEMY_REPORTS_DIR` at a new temp folder. It must run before `server.js`,
`src/srs/store.js` or `src/srs/routes.js` is loaded, and it throws if one already
is. `startApp()` then checks that all three folders the app actually uses are
inside that temp folder, comparing real paths without regard to case, and
listens on 127.0.0.1 like the real server. The unit tests only load pure modules
and need no isolation. The temp folder is deleted when the run ends; set
`ACADEMY_KEEP_TEMP=1` to keep it for inspection. No test can reach `progress/`,
`results/` or `reports/`, and no test sends anything to Google.

| Command | What | Time |
|---|---|---|
| `npm test` | `tests/unit/*.test.js` + `tests/api/*.test.js` (node:test) | ~5 s |
| `npm run test:browser` | `tests/browser/run.js` — Edge, the whole study loop + an exam | ~1–2 min |
| `npm run screens [filter]` | `tests/browser/screens.js` — 9 screens × light/dark/phone into `tests/browser/shots/` | ~1 min |

## What each suite pins down

- `unit/conjugation.test.js` — both conjugation charts cell by cell (70 + 84),
  the くる/つくる trap, kanji spelling, honorific ます-forms, adjective forms.
- `unit/srs.test.js` — WaniKani intervals, penalties, floor, burn, and that
  practice leaves the schedule alone.
- `unit/answer.test.js` — meaning/reading acceptance cases, and that **every**
  catalog item is answerable and accepts its own printed answers.
- `unit/catalog.test.js` — 317 kanji numbered 1–317 with the book's per-lesson
  totals; SRS ids unique; vocabulary uses only the course's kanji and sits in
  its latest kanji's lesson; every vocabulary item has a clip in both voices,
  and every clip in `data/audio.json` exists in `data/audio/`.
- `unit/audio.test.js` — what a word is spoken as (`spoken()`), the requests
  (kanji with yomigana), and the builder with a fake voice in temp folders:
  each word once per voice, a rebuild sends only what is missing, unused clips
  are removed, a changed recipe or voice remakes exactly its clips (also after
  a `--limit` run), a failed request or a stop keeps what was made and deletes
  nothing, an unreadable index stops the build, a refused word is skipped, a
  dry run sends nothing.
- `unit/source-names.test.js` — no file and no file name that git would
  publish (`git ls-files -co --exclude-standard`) names the course the data
  comes from (the owner's requirement). The owner's study history
  (`progress/`, `results/`, `reports/`) is left out: tests never read it.
  Commit messages are not checked: keep them clean by hand.
- `unit/exam-bank.test.js` — bank size, distinct options, seed reproducibility,
  part/lesson scope, answer index correctness.
- `api/kanji-api.test.js` — learn / review / practice / notes / settings /
  reset through HTTP, moving the clock by editing the in-memory store. It also
  checks that no backup is taken during answers, that the past-midnight backup
  is written in the background (with `Date.now` moved in-process), and that
  `isolate()` refuses to run once the app has loaded.
- `api/store-backup.test.js` — the start-up backup is one complete copy
  (copied aside, then renamed), and saving the same day adds nothing.
- `api/exam-api.test.js` — no answer leaks, perfect/zero/70 % scoring,
  foreign answers refused, report, clips streaming from `data/audio` (and a bad
  or escaping name answering 404).
- `browser/run.js` — types answers like a person (romaji readings, one miss on
  purpose), makes reviews due, practises, uses "My answer was right", clicks
  the links that point at the current address after a session (Dashboard after
  a lesson started there, "New practice"), holds a practice save back for 1.5 s
  and leaves while it saves (the summary must not come back over the
  dashboard), checks browse and a listening exam; fails on any page error or
  failed request.

The audio checks (catalog, exam bank, exam API, the browser's listening exam)
need the clips of `npm run build:audio`, which are in git.

## What to run for a change

| Changed | Run |
|---|---|
| anything | `npm test` |
| `public/**` or anything the pages render | `npm test`, `npm run test:browser`, `npm run screens` + look at the shots |
| `data/source/**`, build scripts | `npm run build` (and `build:audio` when words changed), `npm test` |
| `src/conjugate.js`, `src/generate.js`, authored items | `npm test` + the `academy-japanese-reviewer` agent |

## Reading results — expected noise

- Audio requests answer **206** (the browser asks for byte ranges) — correct.
- An exam verdict text like "32.5% FAIL · F" is the exam's own output for
  random answers, not a test failure.
- `/api/kanji/learn` and `/review` can legitimately answer 409 (double submit);
  the browser suite ignores those in its error check.

## Adding tests

node:test + node:assert/strict, one concern per file. API tests: call
`isolate()` at the very top, then `startApp()` in `test.before` and `close()`
in `test.after`. Move the SRS clock with
`app.store.load().items[id].nextReview = Date.now() - 1000`. Browser scripts:
`tests/browser/browser.js` finds Edge/Chrome (`BROWSER_PATH` overrides) and
provides `launch()`, `watch()` (collects page errors) and a reporter. Navigate
through `about:blank` when the target URL equals the current one, or the page
won't reload. Audio tests pass `build()` a fake `synth` and temp folders.
