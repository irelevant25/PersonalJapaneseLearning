# Decisions

Why things are the way they are. Check here before undoing one; add an entry
when you make a decision someone might later question.

**2026-09-22 — Exam is multiple choice; results are local JSON + HTML reports.**
The user chose both when asked (over typed answers, SQLite, browser storage).

**2026-09-22 — Data is transcribed from page images.** The PDFs have no text
layer and no OCR is available; pages were read visually and typed into TSV.
Counts were checked against the books (kanji numbering, per-lesson totals).

**2026-09-22 — The browser never gets exam answers; submit rebuilds the paper
from the echoed spec.** Keeps scoring honest. Rebuilding from the resulting
question count produced a different paper — the spec is echoed verbatim now.

**2026-09-22 — Distractors are generated mistakes, not random words.** Verbs
conjugated as the wrong class, compounds read with their kanji's other
readings, い/な rules crossed. EN→JP skips glosses shared by two words, so
there is never a second right answer.

**2026-09-22 — One app for both parts; the lesson number identifies the part.**
0–12 Part 1, 13–23 Part 2. Avoided duplicating the whole app for Part 2.

**2026-09-22 — Keigo verbs get no Part 2 forms; 〜さる verbs take います.**
A causative-passive of いらっしゃる isn't Japanese; くださります is the common
mistake, so it is offered as the distractor.

**2026-09-23 — The kanji trainer follows WaniKani's schedule exactly, minus the
time locks.** User request: lessons in batches of 5 but unlimited; practice of
learned items as often as wanted. Practice never changes the schedule, so
drilling can't wreck the spacing that makes an SRS work.

**2026-09-23 — Vocabulary is an SRS item only if written with the course's
kanji; it opens once its kanji are learned.** Mirrors WaniKani's
kanji-before-vocabulary order without any time gate.

**2026-09-23 — A kanji accepts any of its on/kun readings.** WaniKani asks for
a specific one; the course data doesn't say which reading is "primary", so the
trainer is deliberately more lenient.

**2026-09-23 — No radicals and no ready-made mnemonics.** The course provides
neither; WaniKani's are its own content. Every item has two note fields for the
learner's own mnemonics.

**2026-09-23 — Typo tolerance, but not for a typo that is another real
answer.** "night" is not accepted for 右 ("right"). Transpositions count as one
edit. Numbers must be exact.

**2026-09-23 — "My answer was right" instead of undo.** Stores the answer as the
learner's synonym (or extra reading) and counts it — covers gaps in the
transcribed meanings without an undo button.

**2026-09-23 — Answers save in the background.** A once-a-day backup copy was
held up by Windows for 5 s and froze the quiz. The next card no longer waits
for the disk; the backup moved to start-up.

**2026-09-23 — Daily backups never run inside an answer.** The start-up
backup copies the file. Past midnight, the new day's first save writes the
backup from memory, asynchronously, so nothing waits and `kanji.json` itself is
never held open. A review found that the old code copied the file during the
second answer of a fresh folder, and during the first answer after midnight.

**2026-09-23 — The last-resort copy in `renameWithRetry` stays.** When the
rename still fails after 0.9 s of retries, the save copies over `kanji.json`,
which is not atomic. Throwing instead would be purer, but Windows sometimes
holds the new temp file; copying from it keeps answers saving. A crash during
that copy is very unlikely, and even then the unreadable file is set aside at
load (never overwritten), and the daily backups and the answer log still exist.

**2026-09-23 — Tests run the real app in-process, against temp folders.**
`server.js` exports the app and listens only when run directly. The data
folders come from `ACADEMY_*_DIR`. `isolate()` refuses to run once the app is
loaded, and `startApp()` checks the app's real folders. This tests the actual
code paths without ever touching the owner's data.

**2026-09-23 — Browser tests use playwright-core with the installed Edge.** It
needs no browser download, and Edge is always present on Windows.
`BROWSER_PATH` can point at another Chromium browser.

**2026-09-23 — PDF pages are read by pulling out their JPEGs.** Each scanned
page is one embedded JPEG. `tools/pdf/pages.js` copies these out of the raw
file and crops and scales them with sharp. There is no poppler here, and
nothing is decoded twice.

