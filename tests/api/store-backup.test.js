// The kanji store at start-up: today's backup is a complete copy, made aside and renamed.
const { isolate } = require('../helpers');
const DIR = isolate('academy-store-backup'); // before any app module loads

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const progress = path.join(DIR, 'progress');
const saved = { version: 1, settings: { batchSize: 3 }, items: { 'k:大': { stage: 4 } }, daily: {} };
fs.writeFileSync(path.join(progress, 'kanji.json'), JSON.stringify(saved));
const store = require('../../src/srs/store.js');

test('start-up: loads the progress and backs it up once, completely', () => {
  const s = store.load();
  assert.equal(s.items['k:大'].stage, 4);
  assert.equal(s.settings.batchSize, 3);
  const backups = fs.readdirSync(path.join(progress, 'backups'));
  assert.deepEqual(backups, [`kanji-${store.localDate()}.json`], 'one finished backup, no .tmp left');
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(progress, 'backups', backups[0]), 'utf8')), saved);
  store.save();
  assert.deepEqual(fs.readdirSync(path.join(progress, 'backups')), backups, 'saving the same day adds nothing');
});
