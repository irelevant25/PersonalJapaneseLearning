---
name: japanese-n4
description: Playbook for this personal JLPT N4 study app — content schemas, SRS/adaptive engine mechanics, curriculum rules, and how to run/test/extend the project. Load this for ANY work in this repo — adding vocab/kanji/grammar/sentence content, touching scheduling or the adaptive engine, or changing the frontend.
---

# N4 Coach — project playbook

This is Frantisek's personal JLPT N4 study app. One user, one machine, no
accounts, no cloud. Read this before making any change so new work stays
consistent with what's already here.

## What this is, in one paragraph

A flashcard app with real spaced repetition (SM-2 style) covering hiragana,
katakana, kanji, vocabulary, grammar, and example sentences, plus an adaptive
engine that watches accuracy/backlog and adjusts daily pace automatically.
Target: comfortable N4 readiness in ~4 months. The user has tried multiple
study methods before without success and explicitly wants stats-driven
adjustments and heavy repetition of already-known material (memory retention
is the stated weak point) — don't build features that let material drift out
of rotation for long stretches.

## Hard constraints — do not violate

- Frontend: vanilla JS + CSS only. No frameworks, no build step, no bundler,
  no TypeScript. `public/` is served as-is by Express.
- Backend: Node.js + Express only. No other services.
- Storage: local JSON files only (this is deliberate — no SQLite, no
  Postgres, nothing that needs installing). `server/data/content/*.json` are
  static seed content; `server/data/user/progress.json` is the single
  "database" of learner state. By the user's choice it is tracked in git
  (not gitignored) so progress is versioned/backed up — it will show a diff
  after nearly every study session, that's expected, not a sign of a bug.
- Runs entirely offline/localhost. Server binds to `127.0.0.1` by design
  (see `server/index.js`) — don't change this to `0.0.0.0` without asking,
  since it would expose the study data on the local network.

## Architecture map

```
server/
  index.js            entry point — binds to 127.0.0.1:3000 by default
  app.js              express wiring, static file serving, daily adaptive-engine trigger
  lib/
    dates.js          "YYYY-MM-DD" date string helpers (todayStr/addDays/addMonths/diffDays)
    jsonStore.js       generic atomic JSON read/write (temp file + rename, write queue per path)
    srs.js             the SM-2-ish scheduler — the only place scheduling math happens
    content.js         loads/caches the 6 content JSON files, normalizes `type`, appendCard()
    progress.js        loads/saves progress.json (cards, sessions, settings, adaptiveLog, notes)
    curriculum.js       resolves which phase "today" falls into, relative to the exam date
    queue.js            builds a study session: due reviews + weighted new cards
    adaptive.js          once/day: adjusts newCardsPerDay, toggles the kana gate, logs why
    stats.js            aggregates everything the dashboard/stats view needs
  routes/*.js          thin Express routers, one per resource (content/queue/review/stats/
                       settings/curriculum/notes/export/cards/adaptiveLog)
  data/content/        hiragana.json, katakana.json, kanji.json, vocab.json, grammar.json,
                       sentences.json, curriculum.json — seed content, versioned in git
  data/user/progress.json   generated on first run, git-tracked (user's choice) — the actual learner state
public/
  index.html, styles.css
  js/api.js            fetch wrapper, one function per endpoint
  js/main.js           hash router + view lifecycle (calls each view's returned cleanup fn)
  js/utils.js          escapeHtml, SRS-state -> status label/class, type -> display label
  js/components/cardView.js   front/back/summary HTML per content type — the single source
                              of truth for how a card renders; study.js and browse.js both use it
  js/components/charts.js     tiny dependency-free inline-SVG bar chart
  js/components/tts.js        wraps window.speechSynthesis (best-effort, no bundled audio)
  js/views/*.js         one render(root, navigate) function per tab, returns an optional
                        cleanup function (only study.js needs one, for its keydown listener)
.claude/
  skills/japanese-n4/SKILL.md   this file
  agents/japanese-content-writer.md   subagent for bulk content additions (see below)
```

## Content schemas (server/data/content/*.json)

