---
name: japanese-n4
description: Playbook for this personal JLPT N4 study app — the Duolingo-style learning path (units, steps, pass rules), content schemas, SRS/adaptive engine mechanics, curriculum pacing, and how to run/test/extend the project. Load this for ANY work in this repo — adding vocab/kanji/grammar/sentence/story content, changing path units, touching scheduling or the adaptive engine, or changing the frontend.
---

# N4 Coach — project playbook

This is Frantisek's personal JLPT N4 study app. One user, one machine, no
accounts, no cloud. Read this before making any change so new work stays
consistent with what's already here.

## What this is, in one paragraph

A study app built around a **learning path** (Duolingo-style: sections →
units → steps, words → sentences → story, strict order with an 80% pass
rule) on top of real spaced repetition (SM-2 style) covering hiragana,
katakana, kanji, vocabulary, grammar, and example sentences, plus an
adaptive engine that watches accuracy/backlog and adjusts daily pace
automatically. The path is the only place new cards come from; the Reviews
tab is pure SRS review of everything already learned. Target: comfortable N4
readiness before the exam date in Settings. The user has tried multiple
study methods before without success, said explicitly that separate
practice modes without a flow didn't work for them, and wants stats-driven
adjustments and heavy repetition of already-known material (memory
retention is the stated weak point) — don't build features that let
material drift out of rotation for long stretches. The user writes in
non-native English: keep UI text short and plain.

## Keeping this knowledge base current — part of every task

After any change, update what went stale before calling the task done:
- this file (architecture, schemas, design decisions, gotchas, story-batch status),
- `.claude/agents/japanese-content-writer.md` if content rules changed,
- `CLAUDE.md` only if its essentials changed,
- `README.md` "How it works" / "Current state" for the user.

## Hard constraints — do not violate

- Frontend: vanilla JS + CSS only. No frameworks, no build step, no bundler,
  no TypeScript. `public/` is served as-is by Express.
- Backend: Node.js + Express only. No other services.
- Storage: local JSON files only (this is deliberate — no SQLite, no
  Postgres, nothing that needs installing). `server/data/content/*.json` are
  static seed content; `server/data/user/progress.json` is the single
  "database" of learner state (SRS cards, sessions, settings, logs, and
  learning-path step results). By the user's choice it is tracked in git
  (not gitignored) so progress is versioned/backed up — it will show a diff
  after nearly every study session, that's expected, not a sign of a bug.
  Never commit test data over it.
- Runs entirely offline/localhost. Server binds to `127.0.0.1` by design
  (see `server/index.js`) — don't change this to `0.0.0.0` without asking,
  since it would expose the study data on the local network.
- `start.ps1` / `start.sh` / `.nvmrc` (repo root) are a one-click launcher
  aimed at a non-technical end user who downloaded the repo as a ZIP, not a
  developer workflow — they detect/install NVM and the pinned Node version,
  install dependencies, start the server, and open the browser. They read
  `package.json`'s `config`/`engines.node` fields directly (with their own
  fallback defaults), so if either of those fields' shape ever changes,
  check both scripts still parse it correctly. Don't "simplify" these into
  the npm scripts or remove them — they're intentionally more thorough than
  `npm start` for someone without a dev environment already set up.

## Architecture map

