// The SRS engine against WaniKani's rules.
const test = require('node:test');
const assert = require('node:assert/strict');
const srs = require('../../src/srs/srs');

const H = srs.HOUR;
const NOW = new Date(2026, 8, 23, 10, 37, 12).getTime(); // 10:37:12 local
const at = (stage) => ({ ...srs.blank(), stage, learnedAt: NOW, nextReview: NOW });

test('learning puts an item at Apprentice I, first review on the hour 4 h out', () => {
  const s = srs.learn(null, NOW);
  assert.equal(s.stage, 1);
  const d = new Date(s.nextReview);
  assert.equal(d.getHours(), 14);
  assert.equal(d.getMinutes(), 0);
});

test('clean reviews climb 1 → 9 with the WaniKani intervals', () => {
  let s = srs.learn(null, NOW);
  const hours = [];
  for (let i = 1; i <= 8; i++) {
    const t = s.nextReview;
    const r = srs.review(s, {}, t);
    if (r.state.nextReview) hours.push(Math.round((r.state.nextReview - t) / H));
    s = r.state;
  }
  assert.equal(s.stage, 9);
  assert.equal(s.nextReview, null, 'burned items are never scheduled');
  assert.ok(s.burnedAt);
  const nominal = [8, 23, 47, 167, 335, 719, 2879];
  hours.forEach((h, i) => assert.ok(Math.abs(h - nominal[i]) <= 1, `interval ${i}: ${h}h vs ${nominal[i]}h`));
});

test('penalty: ceil(misses / 2), doubled from Guru, never below Apprentice I', () => {
  const cases = [
    [4, { meaningWrong: 1 }, 3],
    [4, { meaningWrong: 1, readingWrong: 1 }, 3],
    [4, { meaningWrong: 3 }, 2],
    [2, { readingWrong: 5 }, 1],
    [5, { meaningWrong: 1 }, 3],
    [7, { meaningWrong: 1 }, 5],
    [8, { meaningWrong: 2, readingWrong: 2 }, 4],
    [6, {}, 7],
  ];
  for (const [from, wrong, to] of cases) {
    assert.equal(srs.review(at(from), wrong, NOW).to, to, `${from} ${JSON.stringify(wrong)}`);
  }
});

test('review statistics and streaks', () => {
  const s = srs.review(at(3), { meaningWrong: 2 }, NOW).state;
  assert.deepEqual(s.reviews.meaning, { correct: 1, incorrect: 2 });
  assert.deepEqual(s.reviews.reading, { correct: 1, incorrect: 0 });
  assert.equal(s.streak.meaning, 0);
  assert.equal(s.streak.reading, 1);
});

test('practice never touches the schedule', () => {
  const before = { ...at(5), nextReview: NOW + 100 * H };
  const p = srs.practice(before, { firstTryCorrect: false, wrong: 3 }, NOW);
  assert.equal(p.stage, 5);
  assert.equal(p.nextReview, before.nextReview);
  assert.equal(p.practice.incorrect, 1);
  assert.equal(p.lastWrongAt, NOW);
});

test('isDue', () => {
  assert.ok(srs.isDue(at(4), NOW));
  assert.ok(!srs.isDue({ ...at(4), nextReview: NOW + H }, NOW));
  assert.ok(!srs.isDue(at(9), NOW), 'burned is never due');
  assert.ok(!srs.isDue(at(0), NOW), 'unlearned is never due');
});
