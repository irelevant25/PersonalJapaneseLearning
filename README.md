# N4 Coach

A personal study app for passing the JLPT N4, built because flashcard apps
and generic courses hadn't been sticking. It's a flashcard/spaced-repetition
system that watches your actual accuracy and pace, and adjusts itself —
slowing down when you're struggling, speeding up when you're not, and
forcing repetition of things you've already "learned" so they don't quietly
fall out of memory.

Everything runs locally: a small Node.js server, a plain HTML/CSS/JS
frontend, and a JSON file as the only "database." No accounts, no cloud, no
internet connection required once installed.

## Quick start

**If you downloaded this project as a ZIP (not via `git`) and don't already
have Node.js set up**, use the launcher script for your OS — it handles
everything for you:

- **Windows**: right-click **`start.ps1`** → *Run with PowerShell* (or open
  PowerShell in this folder and run `./start.ps1`). If Windows blocks the
  script the first time, open PowerShell as yourself in this folder and run
  `Set-ExecutionPolicy -Scope Process RemoteSigned` first, then try again.
- **Mac / Linux**: open a terminal in this folder and run `./start.sh`
  (first time only, make it runnable with `chmod +x start.sh`).

The script checks whether you have [NVM](https://github.com/nvm-sh/nvm)
(the Node Version Manager) and the exact Node.js version this project needs
(see `.nvmrc`) — offering to install whichever is missing — then installs
the project's dependencies, starts the server, and opens it in your default
browser automatically. Installing NVM on Windows needs an admin
confirmation prompt (UAC); everything else runs as your normal user. Once
everything is installed, later runs are fast — just double-click/run the
script again any time you want to study, and **Ctrl+C** in that window
stops the server.

**If you already have Node.js 18.11+ installed** (or are comfortable with a
terminal), you don't need the scripts — just:

```
npm install
npm start
```

Then open the address it prints (**http://127.0.0.1:3001** by default —
configurable via the `config` block in `package.json`, or override with
`PORT`/`HOST` env vars) in a browser.

For development (auto-restart on file changes):

```
npm run dev
```

The server only listens on `127.0.0.1` (localhost) — it isn't reachable from
other devices on your network. Your study data never leaves your machine.

## How it works

### Cards

Six kinds of flashcards, all reviewed with the same spaced-repetition engine:

- **Hiragana** and **Katakana** — the complete syllabaries (base, dakuten/
  handakuten, digraphs, plus a set of extended katakana combinations used in
  loanwords like ファ/ウィ/ティ).
- **Kanji** — character, on'yomi/kun'yomi readings, meaning, and 1-2 example
  words.
- **Vocabulary** — word, reading, meaning, part of speech, topic tags.
- **Grammar** — a pattern (e.g. 〜たことがあります), its meaning, a plain-
  language explanation, and an example sentence.
- **Sentences** — full example sentences. These unlock automatically, one at
  a time, only once *every* vocabulary word they use is already something
  you know — so you'll never see a sentence full of unfamiliar words. N3-
  level vocabulary is avoided in sentences as much as possible.

### Spaced repetition

Every card has its own schedule (a modified SM-2 algorithm): grade a card
**Again / Hard / Good / Easy** and its next-due date adjusts accordingly.
Two deliberate choices, given that memory retention was the whole reason for
building this:

- A card only counts as "known" after surviving **two** successful reviews,
  not one.
- Even a card you find very easy repeatedly is never pushed out further than
  **45 days** — nothing is allowed to drift out of rotation for months.

Cards you fail repeatedly (4+ times, adjustable in Settings) are flagged as
**leeches** and surfaced separately on the Stats page so you can attach a
personal mnemonic note to them from the Browse tab.

### The adaptive engine

Once a day, the app looks at your recent stats and can automatically:

- **Slow down** new material if your 3-day accuracy drops below 70%, or if
  your review backlog gets more than 2.5x your daily new-card rate.
- **Speed up** new material (+3 cards/day, up to a ceiling of 30) if your
  7-day accuracy is above 90% and you have no backlog.
- **Gate everything behind kana** — if recent hiragana/katakana accuracy
  drops below 80%, new kanji/vocab/grammar/sentences slow to a trickle until
  kana recognition is solid again, since everything else depends on it.

Every adjustment is logged in plain language (Dashboard shows the last few,
Stats shows the full history) — it's meant to be a study plan you can see
and trust, not a black box. You can always override the new-cards-per-day
number yourself in Settings.

### Curriculum

A 4-phase plan (`server/data/content/curriculum.json`) controls which
categories are introducing new material at all. Phases are **proportions of
the time between when you started and your target exam date**, not fixed
calendar weeks — so if you push your exam date earlier or later in
Settings, every phase boundary automatically compresses or stretches to
match, and "Exam Prep" always lands in the final stretch before test day:

1. **Kana Foundations** (first ~12% of your timeline): hiragana and
   katakana only (plus a little vocab so it feels useful right away).
2. **Core Building** (next ~42%): kanji, vocabulary, and grammar introduced
   together; sentences start unlocking as vocabulary accumulates.
3. **Integration** (next ~31%): new-card pace slows on purpose; more
   emphasis on full sentences and listening.
4. **Exam Prep** (final ~15%): no new material at all — pure review and
   leech cleanup until test day.

Your target exam date is set in Settings (defaults to 4 months from first
run) and the Dashboard always shows which phase you're currently in.
**New-card pacing is also soft, not a hard wall**: if you finish today's
planned new cards and nothing is due for review yet, Study offers a "study
extra cards anyway" option rather than making you wait until tomorrow.

### Listening

Every card has a 🔊 button that uses your browser/OS's built-in
text-to-speech (the Web Speech API) to read the Japanese aloud. Quality and
availability depend entirely on what Japanese voice(s) are installed on your
system — there's no bundled or downloaded audio.

### Your own words

The Browse tab has a "+ Add card" form for vocabulary/kanji/grammar you run
into outside the seeded content — it flows through the exact same SRS/queue/
stats machinery as everything else.

### Stories

Short reading-practice passages, separate from the flashcard system on
purpose — there's no sensible way to "grade" recall of a whole paragraph
with Again/Hard/Good/Easy, so Stories live in their own tab instead of the
daily queue. Each one is annotated with how much of its vocabulary you
already know, but nothing is ever locked — you can read anything, whenever
you want. Reading/translation are independent show/hide toggles, and every
line (plus the whole story at once) has a listen button.

### Mock exam

Multiple-choice quizzes built entirely from cards you've **already
studied** — never new material — which is a closer match to the real JLPT
format (it's 100% multiple choice) than a flip card is. Answering an exam
question never changes any card's schedule; it's purely a self-check, with
just the aggregate score kept for your own record on the Stats page. Pick
how many questions you want, answer, and see a breakdown by category plus
exactly what you missed at the end.

## Current state

Seed content is curated (JLPT publishes no official kanji/vocab/grammar
list, so these are high-confidence starter sets, not exhaustive) and meant
to keep growing over the 4 months, via the `japanese-content-writer` agent:

| Type | Count | Notes |
|---|---|---|
| Hiragana | 104 | complete (base + dakuten/handakuten + digraphs) |
| Katakana | 116 | complete, incl. 12 extended loanword sounds (ファ/ウィ/…) |
| Kanji | 287 | 115 N5 + 172 N4, each with readings/meaning/example words |
| Vocabulary | 319 | 282 N5 + 37 N4, across greetings/verbs/adjectives/numbers/etc. |
| Grammar | 48 | full N4 grammar sequence, all N5 prerequisites included |
| Sentences | 238 | built entirely from the seeded vocabulary; every grammar point appears at least twice |
| Stories | 19 | 4-8 lines each, N5→N4 difficulty, built entirely from the seeded vocabulary |

Check the in-app **Stats** tab at any time for live counts and your actual
progress against them — that's the source of truth, this table is just a
snapshot as of first build (2026-09-08).

## Project structure

```
server/            Node/Express backend — see .claude/skills/japanese-n4/SKILL.md for the full map
public/            vanilla JS/CSS frontend, no build step
start.ps1/.sh       one-click launcher for non-technical users (see Quick start above) —
                    installs NVM/Node/dependencies as needed, starts the server, opens the browser
.claude/skills/     the "japanese-n4" skill: full architecture, schemas, SRS/adaptive
                    engine details, and conventions for this project
.claude/agents/     "japanese-content-writer" subagent for adding new content in bulk
```

If you're using Claude Code on this repo, the `japanese-n4` skill has
everything needed to work on it consistently — content schemas, id
conventions, how the scheduler and adaptive engine work, and how to
run/verify changes.

## Your data

Everything lives in `server/data/user/progress.json` — per-card scheduling
state, daily session history, settings, the adaptive engine's decision log,
and any personal notes/mnemonics you've added. It's created automatically on
first run. By choice, it's tracked in git (not gitignored) so your progress
is versioned/backed up alongside the code — expect it to show up as a diff
in `git status` after every study session.

- **Backup**: Settings tab → "Download backup (JSON)".
- **Full reset**: stop the server and delete `server/data/user/progress.json`.
  It regenerates fresh (with a new exam date of today + 4 months) next time
  you start the app. Since it's tracked in git, that deletion will show up in
  `git status` until you commit it. There's no in-app reset button on
  purpose.

## Known limitations

- Content is a curated starting set, not the full N4 syllabus — expect to
  keep extending `kanji.json`/`vocab.json`/`grammar.json`/`sentences.json`/
  `stories.json` over time (see the `japanese-content-writer` agent).
- No handwriting/stroke-order practice — the JLPT N4 test is entirely
  multiple-choice, so these cards focus on recognition (reading/listening),
  not production.
- Text-to-speech quality depends on voices installed on your OS/browser.
- Single-user, localhost-only — there's no login system because there's
  only ever one user.
