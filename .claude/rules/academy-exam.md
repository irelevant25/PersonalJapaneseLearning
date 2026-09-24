---
paths:
  - "server.js"
  - "src/generate.js"
  - "src/conjugate.js"
  - "src/score.js"
  - "src/report.js"
  - "public/exam.*"
  - "data/authored-items*.js"
---

# Exam (Japanese Academy)

Reference: `docs/kb/exam.md`.

- The browser never receives answers. `POST /api/exam` sends questions and
  options only. `answerIndex`, `correct`, `distractors` and `explain` stay on
  the server; an API test walks every key of the response.
- `POST /api/submit` rebuilds the paper from the echoed `spec`. Answers whose
  ids aren't in the rebuilt paper → 409, and nothing is saved.
- Papers are seeded: the same spec gives the same paper. If the question bank
  or the order of RNG calls changes, a paper started before a server restart
  can't be submitted afterwards. Mention this when you restart during the
  owner's study time.
- Every question has one right answer and 1–3 distinct distractors, and each
  distractor is wrong for the question as asked. Generated distractors are
  plausible mistakes: the wrong verb class, a compound read with its kanji's
  other readings, い/な rules crossed.
- `conjugate.js` is checked cell by cell against both Conjugation Charts.
  Keigo verbs get no Part 2 forms. The five 〜さる verbs take います
  (くださいます), and the regularised くださります is the distractor.
- Forms are filed under the later of the verb's lesson and the lesson that
  teaches the form: potential L13, volitional L15, ば L18, passive L21,
  causative L22, causative-passive L23.
- `results/*.json` and `reports/*.html` are the owner's. If you change the
  result format, the existing files must still load in the history and the
  reports. Never migrate or rewrite them.
- When the bank size changes, update the count in `README.md` and in
  `docs/kb/` (exam.md, architecture.md).
- `exam.js` builds HTML with template strings, so any data it interpolates goes
  through `escapeHtml()`.
- Changes to generation, conjugation or authored items need the
  `academy-japanese-reviewer` agent. Write authored items with the
  `academy-exam-items` skill.
