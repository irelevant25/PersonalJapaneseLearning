/**
 * The study items for the kanji SRS, built from the data the exam already uses:
 *
 *   kanji  — the 317 kanji of the course's kanji lists (々 aside: it has no
 *            reading of its own to ask for)
 *   vocab  — every word, from the vocabulary lists and the example compounds
 *            of the kanji lists, that is written only with those kanji (plus
 *            kana)
 *
 * As in WaniKani, a vocabulary item becomes available once all of its kanji have
 * been learned, and its "lesson" is the course lesson of its latest kanji — so
 * 大学 sits in Lesson 6, where both 大 and 学 are taught, not Lesson 1 where the
 * word first appears.
 */
const fs = require('fs');
const path = require('path');
const { spoken, clipsFor } = require('../speech');

const DATA = path.join(__dirname, '..', '..', 'data');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));

const isKanjiChar = (c) => /[一-龯]/.test(c);
const isKanaChar = (c) => /[぀-ヿー々]/.test(c);

/** Parenthetical optional parts: 弟(さん), しずか(な), ざんねん(ですね). */
const OPTIONAL_PAREN = /\((?:さん|な|ですね|でした|なさい|ございます)\)/g;

function splitList(s, re) {
  return String(s || '')
    .split(re)
    .map((x) => x.trim())
    .filter(Boolean);
}

