// /api/kanji end to end, in-process, with the clock moved by editing the store.
const { isolate, startApp, call } = require('../helpers');
const DIR = isolate('academy-kanji-api'); // before any app module loads

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

let app;
test.before(async () => {
  app = await startApp();
});
test.after(() => app.close());

const api = (m, u, b) => call(app.base, m, '/api/kanji' + u, b);
const makeDue = (id) => {
  app.store.load().items[id].nextReview = Date.now() - 1000;
};

test('fresh start', async () => {
  const { body: cat } = await api('GET', '/catalog');
  const { body: p } = await api('GET', '/progress');
  assert.equal(p.summary.learned, 0);
  assert.equal(p.summary.reviewsDue, 0);
  assert.equal(p.summary.lessonsAvailable, cat.items.filter((i) => i.type === 'kanji').length);
  assert.equal(p.settings.batchSize, 5);
});

test('lessons: vocabulary waits for its kanji; nothing is learned twice', async () => {
  assert.equal((await api('POST', '/learn', { id: 'v:大学' })).status, 409);
  for (const id of ['k:大', 'k:学']) {
    const r = await api('POST', '/learn', { id });
    assert.equal(r.status, 200);
    assert.equal(r.body.state.stage, 1);
  }
  assert.equal((await api('POST', '/learn', { id: 'v:大学' })).status, 200);
  assert.equal((await api('POST', '/learn', { id: 'k:大' })).status, 409);
  assert.equal((await api('POST', '/learn', { id: 'k:nope' })).status, 404);
  const { body: p } = await api('GET', '/progress');
  assert.equal(p.summary.learned, 3);
  assert.equal(p.summary.today.lessons, 3);
  assert.equal(p.summary.forecastHours.reduce((a, b) => a + b, 0), 3);
});

test('reviews: only when due, once, and the stage moves', async () => {
  assert.equal((await api('POST', '/review', { id: 'k:大' })).status, 409, 'not due yet');
  ['k:大', 'k:学', 'v:大学'].forEach(makeDue);
  assert.equal((await api('GET', '/progress')).body.summary.reviewsDue, 3);

  let r = await api('POST', '/review', { id: 'k:大', meaningWrong: 0, readingWrong: 0 });
  assert.deepEqual([r.body.from, r.body.to], [1, 2]);
  assert.equal((await api('POST', '/review', { id: 'k:大' })).status, 409, 'double submit refused');

  r = await api('POST', '/review', { id: 'k:学', meaningWrong: 1, readingWrong: 1 });
  assert.equal(r.body.to, 1, 'floor at Apprentice I');
  for (let i = 0; i < 4; i++) {
    makeDue('k:学');
    r = await api('POST', '/review', { id: 'k:学' });
  }
  assert.equal(r.body.to, 5, 'Guru I');
  makeDue('k:学');
  r = await api('POST', '/review', { id: 'k:学', readingWrong: 1 });
  assert.equal(r.body.to, 3, 'Guru with a miss drops two stages');
});

test('practice: recorded, but never touches the schedule', async () => {
  const before = JSON.parse(JSON.stringify(app.store.load().items['v:大学']));
  let r = await api('POST', '/practice', { id: 'v:大学', firstTryCorrect: false, wrong: 2 });
  assert.equal(r.body.state.practice.incorrect, 1);
  for (let i = 0; i < 25; i++) await api('POST', '/practice', { id: 'v:大学', firstTryCorrect: true });
  const after = app.store.load().items['v:大学'];
  assert.equal(after.stage, before.stage);
  assert.equal(after.nextReview, before.nextReview);
  assert.equal(after.practice.correct, 25);
  assert.equal((await api('POST', '/practice', { id: 'k:食' })).status, 409, 'unlearned');
});

test('notes, synonyms and extra readings', async () => {
  let r = await api('POST', '/item', { id: 'k:大', notes: { meaning: 'arms spread wide — BIG' } });
  assert.match(r.body.state.notes.meaning, /BIG/);
  await api('POST', '/item', { id: 'k:大', addSynonym: 'large' });
  r = await api('POST', '/item', { id: 'k:大', addSynonym: 'large' });
  assert.deepEqual(r.body.state.synonyms, ['large'], 'no duplicates');
  r = await api('POST', '/item', { id: 'k:大', removeSynonym: 'large' });
  assert.deepEqual(r.body.state.synonyms, []);
  r = await api('POST', '/item', { id: 'k:大', addReading: 'だ' });
  assert.deepEqual(r.body.state.extraReadings, ['だ']);
  r = await api('POST', '/item', { id: 'k:食', notes: { reading: 'before learning' } });
  assert.equal(r.body.state.stage, 0, 'a note alone is not learning');
  assert.equal((await api('GET', '/progress')).body.summary.learned, 3);
});

test('settings are validated', async () => {
  let r = await api('POST', '/settings', { batchSize: 10, lessonTypes: 'kanji' });
  assert.equal(r.body.settings.batchSize, 10);
  r = await api('POST', '/settings', { batchSize: 999, lessonTypes: 'bogus' });
  assert.equal(r.body.settings.batchSize, 20);
  assert.equal(r.body.settings.lessonTypes, 'kanji');
});

test('persistence: atomic file, append-only log, no temp left behind', () => {
  const file = path.join(DIR, 'progress', 'kanji.json');
  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(disk.items['k:大'].stage, 2);
  assert.ok(!fs.existsSync(file + '.tmp'));
  const log = fs.readFileSync(path.join(DIR, 'progress', 'kanji-log.jsonl'), 'utf8').trim().split('\n');
  assert.ok(log.length > 30, `${log.length} events`);
  // Backups are taken at start-up, never while answering; this store started
  // with no file, so there was nothing to back up today.
  assert.ok(!fs.existsSync(path.join(DIR, 'progress', 'backups')), 'no backup taken during answers');
});

test('reset: one item keeps its notes; everything needs confirmation and is backed up', async () => {
  let r = await api('POST', '/reset-item', { id: 'k:大' });
  assert.equal(r.body.state.stage, 0);
  assert.match(r.body.state.notes.meaning, /BIG/);
  assert.equal((await api('POST', '/reset', {})).status, 400);
  await api('POST', '/reset', { confirm: 'RESET' });
  const { body: p } = await api('GET', '/progress');
  assert.equal(p.summary.learned, 0);
  assert.equal(p.settings.batchSize, 20, 'settings survive a reset');
  const backups = fs.readdirSync(path.join(DIR, 'progress', 'backups'));
  assert.ok(backups.some((f) => f.startsWith('kanji-before-reset')), backups.join(', '));
});

test('past midnight: the first save backs the new day up in the background', async () => {
  const realNow = Date.now;
  const tomorrow = realNow() + 24 * 3600 * 1000;
  const file = path.join(DIR, 'progress', 'backups', `kanji-${app.store.localDate(tomorrow)}.json`);
  Date.now = () => tomorrow; // the server runs in this process, so this moves its clock
  let r;
  try {
    r = await api('POST', '/settings', { batchSize: 7 });
  } finally {
    Date.now = realNow;
  }
  assert.equal(r.status, 200);
  for (let i = 0; i < 100 && !fs.existsSync(file); i++) await new Promise((res) => setTimeout(res, 20));
  assert.ok(fs.existsSync(file), 'backup written');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).settings.batchSize, 7, 'written from the saved state');
});

test('isolate() refuses to run once the app has picked its data folders', () => {
  assert.throws(() => isolate('academy-too-late'), /too late/);
});
