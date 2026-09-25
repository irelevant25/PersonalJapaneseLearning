---
paths:
  - "src/srs/**"
  - "src/backup.php"
  - "public/kanji/**"
  - "public/kanji.html"
---

# Kanji SRS (Japanese Academy)

Reference: `docs/kb/kanji-srs.md`. Read it before changing the trainer.

- The schedule is WaniKani's: 4, 8, 23, 47, 167, 335, 719 and 2879 h, rounded
  down to the local hour. The penalty is `ceil(w/2)` stages, doubled from Guru
  up, and never goes below Apprentice I. Change it only if the owner asks, and
  update `tests/unit/srs.test.php` with it.
- `srs_practice()` updates only `practice.*` and `lastWrongAt`. It must never
  touch `stage`, `nextReview` or the review counters: the owner drills as often
  as they like because practice can't move the schedule.
- No daily caps and no time locks on lessons (batches, 5 by default) or on
  practice. This is the owner's requirement.
- `POST /review` is accepted only for a due item (60 s grace) and answers 409
  otherwise. That same check, with the item's row locked, blocks double
  submits.
- Vocabulary opens once all its kanji are learned. The server (`POST /learn` →
  409) and `KA.isAvailable` must agree.
- A catalog change can rename or drop `k:`/`v:` ids, which orphans the owner's
  progress for those items. If it can't be avoided, move the rows in
  `srs_progress` and `srs_log` (backup first; the `academy-data` skill has the
  steps) and tell the owner.
- `store.php` saves each answer in one transaction: the item, the day's count
  and the `srs_log` line. The log is only ever added to. The day's backup
  (`src/backup.php`) runs when the server starts or at the first page load of
  a new day (`server_route()`), never on an answer; nothing slow goes on the
  answer path. The item records keep the shape of `srs_blank()`, which the
  browser, the export and the backups share.
- `answer.js`: every catalog item must accept its own printed answers (a unit
  test checks this). A typo that spells another item's meaning stays wrong. Any
  change here needs the `academy-japanese-reviewer` agent.
- The browser saves answers in the background, and the summary waits for
  pending saves. Keep it that way; the next card must never wait for the
  server.
- Run `npm test`. If the UI changed, also run `npm run test:browser` and the
  `academy-ui-check` skill (or the `academy-ui-tester` agent).
