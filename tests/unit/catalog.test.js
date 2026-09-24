// Invariants of the data the app is built from. If a data edit breaks one of
// these, fix the data (or consciously update the expected figure here).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { getCatalog } = require('../../src/srs/catalog');

const ROOT = path.join(__dirname, '..', '..');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

test('kanji data: all 317 kanji of the course, numbered 1–317 without gaps', () => {
  const kanji = readJson('kanji.json');
  assert.equal(kanji.length, 317);
  const nos = kanji.map((k) => k.no).sort((a, b) => a - b);
  nos.forEach((n, i) => assert.equal(n, i + 1));
  const perLesson = {};
  for (const k of kanji) perLesson[k.lesson] = (perLesson[k.lesson] || 0) + 1;
  // per-lesson totals as printed on the Kanji List pages
  assert.deepEqual(perLesson, {
    3: 15, 4: 14, 5: 14, 6: 15, 7: 14, 8: 14, 9: 15, 10: 14, 11: 16, 12: 14,
    13: 16, 14: 16, 15: 16, 16: 16, 17: 15, 18: 16, 19: 16, 20: 15, 21: 15, 22: 16, 23: 15,
  });
});

test('vocabulary data covers greetings and lessons 1–23', () => {
  const vocab = readJson('vocab.json');
  assert.ok(vocab.length >= 1700, `${vocab.length} entries`);
  const lessons = new Set(vocab.map((v) => v.lesson));
  for (let L = 0; L <= 23; L++) assert.ok(lessons.has(L), `lesson ${L}`);
});

test('SRS catalog: ids unique, kanji first in course order, vocab only uses the course kanji', () => {
  const cat = getCatalog();
  const ids = cat.items.map((i) => i.id);
  assert.equal(new Set(ids).size, ids.length, 'unique ids');
  const K = cat.items.filter((i) => i.type === 'kanji');
  const V = cat.items.filter((i) => i.type === 'vocab');
  assert.equal(K.length, 316, 'every kanji but 々');
  assert.ok(V.length > 1000, `${V.length} vocabulary items`);
  assert.deepEqual(cat.lessons, Array.from({ length: 21 }, (_, i) => i + 3));

  const kanjiSet = new Set(K.map((k) => k.chars));
  for (const v of V) {
    assert.ok(v.kanji.length, `${v.id} has kanji`);
    for (const c of v.kanji) assert.ok(kanjiSet.has(c), `${v.id}: ${c} is a course kanji`);
    const latest = Math.max(...v.kanji.map((c) => cat.byId.get(`k:${c}`).lesson));
    assert.equal(v.lesson, latest, `${v.id} sits in the lesson of its latest kanji`);
  }
  // order: within a lesson, kanji before vocabulary
  cat.items.forEach((it, i) => assert.equal(it.order, i));
  for (let i = 1; i < cat.items.length; i++) {
    const a = cat.items[i - 1];
    const b = cat.items[i];
    assert.ok(a.lesson < b.lesson || (a.lesson === b.lesson && !(a.type === 'vocab' && b.type === 'kanji')), `${a.id} before ${b.id}`);
  }
  for (const k of K) for (const ex of k.examples) assert.ok(cat.byId.has(ex), `${k.id} example ${ex}`);
});

test('audio: every vocabulary item has a clip in each voice, and every clip exists', () => {
  const index = readJson('audio.json');
  assert.equal(index.voices.length, 2, 'two voices: run npm run build:audio');
  const silent = getCatalog().items.filter((i) => i.type === 'vocab' && (i.audio || []).length !== 2);
  assert.deepEqual(silent.map((i) => i.id), []);
  const clips = Object.values(index.clips).flatMap((c) => Object.values(c));
  const missing = clips.filter((f) => !fs.existsSync(path.join(ROOT, 'data', 'audio', f)));
  assert.deepEqual(missing, []);
});