**2026-09-23 — Page numbers are PDF page numbers, taken from the page tree.**
The first version of the tool numbered the images in the order they appear in
the file. That numbering drifted from the real pages for two reasons: blank
pages reuse one image, which that version counted once, and the part 2 scans
store their covers last. As a result, `--book-page` was off by up to 3 pages in
the second half of the workbooks. The tool now walks the PDF's page tree, and
the page maps were converted and checked against the printed page numbers.

**2026-09-23 — English UI, including dates with words.** The system locale is
Slovak; word-based dates use `en-GB`, numeric ones follow the locale.

**2026-09-23 — Claude Code setup lives in the repository's `.claude/`.** The
agents, skills and rules sit next to the app, with `CLAUDE.md` at the root, and
sessions start at the root. Claude Code finds agents only in the start folder
and the folders above it; skills and rules in subfolders load only after Claude
has touched files there. (Before the move into this repository they lived in
the workspace folder above the app, and the rule globs also carried a form with
the app's folder name.)

**2026-09-23 — This app replaced N4 Coach in the repository.** The owner found
N4 Coach's sentences and learning path wrong and asked for the switch. The app
moved from its own workspace folder to the repository root. N4 Coach is in the
git history; its last uncommitted changes were kept as a git stash entry.

**2026-09-23 — The books stay out of git.** The owner asked for the PDFs to go
into a local, gitignored folder: `books/`. The TSVs and the built JSON are in
git.

**2026-09-23 — Progress, results and reports are tracked in git.** Carried over
from N4 Coach, where the owner chose to version their progress in git.
`progress/backups/` and half-written `*.tmp` saves are gitignored; git already
keeps the history.

**2026-09-23 — The server listens on 127.0.0.1 only.** Carried over from
N4 Coach. The app has no login, and `POST /api/kanji/reset` wipes progress, so
it must not be reachable from the network by default. `HOST=0.0.0.0 npm start`
opens it (for a phone, say) when the owner wants that. The tests' in-process
server listens on 127.0.0.1 too (`tests/helpers.js`), which also spares a new
PC the firewall prompt.

**2026-09-23 — The one-click launcher stays.** `start.ps1` / `start.sh` /
`.nvmrc` come from N4 Coach: they check Node through NVM, install the
dependencies, start the app and open the browser. They read `.nvmrc` and
`config` in `package.json`, so the server takes its host and port from there.

**2026-09-23 — A click on a link to the address already shown re-routes.**
Lesson batches, sessions and summaries draw over the screen they started from
without changing the hash, and the browser fires no `hashchange` for a link to
the current address. So after a lesson started from the dashboard (still at
`#/`), Dashboard did nothing (the owner's bug report), and "New practice" did
nothing after a practice session. One delegated click handler in `app.js`
fixes every such link; giving sessions routes of their own would have meant
rebuilding in-memory batches from the URL. Because the learner can now leave
at any moment, a session that finishes saving after they left no longer draws
its summary over the new screen (a slow save would otherwise make Dashboard
look broken again).

**2026-09-23 — The app is called Japanese Academy, and nothing in the
repository names the course its data comes from.** The owner's requirement:
the repository on GitHub must not show where the data is from. Code, data
files, skills, agents, rules, environment variables (`ACADEMY_*`), the exam's
parts ("Part 1 / Part 2") and the PDFs (`textbook-1.pdf` …) were renamed, and
`tests/unit/source-names.test.js` fails on any mention. The real vocabulary
word 元気 stays in the data. Old N4 Coach commits mention the course once, in a
writing guideline; the owner chose to leave the history as it is.

**2026-09-23 — The audio is made with Google Cloud Text-to-Speech.** The
recordings that came with the source material were not licensed for this app,
and only 475 of the trainer's words had one. The owner chose Google Cloud TTS
(over VOICEVOX and the Windows voices) for its quality; this much text is
inside the free tier. Every word (2,041) gets two voices, female and male, and
the clips are committed (the owner's choice), so every PC has sound without a
key. Kanji words are sent with their reading as yomigana, so the reading is
always the list's. Clip names are random, so a listening question can't give
its answer away. The listening questions now come from the vocabulary list
itself, and a word that sounds the same is never offered as a distractor.
