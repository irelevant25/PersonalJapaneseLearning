---
name: academy-test
description: Run and read the Japanese Academy tests (PHP unit and API tests, the Node test of the browser's answer checking, browser end to end, screenshots) and choose the suites a change needs. Use after any code or data change in the app, before saying work is done, when a test fails, or when adding tests.
---

# Testing Japanese Academy

Run everything from the repository root. Every suite uses throwaway databases
(`academy_test_…`, copied from `academy_test_template`) and temp folders. None
touches the owner's database or `backups/`, none reads `progress/`, `results/`
or `reports/`, and none needs the real server. PostgreSQL must be running.

## Choosing the suites

| What changed | Run |
|---|---|
| anything | `npm test` (~12 s) |
| `public/**`, or anything a page renders | also `npm run test:browser` (~1 min) and `npm run screens`, then check the shots (`academy-ui-check`) |
| `data/source/**`, `src/build-*.php` | first `npm run build` (or `npm run build:audio`), then `npm test` |
| `src/conjugate.php`, `src/generate.php`, `data/authored-items*.php`, `public/kanji/answer.js` | `npm test`, then the `academy-japanese-reviewer` agent |
| `src/migrations/` | `npm test` (the template takes the new migration), then `npm run setup -- --check` |
| tests only | the changed file, then `npm test` |

Narrower runs while you iterate (`php` must be PHP 8: on this PC use
`C:/Users/pastorekf/Documents/php-8.5.10/php.exe`, see `docs/kb/environment.md`):

```bash
php tests/run.php tests/unit/srs.test.php tests/api/kanji-api.test.php
node --test tests/unit/answer.test.js
npm run screens -- kanji-review        # only screens whose name contains this
```

Always finish with the full `npm test`.

## Reading the output

- `npm test` runs `php tests/run.php` first: one `▶ file` block per test file
  with `✔`/`✖` lines, then `ℹ tests N` / `ℹ pass N` / `ℹ fail N`. A failure
  prints the assertion's message, expected and actual, and the test file's
  line. Then `node --test` prints its own `ℹ pass` / `ℹ fail`. Report the real
  numbers of both.
- `academy_test_template: updated (3 s)` at the start means `data/`, a
  generator or a migration changed since the last run — expected.
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
- `No PHP 8.1+ … found` comes from `tools/php.js`: set `ACADEMY_PHP` to a
  php.exe 8.1+ with pdo_pgsql, mbstring and intl.
- `Could not prepare the test database` means PostgreSQL isn't reachable with
  the settings in `src/config.local.php`.
- A failing test is information. Work out whether the code or the expectation
  is wrong, and say which. Never loosen an assertion to get a pass, and never
  quietly skip a failing suite.

What each file covers is in `docs/kb/testing.md`.

## Adding a test

- **PHP unit or API:** `tests/unit/<area>.test.php` or `tests/api/<area>.test.php`,
  starting with `require __DIR__ . '/../lib.php';` — before anything else, so
  the app loads with a throwaway database. Then:
  ```php
  test('what it pins down', function (): void {
      assert_same($expected, $actual, 'message');   // strict ===
  });
  // API: the real server on this file's database
  $GLOBALS['app'] = null;
  before(function (): void { $GLOBALS['app'] = start_app(); });
  // call($GLOBALS['app']['base'], 'POST', '/api/kanji/learn', ['id' => 'k:大']) → ['status', 'body', 'raw', 'headers']
  // make an item due: db_exec('UPDATE srs_progress SET next_review = academy_time(?) WHERE item_id = ?', [now_ms() - 1000, $id])
  ```
  The app's functions work in the test process too, on the same database
  (`test_db()` makes it for tests that don't start the server). Other helpers:
  `assert_true`, `assert_false`, `assert_match`, `assert_no_match`,
  `assert_throws`, `server_problems($app)` (PHP warnings the server logged).
- **Node (the browser code):** `tests/unit/<area>.test.js` with `node:test` and
  `node:assert/strict`; `require('../helpers').catalog()` gives the catalog the
  PHP code builds.
- **Browser:** extend `tests/browser/run.js`. The helpers in
  `tests/browser/browser.js` are `launch`, `watch` and the reporter;
  `startApp()` from `tests/helpers.js` (after `isolate()`) gives `base`,
  `makeDue(ids)` and `sql(query, ...params)`. Seed state through the API or
  `sql`, and call `page.goto('about:blank')` before reopening the same URL.
- New behaviour gets its test in the same change. If you add a file or change
  what a suite covers, update `docs/kb/testing.md`.