Every content file is a flat JSON array. `type` is added at load time by
`content.js` from the filename — grammar.json entries do NOT need a `type`
field on disk, everything else conventionally includes one for clarity
anyway. Canonical type keys used everywhere in code (progress.cards keys,
queue items, curriculum weights): `hiragana`, `katakana`, `kanji`, `vocab`,
`grammar`, `sentence` (singular — not "sentences", that's only the filename).

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
  meaning, explanation, example: {jp, reading, en}}`. `order` drives teaching
  sequence (content.js sorts by it on load) — always give a new entry an
  `order` that reflects where it belongs, not just `max(order)+1`, if it's a
  prerequisite for existing later entries.
- **sentences.json** — `{id: "sent-0001", type: "sentence", jp, reading, en,
  words: string[] (vocab ids used), grammar?: string[] (gram ids used)}`.
  **Every id in `words` must exist in vocab.json.** This is the dependency
  list the queue uses to auto-unlock a sentence (see below) — get it wrong
  and a sentence either never appears or appears before its words are known.
- **curriculum.json** — not a card list. `{startDate, phases: [{name,
  fraction: number, unlocked: string[], weights: {type: number},
  newCardsOverride?}]}`. `fraction` values across all phases must sum to
  `1.0` — see the Curriculum section below for why. `weights` are
  proportional (largest-remainder allocation in `queue.js`), not absolute
  counts. There is deliberately no `examDate` field here — the live exam
  date is `progress.settings.examDate` (Settings-editable), and every
  `getPhase()` call site must pass it in.

### Adding content

- Prefer the **japanese-content-writer** subagent (`.claude/agents/`) for any
  *batch* addition (a new set of vocab/kanji/grammar/sentences) — it knows
  this schema and will read existing files first to continue id numbering
  and avoid duplicates. Use it directly for one-off single-card additions.
- Accuracy bar: JLPT publishes no official kanji/vocab/grammar list, so
  there's no ground truth to check against — but every reading, meaning, and
  example sentence must still be correct standard Japanese. When unsure,
  omit rather than guess.
- Keep example sentences (kanji `examples`, grammar `example`, and
  `sentences.json` itself) built from words already in `vocab.json` wherever
  possible. The user asked explicitly to keep N3+ vocabulary in sentences to
  an absolute minimum, and only once there's enough known N4/N5 vocabulary to
  make sentences worthwhile at all.
- No duplicate ids, no duplicate `char`/`front`/`pattern` within a file.
- The running app can also add single cards at runtime via `POST /api/cards`
  (see `server/routes/cards.js` and the "+ Add card" form in Browse) — these
  get an id like `vocab-custom-<timestamp>` and are appended straight into
  the relevant JSON file through `content.appendCard()`. Fine for the user's
  own one-off additions; don't use this path for bulk seeding, edit the JSON
  files directly (or use the subagent) instead.

## SRS mechanics (server/lib/srs.js)

Modified SM-2 with 4-button grading (`again` / `hard` / `good` / `easy`),
day-granularity. Per-card state: `{box, efactor, interval, reps, lapses, due,
lastReview, isLeech, note, history[]}`.

- `box` increments on `good`/`easy`, resets to 0 on `again`. **"Known" means
  `box >= 2`** (`srs.isKnown`) — this is what gates sentence unlocking and
  counts toward the "known" stat.
- `interval` is capped at `MAX_INTERVAL_DAYS = 45` even for very mature
  cards — deliberate, so nothing goes quiet for months given the user's
  stated memory/retention concerns. Don't remove this cap without asking.
- `lapses >= LEECH_LAPSE_THRESHOLD` (default 4, user-configurable in
  Settings) sets `isLeech = true`. Leeches stay in normal rotation (not
  suspended) but are surfaced separately in Stats so the user can add a
  personal mnemonic via the `notes` map (`PUT /api/notes/:cardId`).
- If you ever need to change the scheduling formula, do it only in
  `gradeCard()` — nowhere else computes intervals.

## Curriculum + queue (server/lib/curriculum.js, queue.js)

- **Phases are relative to the exam date, not fixed calendar weeks.** Each
  phase has a `fraction` of the total time between `curriculum.startDate`
  and `progress.settings.examDate` (all `fraction`s sum to 1.0).
  `getPhase(curriculum, examDate, today)` computes `daysElapsed / totalDays`
  and walks the cumulative fractions to find the current phase. This is
  deliberate and load-bearing: the user changed their exam date mid-project
  (moved it *earlier*) on day one, and the original fixed-week design
  (`weeks: [start, end]`, ignoring exam date entirely) would have scheduled
  "Exam Prep" to start *after* the new exam date — i.e. never actually
  entering pure-review mode before the test. Every call site
  (`routes/queue.js`, `routes/stats.js`, `routes/curriculum.js`) MUST pass
  `progress.settings.examDate` into `getPhase()` — if you ever see a call to
  `getPhase(curriculum)` with only one argument, that's the bug again.
- `curriculum.json` phases gate which categories can introduce **new**
  cards, and in what proportion (`weights`). They never gate review of cards
  already introduced — SRS alone decides when a due card resurfaces.
- `sentence` is special: instead of a fixed weight-based pool position, a
  sentence becomes eligible the moment every id in its `words` array is
  "known" (see above). `queue.pickEligibleSentences` does this check.
- The **kana gate**: if recent hiragana/katakana accuracy drops below 80%
  (`adaptive.js`), `progress.settings.kanaGateActive` is set and `queue.js`
  scales all non-kana new-card weights down to 15% until it clears. This is
  a safety net independent of the phase — it can kick in during any phase if
  kana slips.
- Daily new-card budget = `curriculumPhase.newCardsOverride ?? settings.newCardsPerDay`,
  minus new cards already introduced today (tracked per-date in
  `progress.sessions[date].newCards`).
- **The daily cap is a soft pacing aid, not a hard wall.** `buildQueue(...,
  extra: true)` (wired to `GET /api/queue?extra=1`) ignores the numeric
  daily cap for one fetch — this is what powers the "study extra cards
  anyway" button in Study's empty state. It does NOT bypass curriculum
  gating: Exam Prep's `weights: {}` still yields zero new cards regardless
  of `extra`, since there's nothing to pick from. Don't let `extra` grow
  into a way to skip phase gating — it's specifically an escape hatch for
  "I have more time/motivation than today's pace assumed," not for jumping
  ahead in the curriculum.

## Adaptive engine (server/lib/adaptive.js)

Runs at most once per calendar day (checked via `progress.lastAdaptiveRun`,
triggered lazily on the first `/api/*` request of a new day — see the
middleware in `app.js`). Small, explainable rule set, in priority order:

1. **Backlog**: due count > 2.5x current `newCardsPerDay` → cut new cards to
   60% of current (floor 5).
2. **Low accuracy**: 3-day accuracy < 70% → cut new cards to 80% of current.
3. **High accuracy**: 7-day accuracy > 90% and no backlog → new cards +3
   (ceiling 30).
4. **Kana gate**: toggled independently, see above.

Every change appends `{date, change, reason}` to `progress.adaptiveLog`,
shown on the Dashboard (last 3) and in full on the Stats page. If you add a
new rule, follow the same pattern — plain-English `reason` string, not just
a number change. The point is a study plan the user can trust and audit, not
a black box.

## Running and testing

```
npm install
npm start        # node server/index.js — http://127.0.0.1:3000
npm run dev       # node --watch server/index.js, restarts on file change
```

No test suite exists (intentionally — this is a small personal app). Before
calling any change done:

- `node --check <file>` on any edited backend `lib`/`routes` file or frontend
  `public/js` file to catch syntax errors.
- Actually hit the relevant `/api/*` endpoint(s) (curl / `Invoke-RestMethod`)
  after a backend change.
- For any frontend change, start the server and check it in a real browser —
  don't assume a UI change works from reading the code. Use the `run` skill
  if available.
- If you change scheduling (`srs.js`) or the adaptive engine, sanity-check
  with a few manual `/api/review` calls and confirm `due`/`box`/`interval`
  move the way you expect — there's no automated test harness catching
  regressions here.
- If `npm start` fails with `EADDRINUSE` on port 3000, don't assume it's a
  leftover process you spawned and kill it — the user runs this app
  themselves too, and it's very likely their own live session. Verify first
  (e.g. does progress.json have very recent activity?), and prefer starting
  a second instance on another port (`PORT=3001 npm start`) for read-only
  verification (GET requests only — `/api/queue`, `/api/stats`, etc. don't
  write) over touching whatever's already listening. Only grading a review
  writes to progress.json, and two Node processes writing to it around the
  same time can clobber each other's in-memory cache — avoid POSTing
  `/api/review` against a shared data file from a verification instance.

To fully reset learner progress (start over from zero): stop the server and
delete `server/data/user/progress.json`. It's recreated fresh — with a new
`examDate` of today+4 months — on next boot. It's git-tracked, so that
shows up as a pending deletion until committed. There's deliberately no
in-app "reset everything" button (too easy to hit by accident); this is a
manual, explicit action only.

## Known gaps / deliberate non-goals for v1

- No official JLPT kanji/vocab/grammar list exists to validate seed content
  against (confirmed via web search when this project was built) — the
  seeded content is a curated high-confidence starter set, not exhaustive.
  Expect to keep growing it over the 4 months via the content-writer agent.
- No handwriting/stroke-order kanji practice — N4 is entirely multiple
  choice (vocabulary/grammar/reading/listening), so recognition-mode cards
  are the priority. Could be added later as a genuine nice-to-have, not v1.
- Listening relies on the browser/OS's built-in `speechSynthesis` voices —
  quality and availability of a Japanese voice varies by machine. No audio
  files are bundled or downloaded.
- Single user, no auth, no HTTPS — appropriate only because it's bound to
  127.0.0.1. Don't add multi-user features; there's no use case for them
  here.
