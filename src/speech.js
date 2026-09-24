/**
 * Spoken audio for the vocabulary: what a word is spoken as, and which clips
 * hold it. Shared by the audio builder (src/build-audio.js), the exam's
 * listening questions and the kanji trainer's catalog, so all three agree on
 * which clip belongs to which word.
 *
 *   data/audio.json  { recipe, voices: [{id, name, label}],
 *                      clips: { "<text>|<reading>": { <voice id>: "<name>.mp3" } },
 *                      made: { "<name>.mp3": "<recipe>|<voice name>" } }  (the builder's)
 *   data/audio/      the clips. Their names are random, so the clip of a
 *                    listening question gives nothing away.
 */
const fs = require('fs');
const path = require('path');

const DATA = path.join(__dirname, '..', 'data');
const INDEX = path.join(DATA, 'audio.json');
const CLIPS = path.join(DATA, 'audio');
const CLIP_NAME = /^[0-9a-f]{16}\.mp3$/;

const KANA_ONLY = /^[ぁ-ゖァ-ヺー]+$/;
const HAS_KANJI = /[一-龯々]/;

/** The first spelling: a phrase put in order, optional parts, notes and punctuation dropped. */
const clean = (s) =>
  String(s || '')
    .split('/')[0]
    .replace(/\s*\+.*$/, '') // "あまり + negative"
    // a phrase, not an optional part: かける(かぎを) → かぎをかける, 言う(文句を) → 文句を言う
    .replace(/^(.+?)[（(]([^)）〜～]+[をにが])[)）]$/, '$2$1')
    .replace(/[（(]([^)）]*)[)）](?=[ぁ-ゖァ-ヺー])/g, '$1') // inside a word: ほ(う)っておく → ほうっておく
    .replace(/[（(][^)）]*[)）]/g, '') // at the end: いじわる(な), 妹(さん), かける(めがねを)
    .replace(/[。、！？!?\s]/g, '');

/**
 * How a word is spoken: { text, reading, key }, or null when it isn't voiced.
 * Kanji words keep their spelling and carry the reading, so 今日 can't come out
 * as こんにち. Suffixes and patterns (〜円, 〜か〜) and words with letters in
 * them (Lサイズ) are not voiced.
 */
function spoken(kana, kanji) {
  const reading = clean(kana); // ください(〜を) → ください
  if (!KANA_ONLY.test(reading)) return null;
  const written = clean(kanji);
  if (/[〜～]/.test(written)) return null;
  const text = HAS_KANJI.test(written) ? written : reading;
  return { text, reading, key: `${text}|${reading}` };
}

/** The index as built, or an empty one. */
function readIndex(file = INDEX) {
  try {
    const idx = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (idx && Array.isArray(idx.voices) && idx.clips) return idx;
  } catch {
    // no audio made yet
  }
  return { recipe: null, voices: [], clips: {} };
}

let INDEX_CACHE = null;

/** The clips of a spoken word, one per voice in voice order, or null. */
function clipsFor(s) {
  if (!s) return null;
  if (!INDEX_CACHE) INDEX_CACHE = readIndex();
  const c = INDEX_CACHE.clips[s.key];
  if (!c) return null;
  const list = INDEX_CACHE.voices.map((v) => c[v.id]).filter(Boolean);
  return list.length ? list : null;
}

module.exports = { spoken, clean, readIndex, clipsFor, INDEX, CLIPS, CLIP_NAME };