```
server/
  index.js            entry point — host/port from package.json's `config` block
                      (currently 127.0.0.1:3001), overridable via PORT/HOST env vars
  app.js              express wiring, static file serving, daily adaptive-engine trigger,
                      loads content + progress + path on boot
  lib/
    dates.js          "YYYY-MM-DD" date string helpers (todayStr/addDays/addMonths/diffDays)
    jsonStore.js       generic atomic JSON read/write (temp file + rename, write queue per path)
    srs.js             the SM-2-ish scheduler — the only place scheduling math happens
                      (gradeCard, plus introduceCard for path-introduced cards)
    content.js         loads/caches the content JSON arrays, normalizes `type`, appendCard()
    progress.js        loads/saves progress.json (cards, sessions, settings, adaptiveLog, notes,
                      examLog, path); ensureSession(); N4_PROGRESS_FILE env override
    path.js            THE LEARNING PATH: loads path.json, step ladder, unlock/pass rules,
                      step payloads (learn cards / quiz questions / story), introducing cards
                      into SRS, test-out, readingHints(). See "Learning path" below.
    curriculum.js       getPhase() + getPathPace(): time plan relative to the exam date
    queue.js            builds the Reviews queue: due cards only, most overdue first
    adaptive.js          once/day: adjusts newCardsPerDay (path pace), toggles the kana gate, logs why
    stats.js            aggregates everything the dashboard/stats view needs
    exam.js              buildQuestion() (MCQ from a card, also used by path drills) + mock exam
  routes/*.js          thin Express routers, one per resource (content/queue/review/stats/
                       settings/curriculum/notes/export/cards/adaptiveLog/exam/stories/path)
  data/content/        hiragana.json, katakana.json, kanji.json, vocab.json, grammar.json,
                       sentences.json, stories.json (arrays), path.json, curriculum.json
  data/user/progress.json   generated on first run, git-tracked (user's choice) — the actual learner state
scripts/check-path.js  `npm run check` — validates path.json against the content files
public/
  index.html, styles.css
  js/api.js            fetch wrapper, one function per endpoint
  js/main.js           hash router (#view or #view/param/param, e.g. #lesson/hira-1/drill)
                       + view lifecycle (calls each view's returned cleanup fn)
  js/utils.js          escapeHtml, SRS-state -> status label/class, type -> label, paceSummary
  js/components/cardView.js   front/back/summary HTML per content type — the single source
                              of truth for how a card renders (frontHtml takes an optional
                              reading hint); study/browse/exam/lesson all use it
  js/components/charts.js     tiny dependency-free inline-SVG bar chart
  js/components/tts.js        wraps window.speechSynthesis (best-effort, no bundled audio)
  js/views/*.js         one render(root, navigate, params) function per route (dashboard/path
                        ["Learn"]/lesson [+ test-out]/study ["Reviews"]/stories/exam/browse/
                        stats/settings), returns an optional cleanup function (study, exam and
                        lesson need one, for their keydown listeners)
.claude/
  skills/japanese-n4/SKILL.md   this file
  agents/japanese-content-writer.md   subagent for content additions (see below)
```

## Learning path (the main flow)

Built because the user found separate practice modes (flashcards, stories,
exam) had no flow. Duolingo-style: learn words, use them in sentences, read
a story. Server: `server/lib/path.js` + `server/routes/path.js`. Frontend:
`public/js/views/path.js` (Learn tab) and `public/js/views/lesson.js` (runs
a step or a test-out).

