# Exam

Multiple choice only (the user's choice). Code: `src/generate.js`,
`src/conjugate.js`, `src/score.js`, `src/report.js`, `public/exam.js`.

## The bank — 11,523 questions, generated on start-up

| Section | Part 1 | Part 2 | Built from |
|---|---:|---:|---|
| `listening-word` / `listening-meaning` | 729 / 729 | 662 / 662 | `vocab.json` words and their clips (`src/speech.js`); one of the two voices per question, fixed when the bank is built; distractors chosen by kana similarity (じぶん vs ずいぶん); a word that sounds the same (はし) or shares a meaning (さけ / おさけ) is never a distractor |
| `vocab-jp-en` / `vocab-en-jp` | 761 / 710 | 713 / 680 | `vocab.json`; same-lesson, same part-of-speech distractors, never one that shares a sense with the answer (`sameMeaning`); a gloss shared by two words is never asked EN→JP |
| `kanji-reading` | 460 | 500 | kanji-list compounds; distractors re-read the compound with its kanji's *other* readings; compounds with a kanji outside the course's list skipped |
| `kanji-meaning` | 145 | 172 | `kanji.json` |
| `kanji-writing` | 524 | 672 | compound with one kanji swapped |
| `verb-conjugation` | 462 | 1,461 | `conjugate.js`; a form is filed under the later of the verb's lesson and the lesson that teaches the form (potential L13, volitional L15, ば L18, passive L21, causative L22, causative-passive L23) |
| `verb-class` | 113 | 162 | u / ru / irregular (three options) |
| `adjective` | 372 | 234 | い/な rules crossed over for distractors |
| `kana` | 260 | — | hiragana/katakana tables |
| `particle`, `grammar`, `counter`, `translation` | 50, 69, 26, 30 | 40, 83, 14, 28 | hand-written: `data/authored-items-part1.js`, `data/authored-items-part2.js` |

The listening sections exist only when the audio has been made
(`npm run build:audio`); without it the bank is 2,782 questions smaller.

Keigo verbs (honorific/humble/extra-modest) are excluded from the Part 2 forms
(no causative-passive of いらっしゃる); the five 〜さる verbs take います
(くださいます) with the regularised form (くださります) offered as a distractor.

## Papers

`buildExam({size, books, lessons, sections, seed})`: each section gets
`size × weight / Σweights` questions (weights in `SECTIONS`), spread round-robin
across the lessons in scope, options shuffled by the seeded RNG. Same spec →
identical paper. (`books` means the parts: 1 = Part 1, 2 = Part 2.)

## The two rules that keep scoring honest

1. **The browser never receives answers.** `/api/exam` sends questions and
   options only. `answerIndex`, `correct`, `distractors`, `explain` must never
   appear in that response (a test walks every key). A listening question sends
   the name of its clip, which is random and says nothing about the word.
2. **Submit rebuilds the paper from the echoed `spec`** — the exact arguments
   the paper was built from. Never rebuild from the resulting question count:
   a 250-question request yields ~252 questions, and rebuilding with 252 makes a
   *different* paper (this bug happened). Answers whose ids aren't in the rebuilt
   paper → 409, nothing saved.

## Scoring and reports

Pass mark 70 %; grades A ≥90, B ≥80, C ≥70, D ≥60, F. Sections/lessons under
60 % are flagged as weaknesses. Unanswered = wrong. Each attempt is saved to
`results/<id>.json` with every answer and its timing; `reports/<id>.html` is
standalone (inline CSS, no scripts) with breakdowns by part (when both), skill
and lesson, every missed question with explanation, and attempt history.

## Adding hand-written questions

Use the `academy-exam-items` skill. One helper call per item — `P()` particle,
`G()` grammar, `C()` counter, `T()` translation:
`G(lesson, question, correct, [3 distractors], explanation, ref)`.
Every distractor must be *wrong* for the question as asked; have the
`academy-japanese-reviewer` agent check new items.
