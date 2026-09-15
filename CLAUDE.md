# N4 Coach

Personal JLPT N4 study app. The main flow is a Duolingo-style **learning
path** (sections -> units -> steps: learn words, drill, sentences, story,
80% to pass, strict order), on top of real spaced repetition and an adaptive
engine that adjusts pace from the user's own accuracy stats. Local-only by
design — vanilla JS/CSS frontend, Node.js/Express backend, plain JSON files
for storage. No database, no build step, no external services, no accounts.

## Always, before any work here

**Load the `japanese-n4` skill** (`.claude/skills/japanese-n4/SKILL.md`). It
has the architecture map, the learning-path design and pass rules, content
JSON schemas, SRS and adaptive-engine mechanics, and how to run/test — this
file is intentionally just a pointer, not a duplicate of that.

For adding vocab/kanji/grammar/sentence/story content or new path units, use
the `japanese-content-writer` subagent (`.claude/agents/`) rather than hand-
writing JSON — it knows the schemas, id conventions, and path rules.

## Always, after a change

Keeping the knowledge base in sync is part of finishing the task:
- `.claude/skills/japanese-n4/SKILL.md` — architecture, design decisions,
  gotchas, story-batch status.
- `.claude/agents/japanese-content-writer.md` — if content rules changed.
- `CLAUDE.md` (this file) — only if the essentials here changed.
- `README.md` — "How it works" / "Current state" for the user.

## Essentials

- Run: `npm start` (http://127.0.0.1:3001, port from `package.json`
  `config`). Users run `start.ps1` / `start.sh`.
- Validate content: `npm run check` (path.json vs content files).
- New cards come **only** from the learning path (`server/lib/path.js`,
  `server/data/content/path.json`); the Reviews tab is due cards only.
  Unit and step ids are progress keys — never rename them.
- `server/data/user/progress.json` is the user's real progress and is
  tracked in git. The user often has the app running on port 3001: test on
  another port with a copy
  (`PORT=3099 N4_PROGRESS_FILE=<scratchpad copy> node server/index.js`),
  never kill their instance, never commit test data.
- The user writes in non-native English: keep UI text and explanations
  plain and short.

See `README.md` for how the app works from the user's side.
