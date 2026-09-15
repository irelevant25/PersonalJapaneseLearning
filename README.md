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

1. Download or clone this project.
2. **Windows**: double-click `start.ps1`. **Mac/Linux**: run `./start.sh` in a terminal.
3. The app opens in your browser automatically.

The server only listens on `127.0.0.1` (localhost) — it isn't reachable from
other devices on your network. Your study data never leaves your machine.

## How it works

### The learning path (Learn tab)

This is where you study. Like Duolingo, it is one flow instead of separate
practice modes: learn a few new things, use them in sentences, then read a
short story. The path has 4 sections and 59 units:

1. **Hiragana + first words**: a few hiragana rows at a time, plus real words
   you can already read with them.
2. **Katakana + everyday words**: katakana rows, mixed with units of words.
3. **Kanji + grammar in sentences**: words with their kanji, one grammar
   point per unit, and sentences that use them.
4. **More kanji + N4 grammar**: the rest of the N4 kanji and grammar.

Every unit has the same steps:

- **Learn**: see each new card, with reading, meaning and a listen button.
- **Drill**: multiple-choice questions on the new cards, plus some older ones.
- **Sentences**: what do sentences with these words mean?
- **Story**: read a short story, then answer questions about it.

**Pass rules:** you pass a step with **80% or more**. Steps open one after
another, so you can't skip ahead, but you can retry as often as you like, and
a step you passed stays passed. A wrong answer comes back once at the end of
the round for practice, but only your first try counts.

- **Already know a unit?** Press **Test out**. With 80% you skip ahead to
  that unit, and its cards go into your reviews (spread over a week).
- **Stories are still being written.** Units without one show "Story · soon"
  and don't block you. If a story is added to a unit you already finished, it
  shows as an optional ↺ step.
- **When cards go into your reviews:** when you pass a unit's drill, its new
  cards are added to your reviews, starting tomorrow.
- **Pace:** the Learn tab tells you if reviews are due, how many new cards
  you added today, and whether you're on track to finish the path before
  Exam Prep. These are hints, not locks.

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
- **Sentences** — full example sentences. The path only shows a sentence
  after it has taught every word in it, so you'll never see a sentence full
  of unfamiliar words. N3-level vocabulary is avoided as much as possible.

While a word or sentence still has kanji you haven't learned, its reading is
shown under it.

### Spaced repetition (Reviews tab)

New cards only come from the learning path. The **Reviews** tab shows the
cards that are due today. Every card has its own schedule (a modified SM-2 algorithm): grade a card
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

Once a day, the app looks at your recent stats and adjusts your daily
new-card pace (the pace the learning path suggests):

- **Slow down** if your 3-day accuracy drops below 70%, or if your review
  backlog gets more than 2.5x your daily new-card rate.
- **Speed up** (+3 cards/day, up to a ceiling of 30) if your 7-day accuracy
  is above 90% and you have no backlog.
- **Kana first** — if recent hiragana/katakana accuracy drops below 80%, the
  Learn tab asks you to review kana before starting a new unit, since
  everything else depends on it.

Every adjustment is logged in plain language (Dashboard shows the last few,
Stats shows the full history) — it's meant to be a study plan you can see
and trust, not a black box. You can always override the new-cards-per-day
number yourself in Settings.

### Curriculum

A simple time plan (`server/data/content/curriculum.json`) splits the time
between when you started and your exam date:

1. **Learning path** (first ~85%): work through the path and do your reviews.
2. **Exam Prep** (final ~15%): the path should be done — daily reviews,
   leeches, stories and mock exams until test day.

These are **proportions of your timeline**, not fixed weeks, so if you move
your exam date in Settings, the plan stretches or shrinks to match. The
Learn tab and Dashboard show whether you're on track.

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

Short reading passages. In the learning path, each unit's story comes with
comprehension questions. The Stories tab lets you read any story freely,
with no questions and nothing locked. Each one is annotated with how much of
its vocabulary you already know. Reading/translation are independent show/hide toggles, and every
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
| Sentences | 259 | built entirely from the seeded vocabulary; 21 simple kana-only sentences for the first units |
| Stories | 28 | 19 longer N5→N4 stories + 9 short kana stories for units 2–10 |
| Learning path | 59 units | stories with questions in units 2–10 so far; the rest are written in batches |

Check the in-app **Stats** tab at any time for live counts and your actual
progress against them — that's the source of truth, this table is just a
snapshot (last updated 2026-09-15).

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
