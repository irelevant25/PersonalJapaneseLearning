/**
 * Kanji progress, kept in progress/kanji.json.
 *
 * Losing weeks of SRS history to a half-written file would be the worst thing
 * this app could do, so:
 *   - every save goes to a temp file first and is then renamed over the real one
 *     (retried briefly: on Windows a virus scanner can hold a fresh file for a
 *     moment)
 *   - a copy is kept in progress/backups/ once a day (the last 14 kept) — taken
 *     when the server starts, and if it is still running past midnight, written
 *     in the background by the new day's first save. Never a copy on the
 *     answer path: Windows once held one for 5 s and froze the quiz.
 *   - each answer is also appended to progress/kanji-log.jsonl, an append-only
 *     history that is never rewritten
 */
const fs = require('fs');
const path = require('path');

const DIR = process.env.ACADEMY_PROGRESS_DIR || path.join(__dirname, '..', '..', 'progress');
const FILE = path.join(DIR, 'kanji.json');
const LOG = path.join(DIR, 'kanji-log.jsonl');
const BACKUPS = path.join(DIR, 'backups');
const KEEP_BACKUPS = 14;

const DEFAULT_SETTINGS = {
  batchSize: 5,        // lessons per batch
  lessonTypes: 'both', // 'both' | 'kanji' | 'vocab'
  autoplay: true,      // play vocabulary audio after the reading is answered
};

function localDate(t = Date.now()) {
  const d = new Date(t);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function empty() {
  return {
    version: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    settings: { ...DEFAULT_SETTINGS },
    items: {},
    daily: {},
  };
}

let STATE = null;
let lastBackupDay = null;

function load() {
  if (STATE) return STATE;
  fs.mkdirSync(DIR, { recursive: true });
  if (fs.existsSync(FILE)) {
    try {
      STATE = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      STATE.settings = { ...DEFAULT_SETTINGS, ...(STATE.settings || {}) };
      STATE.items = STATE.items || {};
      STATE.daily = STATE.daily || {};
    } catch (err) {
      // Never silently start over on a file we could not read: keep it aside.
      const aside = `${FILE}.unreadable-${Date.now()}`;
      fs.renameSync(FILE, aside);
      console.error(`kanji progress was unreadable; moved to ${aside}`);
      STATE = empty();
    }
  } else {
    STATE = empty();
  }
  // Take today's backup now, at start-up, rather than in the middle of an answer.
  try {
    backupOncePerDay();
  } catch (err) {
    console.error(`kanji backup skipped: ${err.message}`);
  }
  return STATE;
}

/** Sleep without an event loop turn: 25–200 ms per retry, 0.9 s at the very worst. */
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function renameWithRetry(from, to) {
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      if (!/EPERM|EBUSY|EACCES/.test(err.code) || i >= 8) {
        // Last resort: copy over the target rather than lose the save. Not
        // atomic, but it keeps answers saving while Windows holds the temp
        // file; an unreadable file is set aside at load, never overwritten.
        fs.copyFileSync(from, to);
        fs.unlinkSync(from);
        return;
      }
      pause(25 * (i + 1));
    }
  }
}

const isDailyBackup = (f) => /^kanji-\d{4}-\d{2}-\d{2}\.json$/.test(f);

/** At start-up: today's copy of the file on disk, if there is one yet. */
function backupOncePerDay() {
  lastBackupDay = localDate(); // a fresh start has nothing to back up today
  if (!fs.existsSync(FILE)) return;
  fs.mkdirSync(BACKUPS, { recursive: true });
  const target = path.join(BACKUPS, `kanji-${lastBackupDay}.json`);
  if (fs.existsSync(target)) return;
  fs.copyFileSync(FILE, `${target}.tmp`); // copied aside first: a cut-off copy never counts as today's
  renameWithRetry(`${target}.tmp`, target);
  const old = fs.readdirSync(BACKUPS).filter(isDailyBackup).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
    fs.unlinkSync(path.join(BACKUPS, f));
  }
}

/** Past midnight: the new day's copy, written from memory without blocking. */
async function backupInBackground(json, day) {
  const target = path.join(BACKUPS, `kanji-${day}.json`);
  await fs.promises.mkdir(BACKUPS, { recursive: true });
  try {
    await fs.promises.writeFile(`${target}.tmp`, json);
    await fs.promises.rename(`${target}.tmp`, target);
  } catch (err) {
    await fs.promises.rm(`${target}.tmp`, { force: true }).catch(() => {});
    throw err;
  }
  const old = (await fs.promises.readdir(BACKUPS)).filter(isDailyBackup).sort();
  for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) {
    await fs.promises.unlink(path.join(BACKUPS, f));
  }
}

function save() {
  const s = load();
  s.updatedAt = Date.now();
  const json = JSON.stringify(s);
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, json);
  renameWithRetry(tmp, FILE);
  const today = localDate();
  if (lastBackupDay !== today) {
    lastBackupDay = today;
    backupInBackground(json, today).catch((err) => console.error(`kanji backup skipped: ${err.message}`));
  }
}

function log(event) {
  fs.mkdirSync(DIR, { recursive: true });
  fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), ...event }) + '\n');
}

/** Today's counters: lessons, reviews, practice — for the dashboard. */
function bumpDaily(kind, correct, t = Date.now()) {
  const s = load();
  const key = localDate(t);
  const d = (s.daily[key] = s.daily[key] || {
    lessons: 0,
    reviews: 0,
    reviewsCorrect: 0,
    practice: 0,
    practiceCorrect: 0,
  });
  if (kind === 'lesson') d.lessons += 1;
  if (kind === 'review') {
    d.reviews += 1;
    if (correct) d.reviewsCorrect += 1;
  }
  if (kind === 'practice') {
    d.practice += 1;
    if (correct) d.practiceCorrect += 1;
  }
}

function reset() {
  const s = load();
  if (fs.existsSync(FILE)) {
    fs.mkdirSync(BACKUPS, { recursive: true });
    fs.copyFileSync(FILE, path.join(BACKUPS, `kanji-before-reset-${Date.now()}.json`));
  }
  const fresh = empty();
  fresh.settings = s.settings;
  STATE = fresh;
  save();
  log({ kind: 'reset' });
}

module.exports = { load, save, log, bumpDaily, reset, localDate, FILE, DIR, DEFAULT_SETTINGS };
