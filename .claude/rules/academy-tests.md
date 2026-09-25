---
paths:
  - "tests/**"
---

# Tests (Japanese Academy)

Reference: `docs/kb/testing.md`. For running and reading results,
use the `academy-test` skill.

- Every PHP test file starts with `require __DIR__ . '/../lib.php';`, before
  anything else. It points the app at a throwaway database (`academy_test_…`,
  copied from `academy_test_template`) and a temp backup folder, and refuses to
  go on if the app was loaded first. Node scripts that start the server call
  `isolate()` from `tests/helpers.js` before `startApp()`. Never point
  `ACADEMY_DB_NAME` at the real database, and never read or write `progress/`,
  `results/` or `reports/` (import tests build fixtures in temp folders).
- The layout:
  - `tests/unit/*.test.php`: pure PHP functions (conjugation, SRS, catalog,
    bank, audio builder, data build, source names).
  - `tests/api/*.test.php`: HTTP against the real server via `start_app()`,
    and the database functions (backups, import) in the test process.
  - `tests/unit/*.test.js`: the browser code (`answer.js`), with `node:test`
    and `node:assert/strict`.
  - `tests/browser`: `playwright-core` driving the installed Edge. These are
    scripts, not part of `npm test`.
  - `tests/tools/`: `testdb.php` (the throwaway databases; only `academy_test_…`
    names) and `catalog.php`.
- Never weaken or delete an assertion to get a pass. Find out whether the code
  or the expectation is wrong, and say which.
- Expected values that come from the books (chart cells, per-lesson kanji
  totals) are read from the page images. Cite the page in a comment.
- In browser scripts, set up state through the API or `app.sql()` /
  `app.makeDue()` (as `screens.js` does) rather than with long UI sequences.
  Navigate via `about:blank` to force a reload, and fail on page errors.
- `tests/browser/shots/` is generated output and safe to overwrite.
- When suites or counts change, update `docs/kb/testing.md`.