/** "to eat [ru]" -> "to eat"; drops the list's grammatical annotations. */
const cleanGloss = (s) =>
  String(s || '')
    .replace(/\s*\[(u|ru|irr\.)\]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

function buildCatalog() {
  const kanjiData = readJson('kanji.json');
  const vocabData = readJson('vocab.json');

  /* ------------------------------------------------------------- kanji */

  const kanjiByChar = new Map();
  const items = [];

  for (const k of kanjiData) {
    if (!k.on.length && !k.kun.length) continue; // 々
    kanjiByChar.set(k.kanji, k);
  }

  for (const k of kanjiByChar.values()) {
    // Readings to accept: every on/kun reading, plus the dictionary form of
    // words that are just this kanji and okurigana (食べる → たべる).
    const accept = new Set([...k.on, ...k.kun]);
    for (const c of k.compounds) {
      const w = c.word.split('/')[0];
      if (w[0] === k.kanji && [...w.slice(1)].every((ch) => /[぀-ゟ]/.test(ch))) {
        for (const r of c.reading.split('/')) accept.add(r.trim());
      }
    }
    items.push({
      id: `k:${k.kanji}`,
      type: 'kanji',
      chars: k.kanji,
      no: k.no,
      lesson: k.lesson,
      courseLesson: k.lesson,
      meanings: splitList(k.meaning, /;/),
      on: k.on,
      kun: k.kun,
      readings: [...accept],
      audio: null,
    });
  }

  /* ------------------------------------------------------------- vocab */

  const vocab = new Map(); // chars -> item under construction

  /** Word must be the course's kanji + kana only, with at least one kanji. */
  function usable(chars) {
    const cs = [...chars];
    if (!cs.some(isKanjiChar)) return false;
    return cs.every((c) => (isKanjiChar(c) ? kanjiByChar.has(c) : isKanaChar(c)));
  }

  function addVocab({ chars, readings, meanings, courseLesson, source, extra = {} }) {
    if (!usable(chars) || !readings.length || !meanings.length) return;
    let v = vocab.get(chars);
    if (!v) {
      v = {
        id: `v:${chars}`,
        type: 'vocab',
        chars,
        readings: [],
        meanings: [],
        courseLesson,
        sources: new Set(),
      };
      vocab.set(chars, v);
    }
    for (const r of readings) if (!v.readings.includes(r)) v.readings.push(r);
    for (const m of meanings) {
      if (!v.meanings.some((x) => x.toLowerCase() === m.toLowerCase())) v.meanings.push(m);
    }
    v.courseLesson = Math.min(v.courseLesson, courseLesson);
    v.sources.add(source);
    for (const [key, val] of Object.entries(extra)) if (val && !v[key]) v[key] = val;
  }

  // (a) The vocabulary lists.
  for (const e of vocabData) {
    if (!e.kanji) continue;
    let kanji = e.kanji;
    // "なにも + negative" — the note belongs to the meaning, not the reading.
    let kana = e.kana.replace(/\s*\+\s*negative/i, '');
    if (/[〜～A-Za-z○]/.test(kanji)) continue;
    // "言う(文句を)" is a phrase marker, not an optional suffix — skip those.
    const parens = kanji.match(/\(([^)]*)\)/g) || [];
    if (parens.some((p) => /[一-龯をにが]/.test(p))) continue;
    kanji = kanji.replace(OPTIONAL_PAREN, '');
    kana = kana.replace(OPTIONAL_PAREN, '');
    if (/[()]/.test(kanji)) continue;

    const forms = splitList(kanji, /\//);
    const readings = splitList(kana, /\//).map((r) => r.replace(/\s+/g, ''));
    for (const chars of forms) {
      addVocab({
        chars,
        readings,
        meanings: splitList(cleanGloss(e.gloss || e.english), /;/),
        courseLesson: e.lesson,
        source: 'vocab-list',
        extra: { verbClass: e.verbClass, adjClass: e.adjClass, pos: e.pos },
      });
    }
  }

  // (b) The example compounds printed with each kanji of the kanji lists.
  for (const k of kanjiByChar.values()) {
    for (const c of k.compounds) {
      if (/[〜～]/.test(c.word) || /^Mr\.\/Ms\./.test(c.english)) continue;
      let readings = splitList(c.reading, /\//);
      for (let chars of splitList(c.word, /\//)) {
        let rs = readings;
        // 親切な(しんせつな) is listed with its な; the vocabulary list has 親切.
        const last = [...chars].slice(-2);
        if (
          chars.endsWith('な') &&
          last.length === 2 &&
          isKanjiChar(last[0]) &&
          rs.every((r) => r.endsWith('な'))
        ) {
          chars = chars.slice(0, -1);
          rs = rs.map((r) => r.slice(0, -1));
        }
        addVocab({
          chars,
          readings: rs,
          meanings: splitList(c.english, /[;,]/),
          courseLesson: k.lesson,
          source: 'kanji-list',
        });
      }
    }
  }

  // 入口 / 入り口 are one word spelt two ways — same kanji, same reading. Keep
  // the spelling the vocabulary list uses and drop the other.
  const variantKey = (v) =>
    [...new Set([...v.chars].filter(isKanjiChar))].join('') + '|' + [...v.readings].sort().join('/');
  const seenVariant = new Map();
  for (const v of [...vocab.values()].sort(
    (a, b) => (b.sources.has('vocab-list') ? 1 : 0) - (a.sources.has('vocab-list') ? 1 : 0)
  )) {
    const key = variantKey(v);
    const keep = seenVariant.get(key);
    if (!keep) {
      seenVariant.set(key, v);
      continue;
    }
    for (const m of v.meanings) if (!keep.meanings.includes(m)) keep.meanings.push(m);
    (keep.spellings = keep.spellings || []).push(v.chars);
    vocab.delete(v.chars);
  }

  // Keigo verbs are glossed "honorific expression for くれる", which gives you
  // nothing to type. Resolve each to the plain verb's meaning, so 下さる accepts
  // "to give (me)" — the gloss stays, the plain meaning is added after it.
  const plainByKana = new Map();
  for (const e of [...vocabData].sort((a, b) => a.lesson - b.lesson)) {
    const k = e.kana.replace(/\(.*?\)/g, '').trim();
    if (!plainByKana.has(k)) plainByKana.set(k, cleanGloss(e.gloss || e.english));
  }
  for (const v of vocab.values()) {
    const add = [];
    for (const m of v.meanings) {
      const km = m.match(/^(honorific|humble|extra-modest) expression for (.+)$/i);
      if (!km) continue;
      for (const target of km[2].split(/,|\band\b/).map((s) => s.trim()).filter(Boolean)) {
        const plain = plainByKana.get(target);
        if (plain) add.push(`${splitList(plain, /;/)[0]} (${km[1].toLowerCase()})`);
      }
    }
    for (const a of add) if (!v.meanings.includes(a)) v.meanings.push(a);
  }

  for (const v of vocab.values()) {
    v.kanji = [...new Set([...v.chars].filter(isKanjiChar))];
    v.lesson = Math.max(...v.kanji.map((c) => kanjiByChar.get(c).lesson));
    // one clip per voice, spoken with the first reading
    v.audio = clipsFor(spoken(v.readings[0], v.chars));
    v.sources = [...v.sources];
    items.push(v);
  }

  /* ------------------------------------------------- examples & order */

  const byId = new Map(items.map((it) => [it.id, it]));
  const vocabItems = items.filter((it) => it.type === 'vocab');

  for (const it of items) {
    if (it.type !== 'kanji') continue;
    it.examples = vocabItems
      .filter((v) => v.chars.includes(it.chars))
      .sort(
        (a, b) =>
          (b.audio ? 1 : 0) - (a.audio ? 1 : 0) ||
          a.lesson - b.lesson ||
          a.chars.length - b.chars.length
      )
      .map((v) => v.id);
  }

  // Course order: lesson by lesson, the kanji first (in list order), then the
  // vocabulary those kanji unlock.
  items.sort(
    (a, b) =>
      a.lesson - b.lesson ||
      (a.type === 'kanji' ? 0 : 1) - (b.type === 'kanji' ? 0 : 1) ||
      (a.type === 'kanji'
        ? a.no - b.no
        : a.courseLesson - b.courseLesson ||
          a.chars.length - b.chars.length ||
          a.chars.localeCompare(b.chars, 'ja'))
  );
  items.forEach((it, i) => (it.order = i));

  const lessons = [...new Set(items.map((it) => it.lesson))].sort((a, b) => a - b);

  return { items, byId, lessons };
}

let CACHE = null;
function getCatalog() {
  if (!CACHE) CACHE = buildCatalog();
  return CACHE;
}

module.exports = { getCatalog, buildCatalog };