- **Structure** (`server/data/content/path.json`):
  `{passAccuracy: 80, sections: [{id, title, description, units: [{id, title,
  new: [card ids], sentences: [sentence ids], story: story id | null,
  noStory?: true}]}]}`. Array order = teaching order; unit numbers are
  computed (global 1..N). Current plan: 4 sections, 59 units —
  `hira-1..6` (hiragana rows + the words they make readable), `kata-1..7`
  alternating with `words-1..6` (katakana + everyday words), `core-1..22`
  (words + their kanji + one grammar point + sentences), `n4-1..18` (rest of
  the kanji and grammar). Kana is mixed with real words from unit 1 (the
  user's choice). Kanji start only after katakana, because on'yomi readings
  are written in katakana.
- **Step ladder** (built by `unitSteps()`): `learn` + `drill` (if `new` is
  non-empty) → `sentences` (if `sentences` is non-empty) → `story` (unless
  `noStory`).
  - learn: flip through each new card with full details. Not graded (100%).
  - drill: MCQ over every new card once + earlier path cards already in review,
    overdue first (30% of the new count, at least 10 questions total); ~30% of
    questions are reverse (meaning → pick the Japanese). Distractors come from
    cards the path has taught so far (fallback: whole pool when fewer than 4).
  - sentences: same generator over the unit's sentences + earlier path
    sentences in review, at least 5 questions.
  - story: read the story (reading toggle, TTS), then its comprehension
    questions with the story still visible. No translation until the result.
  - In every quiz a wrong answer comes back once at the end for practice;
    only first tries count toward the score.
- **Pass rule:** a step passes when its best accuracy >= `passAccuracy` (80),
  stays passed if a replay scores lower, unlimited retries. The client posts
  `{correct, total}`; the server computes accuracy and pass state.
- **Unlocking** (`computePathState`), strict order with two non-blocking cases:
  - `soon`: a story step whose story doesn't exist yet or has fewer than 3
    questions. Never blocks. (Stories are written in batches.)
  - `catch-up`: any unpassed step *behind the furthest passed step* — e.g. a
    story or sentences added after the learner moved past that unit. Playable,
    shown with ↺, never blocks. So adding content to earlier units later is safe.
  - Statuses: `passed | open | catch-up | soon | locked`; exactly one `open`
    step (the Continue target). Unit status: `current | done | locked`.
- **SRS hand-off:** first pass of a unit's `drill` puts its `new` cards into
  `progress.cards` via `srs.introduceCard` (due tomorrow); first pass of
  `sentences` does the same for its sentences. Cards already in SRS are left
  alone. Lesson answers never grade SRS cards — `routes/review.js` stays the
  only grading path (same principle as the mock exam). Introduced cards count
  in `sessions[date].newCards`; each step attempt counts in `sessions[date].lessons`
  (which also keeps the streak alive).
- **Test-out:** any unit that isn't done has "Test out". It quizzes (max 30,
  round-robin across units) everything from the first unfinished unit up to
  the chosen one; >= 80% marks all their available steps passed with
  `testedOut: true` and introduces their cards spread over 7 days
  (`introduceCard(today, 1..7)`). Below 80% changes nothing.
- **Persistence:** `progress.path.steps["unitId/stepId"] = {attempts,
  lastAccuracy, bestAccuracy, passedAt, testedOut, updatedAt}`. Renaming a
  unit id or step id orphans saved progress — never do that. Reordering or
  inserting units is safe (statuses are recomputed; catch-up handles gaps).
- **Reading hints** (`readingHints`): a vocab word or sentence shows its kana
  reading under the Japanese while it contains any kanji whose kanji card
  isn't in review yet. Used by path quizzes and the Reviews queue (`hint`
  field → `frontHtml(card, hint)`), so words learned in kana units stay readable.
- **Pacing is soft:** the path shows "N reviews due, do them first",
  "kana accuracy dropped" (kana gate), today's new cards vs
  `settings.newCardsPerDay`, and on-track/behind (`getPathPace`: the path
  should be finished when the `examPrep` phase starts). None of these lock
  anything — only the pass rule locks.
- **API:** `GET /api/path` (state + pace), `GET/POST /api/path/step/:unitId/:stepId`,
  `GET/POST /api/path/test-out/:unitId`. Locked steps → 409.

### Story batches (content status)

Stories are written per unit by the content writer, in batches, in path order.
- Batch 1 (done, 2026-09-15): hira-1 `noStory` (not enough kana), hira-2..words-2
  → story-0020..0028 (kana only, English questions), plus kana sentences
  sent-0239..0259 for hira-3..words-2.
- Next: kata-3 onward. The 19 original stories (story-0001..0019) are already
  placed in core/n4 units but have no `questions` yet, so they show as `soon`
  until a batch adds questions. `npm run check` lists every unit still waiting.
- Question language: English for early units; switch to simple Japanese
  questions (`q` in Japanese + `qReading`) once the learner knows enough words
  (around the core section).

## Content schemas (server/data/content/*.json)

Every content file except path.json/curriculum.json is a flat JSON array.
`type` is added at load time by `content.js` from the filename — grammar.json
entries do NOT need a `type` field on disk, everything else conventionally
includes one for clarity anyway. Canonical type keys used everywhere in code
(progress.cards keys, queue items, path pools): `hiragana`, `katakana`,
`kanji`, `vocab`, `grammar`, `sentence` (singular — not "sentences", that's
only the filename).

