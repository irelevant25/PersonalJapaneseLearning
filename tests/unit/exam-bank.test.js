// The exam question bank and paper assembly.
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBank, buildExam, bankStats, SECTIONS } = require('../../src/generate');

test('bank: size, both parts, every section populated', () => {
  const s = bankStats();
  assert.ok(s.total > 11000, `${s.total} questions`);
  assert.ok(s.byBook[1] > 5000 && s.byBook[2] > 5000);
  for (const sec of SECTIONS) assert.ok(s.bySection[sec.id] > 0, sec.id);
});

test('bank: every question has one right answer among distinct options', () => {
  for (const q of buildBank()) {
    const opts = [q.correct, ...q.distractors];
    assert.equal(new Set(opts).size, opts.length, `${q.id} ${q.question}: duplicate options`);
    assert.ok(opts.every((o) => String(o).trim()), `${q.id}: empty option`);
    assert.ok(q.distractors.length >= 1 && q.distractors.length <= 3, q.id);
  }
});

test('paper: a seed reproduces the identical paper', () => {
  const spec = { size: 120, books: [1, 2], seed: 'repro' };
  const a = buildExam(spec);
  const b = buildExam(spec);
  assert.deepEqual(a.questions, b.questions);
});

test('paper: book and lesson scope are honoured', () => {
  const p1 = buildExam({ size: 150, books: [1], seed: 'p1' });
  assert.ok(p1.questions.every((q) => q.lesson <= 12));
  const p2 = buildExam({ size: 150, books: [2], seed: 'p2' });
  assert.ok(p2.questions.every((q) => q.lesson >= 13));
  const l5 = buildExam({ size: 40, lessons: [5, 6], seed: 'l56' });
  assert.ok(l5.questions.every((q) => q.lesson === 5 || q.lesson === 6));
});

test('paper: the answer index points at the correct option', () => {
  const bank = new Map(buildBank().map((q) => [q.id, q]));
  for (const q of buildExam({ size: 250, seed: 'idx' }).questions) {
    assert.equal(q.options[q.answerIndex], bank.get(q.id).correct, q.id);
  }
});
