# Japanese Academy — project instructions

This repository is Japanese Academy, the owner's local, single-user study app
for a two-part beginner Japanese course: a WaniKani-style kanji SRS
(`/kanji.html`) and an 11,523-question multiple-choice exam (`/exam.html`),
with every word spoken in two voices. Node 22 + Express, plain JS in the
browser (no framework, no build step), state in JSON files. The owner studies
with it daily at http://localhost:3000.

It replaced the earlier N4 Coach app on 2026-09-23, because the owner found
N4 Coach's sentences and learning path wrong. N4 Coach lives on only in the git
history; don't bring its code or content back.

**Never name the course the data comes from** — not in code, data, docs, file
names, commit messages or UI text. The repository is on GitHub, and the owner
doesn't want it to show the source. Say "the course", "Part 1 / Part 2",
"textbook 1". `tests/unit/source-names.test.js` fails on any mention. (The real
word 元気 in the vocabulary is fine.)

**Knowledge base: `docs/kb/README.md`.** Before changing an area, read its kb page.
If a change makes a statement in the kb, the README or a count wrong, fix it in
the same piece of work.

## What is where

- The app is at the repository root: `server.js`, `src/`, `public/`, `data/`,
  `tests/`, `tools/`, knowledge base in `docs/kb/`.
- `books/` is gitignored and stays on this computer. It holds the five scanned
  course books (`textbook-1.pdf`, `workbook-1.pdf`, `textbook-2.pdf`,
  `workbook-2.pdf`, `answer-key.pdf`), the owner's notes, and old audio the app
  no longer uses. The PDFs have no text layer, so read them only through the
  `academy-pdf` skill.
- `data/audio/` + `data/audio.json`: the spoken vocabulary, made with Google
  Cloud Text-to-Speech by `npm run build:audio`, and kept in git. Making new
  clips needs `GOOGLE_TTS_API_KEY` in `.env` (gitignored). Never print the key,
  put it in a file that git tracks, or paste it into a message.
- `.claude/` holds the project's skills, agents and path-scoped rules.
- `start.ps1` / `start.sh` / `.nvmrc` are the owner's one-click launcher: they
  check Node through NVM, install dependencies, start the app and open the
  browser. They read `.nvmrc` (an exact version) and `config.host` /
  `config.port` in `package.json`, so keep those shapes. Don't add
  `engines.node` to `package.json`: the launchers would use it instead of
  `.nvmrc`, and they accept only an exact version like `22.15.0`.

## Commands (run from the repository root)

```
npm start                    the real app on 127.0.0.1:3000, with the real data (academy-run skill)
npm test                     unit + API tests, ~5 s: run after every change
npm run test:browser         Edge end to end: lessons → reviews → practice → exam
npm run screens -- [name]    screenshots, light/dark/phone → tests/browser/shots/
npm run build                data/source/*.tsv → data/*.json
npm run build:audio          missing clips → data/audio/ (Google TTS; -- --dry-run needs no key)
node tools/pdf/pages.js <book> <pages>    page images of the scanned PDFs (academy-pdf skill)
```

## The owner's data: hard rules

- `progress/` (kanji progress, answer log, backups), `results/` and `reports/`
  (exam attempts; the first is from 2026-09-22) are the owner's real study
  history. Never delete, move, rewrite, reformat or "clean up" them. Never point
  a test or an experiment at them.