- **hiragana.json / katakana.json** — `{id, type, char, romaji, kind, row, note?}`.
  `kind`: base | dakuten | handakuten | digraph | extended (katakana loanword
  sounds like ファ/ウィ). `id` pattern: `hira-<romaji-ish>` / `kata-<romaji-ish>`,
  e.g. `hira-shi`, `kata-kya`. These two files are complete (104 hiragana,
  116 katakana incl. extended) — normally you'd never add to them.
- **kanji.json** — `{id: "kanji-0001", type: "kanji", level: "N5"|"N4", char,
  onyomi: string[] (katakana), kunyomi: string[] (hiragana, "." before
  okurigana e.g. "た.べる"), meaning, examples: [{word, reading, meaning}] (1-2)}`.
- **vocab.json** — `{id: "vocab-0001", type: "vocab", level, front, reading,
  meaning, pos, tags: string[]}`. `pos` one of: noun, verb-ru, verb-u,
  verb-irregular, i-adjective, na-adjective, adverb, conjunction, expression,
  counter. Reuse existing tags (see the file) instead of inventing new ones.
- **grammar.json** — `{id: "gram-0001", level, order: <int>, pattern,
  meaning, explanation, example: {jp, reading, en}}`. `order` sorts the file
  on load (content.js); the path's unit placement decides when it's taught.
- **sentences.json** — `{id: "sent-0001", type: "sentence", jp, reading, en,
  words: string[] (vocab ids used), grammar?: string[] (gram ids used)}`.
  **Every id in `words` must exist in vocab.json**, and the sentence's unit
  must come at or after the units teaching all its words/grammar (checked by
  `npm run check`). Sentences for early (kana) units are written in kana only.
- **stories.json** — `{id: "story-0001", type: "story", level, title,
  titleReading, titleEn, lines: [{jp, reading, en}], words: string[]
  (union of vocab ids across all lines), grammar?: string[], questions?:
  [{q, qReading?, choices: string[], answer: <index>}]}`. Same word rule as
  sentences. A story needs >= 3 `questions` to be usable as a path story
  step. Formatting: the file uses a compact hand layout (one inline object
  per line inside `lines`/`questions`, inline id arrays) — keep it; a
  `JSON.stringify(_, null, 2)` rewrite turns a small edit into a 2000-line diff.
- **path.json** — see "Learning path" above.
- **curriculum.json** — `{startDate, phases: [{name, fraction, notes,
  examPrep?}]}`. `fraction` values must sum to `1.0`. Currently two phases:
  "Learning path" (0.85) and "Exam Prep" (0.15, `examPrep: true`). There is
  deliberately no `examDate` field here — the live exam date is
  `progress.settings.examDate` (Settings-editable).

### Adding content

- Use the **japanese-content-writer** subagent (`.claude/agents/`) for
  content additions — it knows these schemas, the path rules, and id numbering.
- **Every new card must be placed in a path unit**, or it never reaches the
  learner (the path is the only source of new cards). New words usually go
  into a new unit appended to the right section, or into an existing unit that
  the learner hasn't reached yet. Adding to an already-passed unit is safe but
  those cards only arrive through a catch-up step (for sentences) — for `new`
  cards prefer a new unit. Run `npm run check` after every content change.
- Accuracy bar: JLPT publishes no official kanji/vocab/grammar list, so
  there's no ground truth to check against — but every reading, meaning, and
  example sentence must still be correct standard Japanese. When unsure,
  omit rather than guess.
- Sentences and stories only use words/kanji/kana already taught by their
  unit. The user asked explicitly to keep N3+ vocabulary in sentences to an
  absolute minimum.
