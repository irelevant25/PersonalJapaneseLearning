/**
 * Makes the vocabulary audio with Google Cloud Text-to-Speech: every word the
 * kanji trainer or the exam can play, in two voices (female and male).
 *
 *   npm run build:audio                make the missing clips, drop unused ones
 *   npm run build:audio -- --dry-run   count what would be sent; needs no key
 *   npm run build:audio -- --limit 20  make at most 20 clips, for a quick try
 *
 * The API key comes from GOOGLE_TTS_API_KEY, or from a .env file in the project
 * root (gitignored; see README). A clip is made once: each records the recipe
 * and voice that made it, and a rebuild only sends the words that have no
 * current clip. The clips go to data/audio/ under random names and are listed
 * in data/audio.json, which src/speech.js reads. Ctrl+C stops cleanly: every
 * clip made so far stays listed.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { spoken, INDEX, CLIPS, CLIP_NAME } = require('./speech');

const ROOT = path.join(__dirname, '..');
const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';

const VOICES = [
  { id: 'f', name: 'ja-JP-Neural2-B', label: 'female' },
  { id: 'm', name: 'ja-JP-Neural2-C', label: 'male' },
];

// Everything else that decides how a clip sounds. Change it, and every clip is
// made again on the next build.
const RECIPE = 'google-tts/v1 mp3 rate=1 kanji+yomigana';

/** Every word that gets audio: the vocabulary list and the trainer's vocabulary. */
function wordsToSpeak() {
  const vocab = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'vocab.json'), 'utf8'));
  const { buildCatalog } = require('./srs/catalog');
  const byKey = new Map();
  const add = (s) => s && !byKey.has(s.key) && byKey.set(s.key, s);
  for (const v of vocab) add(spoken(v.kana, v.kanji));
  for (const it of buildCatalog().items) if (it.type === 'vocab') add(spoken(it.readings[0], it.chars));
  return [...byKey.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

const escapeXml = (s) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** The request for one clip. A kanji word is sent with its reading as yomigana. */
function requestFor(s, voice) {
  const input =
    s.text === s.reading
      ? { text: s.reading }
      : {
          ssml: `<speak><phoneme alphabet="yomigana" ph="${escapeXml(s.reading)}">${escapeXml(
            s.text
          )}</phoneme></speak>`,
        };
  return {
    input,
    voice: { languageCode: 'ja-JP', name: voice.name },
    audioConfig: { audioEncoding: 'MP3', speakingRate: 1 },
  };
}

/** What Google bills for a request: the characters of the text, or of the SSML. */
const billed = (req) => (req.input.text || req.input.ssml).length;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Google counts requests per minute. At most 10 a second stays under the quota
// of a new project; a 429 still waits for the minute to turn.
const GAP_MS = 100;

/** One clip from Google, paced, and retried while the service is busy. */
function googleSynth(key) {
  let nextAt = 0;
  const turn = async () => {
    const now = Date.now();
    const at = Math.max(now, nextAt);
    nextAt = at + GAP_MS;
    if (at > now) await sleep(at - now);
  };
  return async function synth(req) {
    for (let attempt = 1; ; attempt++) {
      await turn();
      const r = await fetch(ENDPOINT, {
        method: 'POST',
        // in a header, so the key never appears in a logged URL
        headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
        body: JSON.stringify(req),
      });
      if (r.ok) return Buffer.from((await r.json()).audioContent, 'base64');
      const detail = (await r.text()).replace(/\s+/g, ' ').slice(0, 300);
      // quota: 5, 10, 20, 40, 60, 60 … s; server trouble: 1, 2, 4, 8, 16 s
      if (r.status === 429 && attempt < 9) {
        await sleep(Math.min(60000, 5000 * 2 ** (attempt - 1)));
        continue;
      }
      if (r.status >= 500 && attempt < 6) {
        await sleep(1000 * 2 ** (attempt - 1));
        continue;
      }
      const err = new Error(`Text-to-Speech answered ${r.status}: ${detail}`);
      err.status = r.status;
      throw err;
    }
  };
}

/**
 * Runs fn over the items, `limit` at a time. Stops taking new ones after a
 * failure or once shouldStop() says so; either way it waits for the ones in
 * flight. Returns how many were taken.
 */
async function pool(items, limit, fn, shouldStop = () => false) {
  let next = 0;
  let failure = null;
  const worker = async () => {
    while (!failure && !shouldStop() && next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        failure = failure || e;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  if (failure) throw failure;
  return next;
}

/**
 * The index as the builder needs it. A missing file means no clips yet; an
 * unreadable one stops the build, because treating it as empty would make
 * every clip again and then delete all the old ones.
 */
function loadIndex(file) {
  if (!fs.existsSync(file)) return { recipe: null, voices: [], clips: {}, made: {} };
  let idx = null;
  try {
    idx = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // reported below
  }
  if (!idx || !Array.isArray(idx.voices) || !idx.clips || typeof idx.clips !== 'object') {
    throw new Error(`${file} is unreadable. Restore it (git checkout -- data/audio.json) before building.`);
  }
  return idx;
}

/** Sleep without an event loop turn, for a short retry. */
const pause = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/** One word per line, sorted, so a rebuild reads as a small diff. Replaced atomically. */
function writeIndex(index, file) {
  const block = (obj, fmt) =>
    Object.keys(obj)
      .sort()
      .map((k) => `  ${JSON.stringify(k)}: ${fmt(obj[k])}`)
      .join(',\n');
  const json =
    `{\n "recipe": ${JSON.stringify(index.recipe)},\n "voices": ${JSON.stringify(index.voices)},\n` +
    ` "clips": {\n${block(index.clips, JSON.stringify)}\n },\n` +
    ` "made": {\n${block(index.made, JSON.stringify)}\n }\n}\n`;
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, json);
  // Windows can hold a fresh file for a moment (virus scanner): retry, then copy
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (err) {
      if (!/EPERM|EBUSY|EACCES/.test(err.code) || i >= 8) {
        fs.copyFileSync(tmp, file);
        fs.unlinkSync(tmp);
        return;
      }
      pause(25 * (i + 1));
    }
  }
}

/**
 * Makes the missing clips and writes the index. A clip is current when it was
 * made with this recipe and this voice. If a request fails, or the run is
 * stopped, the index still lists every clip made so far and nothing is
 * deleted. A word Google refuses (400) is skipped and reported; the rest go on.
 */
async function build({
  synth,
  words = wordsToSpeak(),
  dir = CLIPS,
  indexFile = INDEX,
  recipe = RECIPE,
  voices = VOICES,
  dryRun = false,
  limit = Infinity,
  shouldStop = () => false,
  log = console.log,
} = {}) {
  const old = loadIndex(indexFile);
  const oldVoice = new Map(old.voices.map((v) => [v.id, v.name]));
  // an index from before clips were stamped: its clips share its recipe and voices
  const stampOf = (file, voiceId) =>
    (old.made && old.made[file]) ||
    (old.recipe && oldVoice.has(voiceId) ? `${old.recipe}|${oldVoice.get(voiceId)}` : null);

  const index = { recipe, voices, clips: {}, made: {} };
  const todo = [];
  for (const s of words) {
    const had = old.clips[s.key] || {};
    const clips = (index.clips[s.key] = {});
    for (const voice of voices) {
      const file = had[voice.id];
      const exists = file && CLIP_NAME.test(file) && fs.existsSync(path.join(dir, file));
      if (exists) {
        clips[voice.id] = file; // an outdated clip plays until its new one is made
        index.made[file] = stampOf(file, voice.id) || 'unknown';
      }
      if (!exists || index.made[file] !== `${recipe}|${voice.name}`) todo.push({ s, voice });
    }
  }
  const batch = todo.slice(0, limit);
  const chars = batch.reduce((n, t) => n + billed(requestFor(t.s, t.voice)), 0);
  log(
    `${words.length} words in ${voices.length} voices: ${todo.length} clip(s) to make` +
      `${batch.length < todo.length ? `, ${batch.length} this time` : ''} (${chars} characters)`
  );
  if (dryRun) return { made: 0, removed: 0, skipped: [], todo: todo.length, chars };

  fs.mkdirSync(dir, { recursive: true });
  let made = 0;
  let taken = 0;
  const skipped = [];
  try {
    taken = await pool(
      batch,
      4,
      async ({ s, voice }) => {
        let mp3;
        try {
          mp3 = await synth(requestFor(s, voice));
        } catch (e) {
          if (e.status !== 400) throw e;
          skipped.push(`${s.key} (${voice.label}): ${e.message}`);
          return;
        }
        // straight to its final name: a clip cut off by a crash is in no index,
        // and the next complete run removes it
        const name = `${crypto.randomBytes(8).toString('hex')}.mp3`;
        fs.writeFileSync(path.join(dir, name), mp3);
        index.clips[s.key][voice.id] = name;
        index.made[name] = `${recipe}|${voice.name}`;
        made += 1;
        if (made % 100 === 0) {
          log(`  ${made} / ${batch.length}`);
          writeIndex(prune(index), indexFile);
        }
      },
      shouldStop
    );
  } finally {
    writeIndex(prune(index), indexFile);
  }
  if (skipped.length) log(`skipped ${skipped.length} clip(s) Google refused:\n  ${skipped.join('\n  ')}`);

  // Only after a complete run: clips no word uses any more (the word left the
  // lists, or was voiced again).
  let removed = 0;
  if (taken === todo.length) {
    const used = new Set(Object.keys(index.made));
    for (const f of fs.readdirSync(dir)) {
      if (CLIP_NAME.test(f) && !used.has(f)) {
        fs.unlinkSync(path.join(dir, f));
        removed += 1;
      }
    }
  }
  return { made, removed, skipped, todo: todo.length, chars, stopped: taken < batch.length };
}

/** Keeps the stamps of the clips the index still lists. */
function prune(index) {
  const used = new Set(Object.values(index.clips).flatMap((c) => Object.values(c)));
  for (const f of Object.keys(index.made)) if (!used.has(f)) delete index.made[f];
  return index;
}

/** GOOGLE_TTS_API_KEY from the environment, or from .env in the project root. */
function apiKey() {
  const env = path.join(ROOT, '.env');
  if (!process.env.GOOGLE_TTS_API_KEY && fs.existsSync(env)) process.loadEnvFile(env);
  const key = (process.env.GOOGLE_TTS_API_KEY || '').trim();
  if (!key) throw new Error('No API key: put GOOGLE_TTS_API_KEY=<your key> in .env (see README).');
  return key;
}

/** --limit 20 or --limit=20; anything else there is a mistake. */
function limitArg(args) {
  const at = args.findIndex((a) => a === '--limit' || a.startsWith('--limit='));
  if (at < 0) return Infinity;
  const raw = args[at].includes('=') ? args[at].split('=')[1] : args[at + 1];
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error('--limit needs a whole number of clips, e.g. --limit 20');
  return n;
}

if (require.main === module) {
  let stopping = false;
  process.once('SIGINT', () => {
    stopping = true;
    console.log('\nstopping after the clips in flight…');
  });
  (async () => {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const limit = limitArg(args);
    const r = await build({
      synth: dryRun ? null : googleSynth(apiKey()),
      dryRun,
      limit,
      shouldStop: () => stopping,
    });
    if (dryRun) return;
    const files = fs.readdirSync(CLIPS).filter((f) => CLIP_NAME.test(f));
    const mb = files.reduce((n, f) => n + fs.statSync(path.join(CLIPS, f)).size, 0) / 1048576;
    console.log(
      `made ${r.made}, removed ${r.removed}${r.stopped ? ', stopped early' : ''}; ` +
        `data/audio has ${files.length} clips (${mb.toFixed(1)} MB)`
    );
    if (r.stopped || r.skipped.length) process.exitCode = 1;
  })().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
}

module.exports = { build, wordsToSpeak, requestFor, googleSynth, VOICES, RECIPE };