- They are tracked in git on purpose (the owner's choice), so they change after
  every study session. `progress/backups/` is not tracked. Commit only when the
  owner asks, and never commit test data.
- Anything that runs the app other than `npm start` sets `ACADEMY_PROGRESS_DIR`,
  `ACADEMY_RESULTS_DIR` and `ACADEMY_REPORTS_DIR` to temp folders. For tests,
  `tests/helpers.js` `isolate()` does this. For a manual server, use the
  throwaway server in the academy-run skill.
- Edit `progress/kanji.json` by hand only when the owner asks. Stop the server
  first and copy the file to `progress/backups/` before touching it.
- The books in `books/` are source material. Read them; never modify them.

## Invariants

Tests enforce most of these. Never weaken a test to make it pass.

- Exam honesty: `POST /api/exam` never sends answers (`answerIndex`, `correct`,
  `distractors`, `explain`). `POST /api/submit` rebuilds the paper from the
  echoed `spec`, never from the number of questions. Clip names are random, so
  a listening question's audio gives nothing away.
- Every exam question has exactly one right option. Every distractor must be
  wrong for the question as asked, not merely less natural.
- SRS: the schedule is WaniKani's (`src/srs/srs.js`). Only a review of a due item
  moves `stage`/`nextReview`; practice never does. Lessons and practice are
  unlimited, with no daily caps or time locks. This is the owner's explicit
  requirement.
- SRS ids are `k:<kanji>` / `v:<word>`. Renaming one orphans the owner's progress
  for that item (see `docs/kb/data-provenance.md`).
- Saves are atomic (tmp + rename, with retry). Never put a synchronous copy or
  backup inside a lesson, review or practice request. Backups run at start-up,
  or in the background past midnight. The copy before a full reset is the one
  deliberate exception.
- `data/*.json` is generated: edit `data/source/*.tsv`, then rebuild.
  `data/authored-items-part1|2.js` is hand-written. `data/audio.json` and
  `data/audio/` come only from `npm run build:audio`.
- What a word is spoken as is decided in one place, `spoken()` in
  `src/speech.js`, shared by the audio builder, the catalog and the exam.
- Conjugation matches both conjugation charts; the tests check every cell.
- The server listens on 127.0.0.1 only (`config.host` in `package.json`). The
  app has no login and can reset progress, so don't open it to the network
  without asking the owner.

## Conventions

- CommonJS, 2-space indent, single quotes, semicolons. Match the file you are
  in, including its comment density.
- Front end: classic scripts sharing `window.KA`, loaded in order by
  `kanji.html` (answer → core → session → views → app). `answer.js` stays UMD so
  the Node tests can require it. No framework, bundler or CDN: the app runs
  offline.
- Colours come only from tokens in `public/css/base.css`, each defined for light
  and dark. Every screen must work at phone width (390 px).
- The UI is in English. The system locale is Slovak, so dates with words use
  `'en-GB'`.
- The owner writes in non-native English: keep UI text and explanations plain
  and short.
- Japanese data follows the book: readings in hiragana, English glosses as
  printed.

## Skills and agents: use them every time

The owner's standing instruction is to work on this project through its own
skills, agents and knowledge base. They live in `.claude/`. Path-scoped rules
there load when you read the matching files.

**Skills.** At the start of a task, load the one that matches:

| Skill | For |
|---|---|
| `academy-run` | start, stop or restart the real server on :3000, or a throwaway isolated one |
| `academy-test` | which suites to run for a change, reading results, adding tests |
| `academy-ui-check` | screenshots of every screen (light/dark/phone) and a visual checklist |
| `academy-data` | editing the `data/source` TSVs, rebuilding, making audio, SRS id renames |
| `academy-pdf` | reading the scanned books as page images; page maps |
| `academy-exam-items` | writing or fixing hand-written exam questions |

**Agents.** These are read-only reviewers, and running them is mandatory at
these checkpoints:

| Checkpoint | Agent |
|---|---|
| Code changed anywhere in the app (not docs-only), before calling it done | `academy-code-reviewer` |
| Anything under `public/` changed | `academy-ui-tester` |
| Japanese content changed: conjugation, exam generation, authored items, answer checking, catalog readings or meanings, spoken forms (`src/speech.js`) | `academy-japanese-reviewer` |
| `data/source/` or a build script changed | `academy-data-auditor` |

Give each agent the list of changed files, what changed and why (`git status`
shows the uncommitted work). If an agent shows as "not found" (agents load
when a session starts), run a general-purpose agent instead. Tell it to follow
`.claude/agents/<name>.md` and to stay read-only. Run agents that don't depend
on each other in parallel. Fix what they find, or tell the owner why you
didn't. A small follow-up fix inside the same area doesn't need a second full
review round.

## Definition of done

1. `npm test` passes. If `public/` changed, `npm run test:browser` also passes
   and the screens have been checked.
2. The checkpoint agents that apply have run. Their findings are fixed or
   reported.
3. The kb pages, the README and the counts are still true. Any decision someone
   might question has an entry in `docs/kb/decisions.md`.
4. If server-side code or data changed, the real server has been restarted
   (academy-run) and answers requests. If it wasn't running, start it once to
   check, then stop it again.
5. The final message says what changed, what was verified and how, and anything
   left undone.