- No duplicate ids, no duplicate `char`/`front`/`pattern` within a file.
- The running app can also add single cards at runtime via `POST /api/cards`
  (see `server/routes/cards.js` and the "+ Add card" form in Browse) — these
  get an id like `vocab-custom-<timestamp>` and are appended straight into
  the relevant JSON file through `content.appendCard()`. They are NOT in any
  path unit (check-path ignores `-custom-` ids), so they only enter review if
  graded from Browse/Reviews flows that exist for them. Don't use this path for
  bulk seeding.

## SRS mechanics (server/lib/srs.js)

Modified SM-2 with 4-button grading (`again` / `hard` / `good` / `easy`),
day-granularity. Per-card state: `{box, efactor, interval, reps, lapses, due,
lastReview, isLeech, note, history[]}`.

- `box` increments on `good`/`easy`, resets to 0 on `again`. **"Known" means
  `box >= 2`** (`srs.isKnown`) — this counts toward the "known" stat and
  story readiness in the Stories tab.
- `introduceCard(today, dueInDays)` = a fresh state due in N days — how the
  path puts cards into review. Scheduling math still only lives in this file.
- `interval` is capped at `MAX_INTERVAL_DAYS = 45` even for very mature
  cards — deliberate, so nothing goes quiet for months given the user's
  stated memory/retention concerns. Don't remove this cap without asking.
- `lapses >= LEECH_LAPSE_THRESHOLD` (default 4, user-configurable in
  Settings) sets `isLeech = true`. Leeches stay in normal rotation (not
  suspended) but are surfaced separately in Stats so the user can add a
  personal mnemonic via the `notes` map (`PUT /api/notes/:cardId`).
- If you ever need to change the scheduling formula, do it only in
  `gradeCard()` — nowhere else computes intervals.

## Curriculum + Reviews queue (server/lib/curriculum.js, queue.js)

- **Phases are relative to the exam date, not fixed calendar weeks.** Each
  phase has a `fraction` of the total time between `curriculum.startDate`
  and `progress.settings.examDate`. `getPhase(curriculum, examDate, today)`
  finds the current phase; `getPathPace(curriculum, examDate, unitsTotal,
  today)` says how many units should be done by today so the path finishes
  when the `examPrep` phase starts. This is load-bearing: the user moved
  their exam date earlier on day one, and a fixed-week plan would have put
  Exam Prep after the exam. Every call site MUST pass
  `progress.settings.examDate` — a one-argument `getPhase(curriculum)` call
  is that bug again.
- **The Reviews queue (`buildQueue`) is due cards only**, most overdue first.
  It never introduces new cards — there is no weights/`extra`/daily-cap logic
  any more; that all moved to the path (new cards) and soft pace notices.
  The old curriculum `weights`/`unlocked`/`newCardsOverride` fields and the
  auto-unlocking of sentences in the queue were removed on 2026-09-15 when
  the path replaced them.
- The **kana gate**: if recent hiragana/katakana accuracy drops below 80%
  (`adaptive.js`), `progress.settings.kanaGateActive` is set; the Learn tab
  then shows a "review kana before a new unit" notice (soft, not a lock).

## Stories tab (server/routes/stories.js, public/js/views/stories.js)

The Stories tab is free reading of every story in `stories.json` (the same
stories the path uses for its story steps): never locked, annotated with how
much of each story's vocabulary is already `isKnown`, reading/translation
toggles and TTS, no grading. Stories are not SRS-tracked (`SRS_TRACKED_TYPES`
excludes `story`); grading happens only inside path story steps and only
affects path progress.

## Mock exam (server/lib/exam.js, routes/exam.js, public/js/views/exam.js)

Multiple-choice quizzes generated **entirely from cards already in
`progress.cards`** — never new material, zero authored quiz content:
- `buildQuestion(card, sameTypePool, {reverse})` builds one MCQ from the
  card's own fields (`PROMPT_FIELD`/`ANSWER_FIELD`; reverse uses
  `JAPANESE_CHOICE`, which adds the reading to vocab choices). Distractors
  skip anything that would also be correct (same answer text or same prompt
  text). If no distractor can be found the question is dropped. The path's
  drills and test-outs use the same function.
