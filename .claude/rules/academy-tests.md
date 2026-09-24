---
paths:
  - "tests/**"
---

# Tests (Japanese Academy)

Reference: `docs/kb/testing.md`. For running and reading results,
use the `academy-test` skill.

- A test or script that loads `server.js`, `src/srs/store.js` or
  `src/srs/routes.js` must first call
  `const { isolate, startApp } = require('../helpers'); isolate('<name>');`.
  Those modules pick their data folders when they load, and `isolate()` throws
  if one already has. Pure modules (catalog, srs, answer, generate, conjugate)
  need no isolation. Never point `ACADEMY_*` at the real folders, and never read
  or write `progress/`, `results/` or `reports/`.
- Use `node:test` with `node:assert/strict`. The layout:
  - `tests/unit`: pure functions.
  - `tests/api`: HTTP against the in-process app via `startApp()`.
  - `tests/browser`: `playwright-core` driving the installed Edge. These are
    scripts, not part of `npm test`.
- Never weaken or delete an assertion to get a pass. Find out whether the code
  or the expectation is wrong, and say which.
- Expected values that come from the books (chart cells, per-lesson kanji
  totals) are read from the page images. Cite the page in a comment.
- In browser scripts, set up state through the API or the store (as
  `screens.js` does) rather than with long UI sequences. Navigate via
  `about:blank` to force a reload, and fail on page errors.
- `tests/browser/shots/` is generated output and safe to overwrite.
- When suites or counts change, update `docs/kb/testing.md`.
