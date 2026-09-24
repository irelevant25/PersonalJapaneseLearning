// The exam API end to end, in-process, with results and reports in temp folders.
const { isolate, startApp, call } = require('../helpers');
isolate('academy-exam-api'); // before any app module loads

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildExam } = require('../../src/generate');

let app;
test.before(async () => {
  app = await startApp();
});
test.after(() => app.close());

const post = (u, b) => call(app.base, 'POST', u, b);

test('meta', async () => {
  const { body } = await call(app.base, 'GET', '/api/meta');
  assert.equal(body.books.length, 2);
  assert.equal(body.lessons.length, 24);
  assert.equal(body.attempts, 0, 'isolated: none of your real attempts');
});

test('a paper never carries its answers', async () => {
  const { body } = await post('/api/exam', { size: 120, books: [1, 2], seed: 'leak' });
  const keys = new Set();
  const walk = (o) => {
    if (Array.isArray(o)) return o.forEach(walk);
    if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) (keys.add(k), walk(v));
  };
  walk(body);
  for (const k of ['answerIndex', 'correct', 'distractors', 'explain']) assert.ok(!keys.has(k), k);
});

test('scoring: perfect, zero, and the 70% boundary', async () => {
  const { body: ex } = await post('/api/exam', { size: 200, books: [1, 2], seed: 'score' });
  const key = buildExam(ex.spec); // the server rebuilds exactly this
  assert.deepEqual(key.questions.map((q) => q.id), ex.questions.map((q) => q.id));

  const answer = (pick) => Object.fromEntries(key.questions.map((q, i) => [q.id, { choice: pick(q, i), ms: 500 }]));
  let r = await post('/api/submit', { spec: ex.spec, responses: answer((q) => q.answerIndex) });
  assert.equal(r.body.summary.pct, 100);
  assert.equal(r.body.summary.grade, 'A');
  assert.equal(r.body.byBook.length, 2);

  r = await post('/api/submit', { spec: ex.spec, responses: answer((q) => (q.answerIndex + 1) % q.options.length) });
  assert.equal(r.body.summary.pct, 0);
  assert.equal(r.body.summary.passed, false);

  const n = key.questions.length;
  const need = Math.ceil(n * 0.7);
  r = await post('/api/submit', {
    spec: ex.spec,
    responses: answer((q, i) => (i < need ? q.answerIndex : (q.answerIndex + 1) % q.options.length)),
  });
  assert.ok(r.body.summary.passed && r.body.summary.pct >= 70);
});

test('answers for another paper are refused, not mis-scored', async () => {
  const { body: ex } = await post('/api/exam', { size: 40, seed: 'mine' });
  const responses = Object.fromEntries(ex.questions.map((q) => [q.id, { choice: 0 }]));
  const r = await post('/api/submit', { spec: { ...ex.spec, seed: 'someone-else' }, responses });
  assert.equal(r.status, 409);
});

test('report and history', async () => {
  const { body: ex } = await post('/api/exam', { size: 40, seed: 'report' });
  const { body: sub } = await post('/api/submit', { spec: ex.spec, responses: {} });
  const rep = await fetch(app.base + sub.reportUrl);
  const html = await rep.text();
  assert.equal(rep.status, 200);
  assert.match(html, /By skill/);
  assert.doesNotMatch(html, /undefined|\[object Object\]/);
  const { body: hist } = await call(app.base, 'GET', '/api/attempts');
  assert.ok(hist.length >= 4);
});

test('clips stream from data/audio, and nothing else does', async () => {
  const { body: ex } = await post('/api/exam', { size: 40, sections: ['listening-word'], seed: 'audio' });
  const clip = ex.questions.find((q) => q.audio).audio;
  const r = await fetch(`${app.base}/audio/${clip}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal((await fetch(`${app.base}/audio/nope.mp3`)).status, 404);
  assert.equal((await fetch(`${app.base}/audio/0123456789abcdef.mp3`)).status, 404, 'a well-formed name with no file');
  assert.equal((await fetch(`${app.base}/audio/..%2Fvocab.json`)).status, 404, 'no way out of data/audio');
});