- **Exam answers never touch SRS state** — keeps "what determines a card's
  schedule" to a single code path (`routes/review.js` -> `srs.gradeCard`).
  Only the aggregate score is appended to `progress.examLog`. Don't wire exam
  or path quiz results back into `progress.cards` without discussing it first.
- Frontend reuses `cardView.frontHtml(card)` for the prompt.

## Adaptive engine (server/lib/adaptive.js)

Runs at most once per calendar day (checked via `progress.lastAdaptiveRun`,
triggered lazily on the first `/api/*` request of a new day — see the
middleware in `app.js`). `settings.newCardsPerDay` is now the learning path's
soft daily pace (shown on the Learn tab and in the learn step's warning).
Small, explainable rule set, in priority order:

1. **Backlog**: due count > 2.5x current `newCardsPerDay` → cut it to 60% (floor 5).
2. **Low accuracy**: 3-day review accuracy < 70% → cut it to 80%.
3. **High accuracy**: 7-day accuracy > 90% and no backlog → +3 (ceiling 30).
4. **Kana gate**: toggled independently, see above.

Accuracy here is SRS review accuracy only (`sessions.studied/correct`), not
path quizzes. Every change appends `{date, change, reason}` to
`progress.adaptiveLog`, shown on the Dashboard (last 3) and in full on the
Stats page. New rules follow the same pattern — plain-English `reason`.

## Running and testing

```
npm install
npm start        # node server/index.js — http://127.0.0.1:3001 (see package.json's `config`)
npm run dev       # node --watch server/index.js, restarts on file change
npm run check     # validate path.json against the content files
```

No test suite exists (intentionally — this is a small personal app). Before
calling any change done:

- `node --check <file>` on every edited backend or frontend JS file.
- `npm run check` after any content or path.json change (must end with `OK`).
- Hit the relevant `/api/*` endpoint(s) after a backend change.
- For any frontend change, check it in a real browser. `playwright-core`
  installed in the scratchpad with `chromium.launch({ channel: 'chrome' })`
  works on this machine (Chrome is installed; no browser download needed).
  Also check at 400px width (no horizontal page scroll).
- **Never test against the user's real data.** The user usually has their own
  instance running on port 3001 — don't kill it. Start a verification
  instance with a copy of the progress file:
  `PORT=3099 N4_PROGRESS_FILE=<scratchpad>/progress.test.json node server/index.js`
  (copy `server/data/user/progress.json` there first). With that override,
  POSTing reviews/path results is safe. On Windows, start it as a background
  task — a server started with `Start-Process` from a tool shell can die when
  that shell resets.
- To test path quizzes in a browser, capture the `GET /api/path/step/...`
  response (it includes `correctIndex`) and match the question by the
  "n / total" counter; a wrong first try adds a retry at the end.
- The server caches content and path.json at boot: restart it after editing
  content files.
- If you change scheduling (`srs.js`) or the adaptive engine, sanity-check
  with a few `/api/review` calls on the test instance and confirm
  `due`/`box`/`interval` move the way you expect.

To fully reset learner progress (start over from zero): stop the server and
delete `server/data/user/progress.json`. It's recreated fresh — with a new
`examDate` of today+4 months — on next boot. There's deliberately no in-app
"reset everything" button; this is a manual, explicit action only.

## Known gaps / deliberate non-goals

- No official JLPT kanji/vocab/grammar list exists to validate seed content
  against — the seeded content is a curated high-confidence starter set.
- Stories exist for units 2–10 so far; later units show "Story · soon" until
  later batches are written.
- Kana units are large (18–28 cards) because kana are grouped by several rows;
  the user already knew most hiragana/katakana and has test-out for that.
- No handwriting/stroke-order kanji practice — N4 is entirely multiple
  choice, so recognition-mode cards are the priority.
- Listening relies on the browser/OS's built-in `speechSynthesis` voices.
- Single user, no auth, no HTTPS — appropriate only because it's bound to
  127.0.0.1. Don't add multi-user features.
