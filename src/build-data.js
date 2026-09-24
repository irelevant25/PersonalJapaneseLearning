/**
 * Converts the TSV data transcribed from the course books (the vocabulary
 * index, the per-lesson kanji lists, the grammar index) into the JSON the
 * question generator and the kanji trainer use.
 *
 *   data/source/vocab-part1|2.tsv   kana \t kanji \t english \t lesson-tag
 *   data/source/kanji-part1|2.tsv   no \t kanji \t lesson \t on \t kun \t meaning \t compounds
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'source');

function readTsv(file) {
  const p = path.join(SRC, file);
  if (!fs.existsSync(p)) return [];
  return fs
    .readFileSync(p, 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.trim().length)
    .map((l) => l.split('\t'));
}

/** Both books' sources, concatenated. Lesson number alone identifies the book. */
const readAll = (...files) => files.flatMap(readTsv);

/* ---------------------------------------------------------------- vocabulary */

// 会L7 -> {lesson: 7, section: 'conv'},  読L9-II -> {lesson: 9, section: 'read'},
// 会G -> greetings,  会L12(e) -> Useful Expressions.
function parseLessonTag(tag) {
  const t = (tag || '').trim();
  if (/^会G/.test(t)) return { lesson: 0, section: 'greetings', extra: false };
  const m = t.match(/^(会|読)L(\d+)/);
  if (!m) return { lesson: null, section: 'other', extra: false };
  return {
    lesson: Number(m[2]),
    section: m[1] === '会' ? 'conv' : 'read',
    extra: /\(e\)/.test(t),
  };
}

// The list marks verb class in the gloss: [u] [ru] [irr.]
function verbClass(english) {
  if (/\[irr\.\]/.test(english)) return 'irr';
  if (/\[ru\]/.test(english)) return 'ru';
  if (/\[u\]/.test(english)) return 'u';
  return null;
}

// い-adjectives whose index entry has no kanji okurigana to key off.
const KANA_I_ADJ = new Set([
  'いい', 'かっこいい', 'つまらない', 'おいしい', 'かわいい', 'やさしい',
  'すごい', 'こわい', 'きれい', 'にぎやか',
]);
const NOT_I_ADJ = new Set([
  'きれい(な)', 'にぎやか(な)', 'いっぱい', 'だいたい', 'ぜったい',
  'はい', 'たくさん', 'ばんごはん', 'ひるごはん', 'あさごはん',
  'きらい(な)', 'だいきらい(な)',
]);

function adjClass(kana, kanji, english) {
  if (/\(な\)$/.test(kana)) return 'na';
  if (NOT_I_ADJ.has(kana)) return null;
  // Index writes い-adjectives with okurigana: 高い, 新しい, 面白い …
  if (kanji && /い$/.test(kanji) && /い$/.test(kana)) return 'i';
  if (!kanji && KANA_I_ADJ.has(kana)) return 'i';
  return null;
}

function partOfSpeech(entry) {
  if (entry.verbClass) return 'verb';
  if (entry.adjClass) return 'adj';
  if (/^to /.test(entry.english)) return 'verb';
  return 'noun';
}

function buildVocab() {
  const rows = readAll('vocab-part1.tsv', 'vocab-part2.tsv');
  const out = [];
  const seen = new Set();

  for (const r of rows) {
    const kana = (r[0] || '').trim();
    const kanji = (r[1] || '').trim();
    const english = (r[2] || '').trim();
    const tag = (r[3] || '').trim();
    if (!kana || !english) continue;

    const { lesson, section, extra } = parseLessonTag(tag);
    if (lesson === null) continue;

    const vc = verbClass(english);
    const ac = adjClass(kana, kanji, english);

    // A word can legitimately appear twice (きく to ask / to listen); key on the gloss too.
    const key = `${kana}|${english}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const entry = {
      kana,
      kanji: kanji || null,
      english,
      // gloss with the grammatical annotations stripped, for answer options
      gloss: english.replace(/\s*\[(u|ru|irr\.)\]/g, '').trim(),
      lesson,
      section,
      extra,
      verbClass: vc,
      adjClass: ac,
      tag,
    };
    entry.pos = partOfSpeech(entry);
    out.push(entry);
  }
  return out;
}

/* --------------------------------------------------------------------- kanji */

function buildKanji() {
  const rows = readAll('kanji-part1.tsv', 'kanji-part2.tsv');
  return rows
    .map((r) => {
      const [no, kanji, lesson, on, kun, meaning, compounds] = r;
      return {
        no: Number(no),
        kanji: (kanji || '').trim(),
        lesson: Number(lesson),
        on: (on || '').split('/').map((s) => s.trim()).filter(Boolean),
        kun: (kun || '').split('/').map((s) => s.trim()).filter(Boolean),
        meaning: (meaning || '').trim(),
        compounds: (compounds || '')
          .split(';')
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => {
            // 一時(いちじ)=one o'clock
            const m = c.match(/^(.+?)\((.+?)\)=(.*)$/);
            return m
              ? { word: m[1], reading: m[2], english: m[3].trim() }
              : null;
          })
          .filter(Boolean),
      };
    })
    .filter((k) => k.kanji);
}

/* --------------------------------------------------------------------- write */

function main() {
  const vocab = buildVocab();
  const kanji = buildKanji();
  const grammarIndex = readAll('grammar-index-part1.tsv', 'grammar-index-part2.tsv').map((r) => ({
    lesson: Number(r[0]),
    point: r[1],
    ref: r[2],
  }));

  const outDir = path.join(ROOT, 'data');
  fs.writeFileSync(path.join(outDir, 'vocab.json'), JSON.stringify(vocab, null, 1));
  fs.writeFileSync(path.join(outDir, 'kanji.json'), JSON.stringify(kanji, null, 1));
  fs.writeFileSync(
    path.join(outDir, 'grammar-index.json'),
    JSON.stringify(grammarIndex, null, 1)
  );

  const byLesson = {};
  for (const v of vocab) byLesson[v.lesson] = (byLesson[v.lesson] || 0) + 1;

  console.log(`vocab entries : ${vocab.length}`);
  console.log(`  verbs       : ${vocab.filter((v) => v.verbClass).length}`);
  console.log(`  adjectives  : ${vocab.filter((v) => v.adjClass).length}`);
  console.log(`  by lesson   : ${JSON.stringify(byLesson)}`);
  console.log(`kanji         : ${kanji.length}`);
  console.log(`grammar points: ${grammarIndex.length}`);
}

main();
