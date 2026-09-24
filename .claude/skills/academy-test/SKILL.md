---
name: academy-test
description: Run and read the Japanese Academy tests (unit, API, browser end to end, screenshots) and choose the suites a change needs. Use after any code or data change in the app, before saying work is done, when a test fails, or when adding tests.
---

# Testing Japanese Academy

Run everything from the repository root. Every suite uses temp data folders. None touches the owner's `progress/`, `results/`
or `reports/`, and none needs the real server.

## Choosing the suites

| What changed | Run |
|---|---|
| anything | `npm test` (~5 s) |
| `public/**`, or anything a page renders | also `npm run test:browser` (~1–2 min) and `npm run screens`, then check the shots (`academy-ui-check`) |
| `data/source/**`, `src/build-*.js` | first `npm run build` (or `npm run build:audio`), then `npm test` |
| `src/conjugate.js`, `src/generate.js`, `data/authored-items*.js`, `public/kanji/answer.js` | `npm test`, then the `academy-japanese-reviewer` agent |
| tests only | the changed file, then `npm test` |

Narrower runs while you iterate:

```bash
node --test tests/unit/answer.test.js
node --test --test-name-pattern="practice" tests/unit/srs.test.js
npm run screens -- kanji-review        # only screens whose name contains this
```

Always finish with the full `npm test`.

## Reading the output

- `npm test` ends with `ℹ pass N` / `ℹ fail N`. A failure prints the test name,
  the assertion and a diff. Report the real numbers.
- `npm run test:browser` prints each step, then `BROWSER SUITE PASSED` or
  `N FAILURE(S)`. `npm run screens` ends with `no overflow, no page errors` or a
  `PROBLEMS:` list. Both exit with 1 on any problem.
- These are expected and not failures:
  - audio requests answering 206 (range requests);
  - an exam verdict like "32.5% FAIL · F" in the browser log, because the
    script answers at random;
  - 409 from `/api/kanji/learn` or `/review`, which the suite ignores by design.
- `No Edge/Chrome found` means the browser wasn't found. Set `BROWSER_PATH`;
  Edge is at `C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`.
- A failing test is information. Work out whether the code or the expectation
  is wrong, and say which. Never loosen an assertion to get a pass, and never
  quietly skip a failing suite.

What each file covers is in `docs/kb/testing.md`.

## Adding a test

- **Unit:** `tests/unit/<area>.test.js`, using `node:test` and
  `node:assert/strict`, for pure functions.
- **API:** start the file like this:
  ```js
  const { isolate, startApp, call } = require('../helpers');
  isolate('academy-<area>-api');   // before any app module loads
  const test = require('node:test');
  const assert = require('node:assert/strict');
  let app;
  test.before(async () => { app = await startApp(); });
  test.after(() => app.close());
  // call(app.base, 'POST', '/api/kanji/learn', { id: 'k:大' }) → { status, body }
  // make an item due: app.store.load().items[id].nextReview = Date.now() - 1000
  ```
- **Browser:** extend `tests/browser/run.js`. The helpers in
  `tests/browser/browser.js` are `launch`, `watch` and the reporter. Seed state
  through the API or the store, and call `page.goto('about:blank')` before
  reopening the same URL.
- New behaviour gets its test in the same change. If you add a file or change
  what a suite covers, update `docs/kb/testing.md`.
