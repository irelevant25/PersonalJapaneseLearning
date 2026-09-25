---
paths:
  - "server.php"
  - "src/generate.php"
  - "src/conjugate.php"
  - "src/score.php"
  - "src/report.php"
  - "src/exam.php"
  - "src/util.php"
  - "public/exam.*"
  - "data/authored-items*.php"
---

# Exam (Japanese Academy)

Reference: `docs/kb/exam.md`.

- The browser never receives answers. `POST /api/exam` sends questions and
  options only (`exam_start()` in `src/exam.php`). `answerIndex`, `correct`,
  `distractors` and `explain` stay on the server; an API test walks every key
  of the response.
- `POST /api/submit` rebuilds the paper from the echoed `spec`. Answers whose
  ids aren't in the rebuilt paper → 409, and nothing is saved.
- Papers are seeded: the same spec gives the same paper. The RNG and the
  JavaScript-compatible helpers in `src/util.php` (`js_round`, `js_to_fixed`,
  `utf16_units`, `imul` …) must keep giving the first version's results;
  `tests/unit/exam-bank.test.php` pins them. If the question bank or the order
  of RNG calls changes, a paper started before a server restart can't be
  submitted afterwards. Mention this when you restart during the owner's study
  time.
- Every question has one right answer and 1–3 distinct distractors, and each
  distractor is wrong for the question as asked. Generated distractors are
  plausible mistakes: the wrong verb class, a compound read with its kanji's
  other readings, い/な rules crossed.
- `conjugate.php` is checked cell by cell against both Conjugation Charts.
  Keigo verbs get no Part 2 forms. The five 〜さる verbs take います
  (くださいます), and the regularised くださります is the distractor.
- Forms are filed under the later of the verb's lesson and the lesson that
  teaches the form: potential L13, volitional L15, ば L18, passive L21,
  causative L22, causative-passive L23.
- The rows of `exam_attempts` are the owner's (some were imported from
  `results/` and `reports/`). If you change the attempt record, the stored ones
  must still load in the history and the reports. Never migrate or rewrite
  them.
- The bank is built into the database when the server starts
  (`src/content.php`). When its size changes, update the count in `README.md`,
  `CLAUDE.md` and in `docs/kb/` (exam.md, architecture.md).
- `exam.js` builds HTML with template strings, so any data it interpolates goes
  through `escapeHtml()`. `src/report.php` escapes with `report_esc()`.
- Changes to generation, conjugation or authored items need the
  `academy-japanese-reviewer` agent. Write authored items with the
  `academy-exam-items` skill.
