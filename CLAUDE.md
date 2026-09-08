# N4 Coach

Personal JLPT N4 study app: flashcards, real spaced repetition, and an
adaptive engine that adjusts pace based on the user's own accuracy stats.
Local-only by design — vanilla JS/CSS frontend, Node.js/Express backend,
plain JSON files for storage. No database, no build step, no external
services, no accounts.

**Before making any change in this repo, load the `japanese-n4` skill**
(`.claude/skills/japanese-n4/SKILL.md`). It has the full architecture map,
content JSON schemas, SRS and adaptive-engine mechanics, curriculum rules,
and how to run/test — this file is intentionally just a pointer, not a
duplicate of that.

For adding new vocab/kanji/grammar/sentence content in bulk, use the
`japanese-content-writer` subagent (`.claude/agents/`) rather than hand-
writing JSON — it knows the schema and id conventions.

## Run it

```
npm install
npm start        # http://127.0.0.1:3000
npm run dev       # auto-restart on file changes
```

See `README.md` for the current project state and how the app works from a
user's perspective; the in-app Stats tab has live progress and the adaptive
engine's decision log.
