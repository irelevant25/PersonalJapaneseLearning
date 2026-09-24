/**
 * Scoring and analysis of a completed attempt.
 *
 * The course runs over 23 lessons, so the report breaks the result down by
 * lesson as well as by skill section — that is what tells you *what to revise*,
 * which a single percentage cannot.
 */
const { SECTIONS } = require('./generate');

const PASS_MARK = 70; // overall % required to pass
const SECTION_FLOOR = 60; // % below which a section is flagged as a weakness

function scoreAttempt(exam, responses) {
  // responses: { [questionId]: { choice: number|null, ms: number } }
  const rows = exam.questions.map((q) => {
    const r = responses[q.id] || {};
    const choice = typeof r.choice === 'number' ? r.choice : null;
    const correct = choice !== null && choice === q.answerIndex;
    return {
      n: q.n,
      id: q.id,
      section: q.section,
      sectionName: q.sectionName,
      lesson: q.lesson,
      book: q.book,
      question: q.question,
      hint: q.hint || null,
      audio: q.audio || null,
      options: q.options,
      answerIndex: q.answerIndex,
      correctAnswer: q.options[q.answerIndex],
      chosenIndex: choice,
      chosenAnswer: choice === null ? null : q.options[choice],
      correct,
      answered: choice !== null,
      ms: Number(r.ms) || 0,
      explain: q.explain,
      ref: q.ref,
    };
  });

  const total = rows.length;
  const right = rows.filter((r) => r.correct).length;
  const answered = rows.filter((r) => r.answered).length;
  const pct = total ? (right / total) * 100 : 0;

  const group = (keyFn, nameFn) => {
    const m = new Map();
    for (const r of rows) {
      const k = keyFn(r);
      if (!m.has(k)) m.set(k, { key: k, name: nameFn(r), total: 0, right: 0, ms: 0 });
      const g = m.get(k);
      g.total++;
      if (r.correct) g.right++;
      g.ms += r.ms;
    }
    return [...m.values()].map((g) => ({
      ...g,
      pct: g.total ? (g.right / g.total) * 100 : 0,
    }));
  };

  const sectionOrder = new Map(SECTIONS.map((s, i) => [s.id, i]));
  const bySection = group(
    (r) => r.section,
    (r) => r.sectionName
  ).sort((a, b) => (sectionOrder.get(a.key) ?? 99) - (sectionOrder.get(b.key) ?? 99));

  const byLesson = group(
    (r) => r.lesson,
    (r) => (r.lesson === 0 ? 'Greetings' : `Lesson ${r.lesson}`)
  ).sort((a, b) => a.key - b.key);

  const byBook = group(
    (r) => r.book,
    (r) => `Part ${r.book}`
  ).sort((a, b) => a.key - b.key);

  const weakSections = bySection
    .filter((s) => s.pct < SECTION_FLOOR)
    .sort((a, b) => a.pct - b.pct);
  const weakLessons = byLesson
    .filter((l) => l.pct < SECTION_FLOOR && l.total >= 3)
    .sort((a, b) => a.pct - b.pct);

  const totalMs = rows.reduce((a, r) => a + r.ms, 0);

  return {
    total,
    answered,
    unanswered: total - answered,
    right,
    wrong: answered - right,
    pct: Math.round(pct * 10) / 10,
    passMark: PASS_MARK,
    passed: pct >= PASS_MARK,
    grade: gradeOf(pct),
    bySection,
    byLesson,
    byBook,
    weakSections,
    weakLessons,
    totalMs,
    avgMs: total ? Math.round(totalMs / total) : 0,
    rows,
  };
}

function gradeOf(pct) {
  if (pct >= 90) return 'A';
  if (pct >= 80) return 'B';
  if (pct >= 70) return 'C';
  if (pct >= 60) return 'D';
  return 'F';
}

module.exports = { scoreAttempt, PASS_MARK, SECTION_FLOOR };
