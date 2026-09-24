/**
 * Builds the multiple-choice question bank from the course data in data/.
 *
 * Everything here is generated deterministically, so the same seed always
 * produces the same paper — which is what makes two attempts comparable.
 */
const fs = require('fs');
const path = require('path');
const {
  conjugateVerb,
  conjugateAdj,
  wrongVerbForms,
  wrongAdjForms,
} = require('./conjugate');
// The listening sections need the clips of `npm run build:audio`; without them
// the exam simply has no listening questions.
const { spoken, clipsFor } = require('./speech');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');

const vocab = JSON.parse(fs.readFileSync(path.join(DATA, 'vocab.json'), 'utf8'));
const kanjiList = JSON.parse(fs.readFileSync(path.join(DATA, 'kanji.json'), 'utf8'));
const authored = [
  ...require('../data/authored-items-part1.js'),
  ...require('../data/authored-items-part2.js'),
];

/* ------------------------------------------------------------ seeded random */

function makeRng(seed) {
  let s = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) s = (s * 31 + str.charCodeAt(i)) >>> 0;
  s = s || 1;
  return function rng() {
    // mulberry32
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pick(arr, n, rng) {
  return shuffle(arr, rng).slice(0, n);
}

/* --------------------------------------------------------------- helpers */

const displayWord = (v) => v.kanji || v.kana;

/** Drop distractors equal to the answer or to each other; pad if short. */
function makeOptions(correct, candidates, rng, pool, count = 4) {
  const out = [];
  const seen = new Set([norm(correct)]);
  for (const c of shuffle(candidates, rng)) {
    if (out.length >= count - 1) break;
    if (!c) continue;
    const k = norm(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  if (out.length < count - 1 && pool) {
    for (const c of shuffle(pool, rng)) {
      if (out.length >= count - 1) break;
      const k = norm(c);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  }
  if (out.length < count - 1) return null; // not enough distinct distractors
  return { correct, distractors: out };
}

const norm = (s) => String(s).trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Two glosses mean the same when they share a sense ("sake; alcohol" and "sake;
 * alcoholic drink"), ignoring (polite) and punctuation. Such a word is never a
 * distractor, or the question would have two right answers.
 */
const senses = (gloss) =>
  String(gloss)
    .toLowerCase()
    .split(';')
    .map((s) => s.replace(/\((?:polite|casual|formal)\)/g, '').replace(/[.!?]/g, '').trim());
const sameMeaning = (a, b) => senses(a).some((s) => senses(b).includes(s));

/**
 * Part 1 is Greetings + Lessons 1–12, Part 2 is Lessons 13–23, so the lesson
 * number alone says which part an item belongs to.
 */
const BOOKS = [
  { id: 1, name: 'Part 1', lessons: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] },
  { id: 2, name: 'Part 2', lessons: [13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23] },
];
const bookOf = (lesson) => (Number(lesson) <= 12 ? 1 : 2);

let nextId = 0;
function q(obj) {
  return Object.assign({ id: `q${++nextId}`, book: bookOf(obj.lesson) }, obj);
}

/* ----------------------------------------------------- 1/2. vocabulary */

function vocabQuestions() {
  const out = [];
  const testable = vocab.filter((v) => !v.extra && v.gloss.length <= 60);

  // Words whose English gloss is shared with another word cannot be used for
  // English -> Japanese, because more than one option would be correct.
  const glossCount = new Map();
  for (const v of testable) {
    const k = norm(v.gloss);
    glossCount.set(k, (glossCount.get(k) || 0) + 1);
  }

  const byLessonPos = new Map();
  for (const v of testable) {
    const k = `${v.lesson}|${v.pos}`;
    if (!byLessonPos.has(k)) byLessonPos.set(k, []);
    byLessonPos.get(k).push(v);
  }
  const byPos = new Map();
  for (const v of testable) {
    if (!byPos.has(v.pos)) byPos.set(v.pos, []);
    byPos.get(v.pos).push(v);
  }

  const rng = makeRng('vocab');

  for (const v of testable) {
    const sameLesson = (byLessonPos.get(`${v.lesson}|${v.pos}`) || []).filter(
      (o) => o !== v
    );
    const samePos = (byPos.get(v.pos) || []).filter((o) => o !== v);

    // Japanese -> English
    {
      const differs = (x) => !sameMeaning(x.gloss, v.gloss);
      const o = makeOptions(
        v.gloss,
        sameLesson.filter(differs).map((x) => x.gloss),
        rng,
        samePos.filter(differs).map((x) => x.gloss)
      );
      if (o) {
        out.push(
          q({
            section: 'vocab-jp-en',
            lesson: v.lesson,
            question: `What does 「${displayWord(v)}」 mean?`,
            reading: v.kanji ? v.kana : null,
            ...o,
            explain: `${displayWord(v)}（${v.kana}）= ${v.gloss}`,
            ref: v.tag,
          })
        );
      }
    }

    // English -> Japanese
    if (glossCount.get(norm(v.gloss)) === 1) {
      const o = makeOptions(
        displayWord(v),
        sameLesson.map(displayWord),
        rng,
        samePos.map(displayWord)
      );
      if (o) {
        out.push(
          q({
            section: 'vocab-en-jp',
            lesson: v.lesson,
            question: `Which word means "${v.gloss}"?`,
            ...o,
            explain: `${v.gloss} = ${displayWord(v)}（${v.kana}）`,
            ref: v.tag,
          })
        );
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------ 3/4/5. kanji */

const kanjiByChar = new Map(kanjiList.map((k) => [k.kanji, k]));

/**
 * Build wrong readings for a compound out of the component kanji's own
 * readings, keeping any kana in the word exactly where it is — so 山川さん
 * yields さんかわさん, not やまかわ, and 食べる yields しょくべる.
 */
function fakeReadings(word, correctReading) {
  const chars = [...word];
  if (!chars.some((c) => kanjiByChar.has(c))) return [];
  const per = chars.map((c) => {
    const k = kanjiByChar.get(c);
    if (!k) return [c]; // kana stays put
    return [...new Set([...k.on, ...k.kun])].filter(Boolean);
  });
  const out = new Set();
  // Cartesian product, capped — these are the "read every kanji with its other
  // reading" mistakes, which is exactly what the exercises test.
  const build = (i, acc) => {
    if (out.size > 24) return;
    if (i === per.length) {
      if (acc && acc !== correctReading && acc.length > 1) out.add(acc);
      return;
    }
    for (const r of per[i]) build(i + 1, acc + r);
  };
  build(0, '');
  return [...out];
}

function kanjiQuestions() {
  const rng = makeRng('kanji');
  const out = [];

  // 3. reading of a compound
  for (const k of kanjiList) {
    for (const c of k.compounds) {
      if (!/[一-龯]/.test(c.word)) continue;
      // A bare kanji has several legitimate readings (一 = いち and ひと), so a
      // single-character "how do you read this" item has no one right answer.
      if ([...c.word].length < 2) continue;
      // Every kanji must be one we hold readings for; otherwise the generated
      // distractors keep that character literally (雨期 -> "あめ期") and the
      // all-kana option gives the answer away.
      if ([...c.word].some((ch) => /[一-龯]/.test(ch) && !kanjiByChar.has(ch)))
        continue;
      const fakes = fakeReadings(c.word, c.reading).filter(
        (r) => !/[一-龯]/.test(r)
      );
      const otherReadings = kanjiList
        .filter((x) => x.lesson === k.lesson && x !== k)
        .flatMap((x) => x.compounds.map((cc) => cc.reading));
      const o = makeOptions(c.reading, fakes, rng, otherReadings);
      if (!o) continue;
      out.push(
        q({
          section: 'kanji-reading',
          lesson: k.lesson,
          question: `How do you read 「${c.word}」?`,
          hint: c.english,
          ...o,
          explain: `${c.word}（${c.reading}）= ${c.english}`,
          ref: `Kanji ${k.no} 「${k.kanji}」 L${k.lesson}`,
        })
      );
    }
  }

  // 4. meaning of a single kanji
  for (const k of kanjiList) {
    const others = kanjiList.filter((x) => x !== k).map((x) => x.meaning);
    const near = kanjiList
      .filter((x) => x !== k && Math.abs(x.lesson - k.lesson) <= 1)
      .map((x) => x.meaning);
    const o = makeOptions(k.meaning, near, rng, others);
    if (!o) continue;
    out.push(
      q({
        section: 'kanji-meaning',
        lesson: k.lesson,
        question: `What does the kanji 「${k.kanji}」 mean?`,
        ...o,
        explain: `${k.kanji} = ${k.meaning}（on: ${k.on.join('、') || '—'} / kun: ${
          k.kun.join('、') || '—'
        }）`,
        ref: `Kanji ${k.no} L${k.lesson}`,
      })
    );
  }

  // 5. choose the correct kanji spelling for a word given in kana
  const allChars = kanjiList.map((k) => k.kanji);
  for (const k of kanjiList) {
    for (const c of k.compounds) {
      const chars = [...c.word];
      if (chars.filter((ch) => kanjiByChar.has(ch)).length < 1) continue;
      // Two characters or more, so the distractors differ by one kanji rather
      // than being four unrelated characters.
      if (chars.length < 2 || chars.length > 4) continue;
      const fakes = new Set();
      for (let i = 0; i < chars.length; i++) {
        if (!kanjiByChar.has(chars[i])) continue;
        for (const sub of pick(allChars, 6, rng)) {
          if (sub === chars[i]) continue;
          const copy = chars.slice();
          copy[i] = sub;
          fakes.add(copy.join(''));
        }
      }
      const o = makeOptions(c.word, [...fakes], rng);
      if (!o) continue;
      out.push(
        q({
          section: 'kanji-writing',
          lesson: k.lesson,
          question: `Which is the correct kanji for 「${c.reading}」 (${c.english})?`,
          ...o,
          explain: `${c.reading} = ${c.word}（${c.english}）`,
          ref: `Kanji ${k.no} L${k.lesson}`,
        })
      );
    }
  }

  return out;
}

/* ------------------------------------------------ 6/7. verbs and adjectives */

/**
 * Each testable form, with the lesson that teaches it. The item is filed under
 * the later of "lesson the verb appears in" and "lesson the form is taught",
 * so the potential of 食べる is a Lesson 13 question, not a Lesson 3 one.
 */
const FORM_LABELS = {
  masu: ['ます-form (long present)', 3],
  masenDeshita: ['ませんでした-form (long past negative)', 4],
  te: ['て-form', 6],
  shortNeg: ['short present negative (ない-form)', 8],
  shortPast: ['short past (た-form)', 9],
  shortPastNeg: ['short past negative', 9],
  tai: ['〜たい form (want to)', 11],
  // Part 2 — the second conjugation chart
  potential: ['potential form (can do)', 13],
  volitional: ['volitional form (let’s / I shall)', 15],
  ba: ['ば-form (conditional)', 18],
  passive: ['passive form', 21],
  causative: ['causative form (make/let someone do)', 22],
  causativePassive: ['causative-passive form', 23],
};

/**
 * Verbs written as a single word — skip お風呂に入る, たばこを吸う, and the
 * 〜 patterns (〜ていらっしゃる), which are suffixes rather than verbs.
 */
function simpleVerbs() {
  return vocab.filter(
    (v) =>
      v.verbClass &&
      !v.extra &&
      !/[をにがへ・〜～]/.test(v.kana) &&
      !/[をにがへ・〜～]/.test(v.kanji || '') &&
      displayWord(v).length >= 2
  );
}

/**
 * Honorific, humble and extra-modest verbs (いらっしゃる, おっしゃる, 申す …).
 * Their polite forms are worth drilling, but a causative-passive of a honorific
 * verb is not Japanese anyone writes, so the Part 2 forms are skipped for them.
 */
const isKeigoVerb = (v) =>
  /(honorific|humble|extra-modest) expression/i.test(v.english);

const PART2_FORMS = new Set([
  'potential',
  'volitional',
  'ba',
  'passive',
  'causative',
  'causativePassive',
]);

function verbQuestions() {
  const rng = makeRng('verbs');
  const out = [];
  const verbs = simpleVerbs();

  for (const v of verbs) {
    const dict = displayWord(v);
    const forms = conjugateVerb(dict, v.verbClass);
    if (!forms) continue;

    for (const [key, [label, lessonTaught]] of Object.entries(FORM_LABELS)) {
      const correct = forms[key];
      if (!correct) continue;
      if (PART2_FORMS.has(key) && isKeigoVerb(v)) continue;
      const wrong = wrongVerbForms(dict, v.verbClass, key);
      const o = makeOptions(correct, wrong, rng);
      if (!o) continue;
      out.push(
        q({
          section: 'verb-conjugation',
          lesson: Math.max(v.lesson, lessonTaught),
          question: `Give the ${label} of 「${dict}」 (${v.gloss}).`,
          hint: `${v.verbClass === 'irr' ? 'irregular' : v.verbClass + '-verb'}`,
          ...o,
          explain: `${dict} [${v.verbClass}] → ${correct}`,
          ref: v.tag,
        })
      );
    }

    // verb class identification (three options — it is a three-way choice)
    const label = { u: 'u-verb', ru: 'ru-verb', irr: 'irregular verb' };
    out.push(
      q({
        section: 'verb-class',
        lesson: Math.max(v.lesson, 3),
        question: `What kind of verb is 「${dict}」 (${v.gloss})?`,
        correct: label[v.verbClass],
        distractors: Object.entries(label)
          .filter(([c]) => c !== v.verbClass)
          .map(([, l]) => l),
        explain: `${dict} is ${label[v.verbClass]} → ます-form ${forms.masu}, て-form ${forms.te}`,
        ref: v.tag,
      })
    );
  }
  return out;
}

const ADJ_FORMS = {
  negPolite: ['polite negative (〜くないです / 〜じゃないです)', 5],
  pastPolite: ['polite past', 5],
  pastNegPolite: ['polite past negative', 5],
  te: ['て-form', 7],
  adverb: ['adverbial form (used before なる)', 10],
};

function adjectiveQuestions() {
  const rng = makeRng('adj');
  const out = [];
  const adjs = vocab.filter(
    (v) => v.adjClass && !v.extra && !/[をにがへ]/.test(v.kana)
  );

  for (const a of adjs) {
    const word = a.kanji || a.kana;
    const forms = conjugateAdj(word, a.adjClass);

    for (const [key, [label, lesson]] of Object.entries(ADJ_FORMS)) {
      const correct = forms[key];
      if (!correct) continue;
      const wrong = wrongAdjForms(word, a.adjClass, key);
      const o = makeOptions(correct, wrong, rng);
      if (!o) continue;
      out.push(
        q({
          section: 'adjective',
          lesson: Math.max(a.lesson, lesson),
          question: `Give the ${label} of 「${word}」 (${a.gloss}).`,
          hint: a.adjClass === 'i' ? 'い-adjective' : 'な-adjective',
          ...o,
          explain: `${word} is ${
            a.adjClass === 'i' ? 'an い-adjective' : 'a な-adjective'
          } → ${correct}`,
          ref: a.tag,
        })
      );
    }

    out.push(
      q({
        section: 'adjective',
        lesson: Math.max(a.lesson, 5),
        question: `Is 「${word}」 (${a.gloss}) an い-adjective or a な-adjective?`,
        correct: a.adjClass === 'i' ? 'い-adjective' : 'な-adjective',
        distractors: [a.adjClass === 'i' ? 'な-adjective' : 'い-adjective'],
        explain: `${word} → ${forms.pastPolite} (polite past), ${forms.te} (て-form)`,
        ref: a.tag,
      })
    );
  }
  return out;
}

/* ------------------------------------------------------------------- kana */

const HIRAGANA = [
  ['あ', 'a'], ['い', 'i'], ['う', 'u'], ['え', 'e'], ['お', 'o'],
  ['か', 'ka'], ['き', 'ki'], ['く', 'ku'], ['け', 'ke'], ['こ', 'ko'],
  ['さ', 'sa'], ['し', 'shi'], ['す', 'su'], ['せ', 'se'], ['そ', 'so'],
  ['た', 'ta'], ['ち', 'chi'], ['つ', 'tsu'], ['て', 'te'], ['と', 'to'],
  ['な', 'na'], ['に', 'ni'], ['ぬ', 'nu'], ['ね', 'ne'], ['の', 'no'],
  ['は', 'ha'], ['ひ', 'hi'], ['ふ', 'fu'], ['へ', 'he'], ['ほ', 'ho'],
  ['ま', 'ma'], ['み', 'mi'], ['む', 'mu'], ['め', 'me'], ['も', 'mo'],
  ['や', 'ya'], ['ゆ', 'yu'], ['よ', 'yo'],
  ['ら', 'ra'], ['り', 'ri'], ['る', 'ru'], ['れ', 're'], ['ろ', 'ro'],
  ['わ', 'wa'], ['を', 'o (particle)'], ['ん', 'n'],
  ['が', 'ga'], ['ぎ', 'gi'], ['ぐ', 'gu'], ['げ', 'ge'], ['ご', 'go'],
  ['ざ', 'za'], ['じ', 'ji'], ['ず', 'zu'], ['ぜ', 'ze'], ['ぞ', 'zo'],
  ['だ', 'da'], ['で', 'de'], ['ど', 'do'],
  ['ば', 'ba'], ['び', 'bi'], ['ぶ', 'bu'], ['べ', 'be'], ['ぼ', 'bo'],
  ['ぱ', 'pa'], ['ぴ', 'pi'], ['ぷ', 'pu'], ['ぺ', 'pe'], ['ぽ', 'po'],
];

const KATAKANA = [
  ['ア', 'a'], ['イ', 'i'], ['ウ', 'u'], ['エ', 'e'], ['オ', 'o'],
  ['カ', 'ka'], ['キ', 'ki'], ['ク', 'ku'], ['ケ', 'ke'], ['コ', 'ko'],
  ['サ', 'sa'], ['シ', 'shi'], ['ス', 'su'], ['セ', 'se'], ['ソ', 'so'],
  ['タ', 'ta'], ['チ', 'chi'], ['ツ', 'tsu'], ['テ', 'te'], ['ト', 'to'],
  ['ナ', 'na'], ['ニ', 'ni'], ['ヌ', 'nu'], ['ネ', 'ne'], ['ノ', 'no'],
  ['ハ', 'ha'], ['ヒ', 'hi'], ['フ', 'fu'], ['ヘ', 'he'], ['ホ', 'ho'],
  ['マ', 'ma'], ['ミ', 'mi'], ['ム', 'mu'], ['メ', 'me'], ['モ', 'mo'],
  ['ヤ', 'ya'], ['ユ', 'yu'], ['ヨ', 'yo'],
  ['ラ', 'ra'], ['リ', 'ri'], ['ル', 'ru'], ['レ', 're'], ['ロ', 'ro'],
  ['ワ', 'wa'], ['ン', 'n'],
  ['ガ', 'ga'], ['ジ', 'ji'], ['ズ', 'zu'], ['ダ', 'da'], ['デ', 'de'], ['ド', 'do'],
  ['バ', 'ba'], ['ビ', 'bi'], ['ブ', 'bu'], ['ベ', 'be'], ['ボ', 'bo'],
  ['パ', 'pa'], ['ピ', 'pi'], ['プ', 'pu'], ['ペ', 'pe'], ['ポ', 'po'],
];

function kanaQuestions() {
  const rng = makeRng('kana');
  const out = [];
  const sets = [
    ['hiragana', HIRAGANA, 1],
    ['katakana', KATAKANA, 2],
  ];
  for (const [name, table, lesson] of sets) {
    for (const [ch, romaji] of table) {
      const others = table.filter(([c]) => c !== ch).map(([, r]) => r);
      const o = makeOptions(romaji, others, rng);
      if (o) {
        out.push(
          q({
            section: 'kana',
            lesson,
            question: `How is 「${ch}」 read?`,
            ...o,
            explain: `${ch} = ${romaji} (${name})`,
            ref: `${name} chart`,
          })
        );
      }
      const otherChars = table.filter(([, r]) => r !== romaji).map(([c]) => c);
      const o2 = makeOptions(ch, otherChars, rng);
      if (o2) {
        out.push(
          q({
            section: 'kana',
            lesson,
            question: `Which ${name} is read "${romaji}"?`,
            ...o2,
            explain: `${romaji} = ${ch} (${name})`,
            ref: `${name} chart`,
          })
        );
      }
    }
  }
  return out;
}

/* ------------------------------------------------------------- listening */

/**
 * Kana-level similarity, used to pick distractors that are genuinely hard to
 * tell apart by ear rather than merely "another word from this lesson".
 * Shared first mora and a matching length are what make a pair confusable.
 */
function earSimilarity(a, b) {
  if (a === b) return -1;
  let score = 0;
  if (a[0] === b[0]) score += 3;
  if (a[a.length - 1] === b[b.length - 1]) score += 1;
  score -= Math.abs(a.length - b.length);
  // shared mora anywhere
  const setB = new Set([...b]);
  for (const ch of new Set([...a])) if (setB.has(ch)) score += 0.5;
  return score;
}

function listeningQuestions() {
  const rng = makeRng('listening');
  const out = [];

  // Every voiced word of the vocabulary list, once per lesson and meaning.
  const seen = new Set();
  const words = [];
  for (const v of vocab) {
    if (v.extra || v.gloss.length > 60) continue;
    const s = spoken(v.kana, v.kanji);
    const clips = clipsFor(s);
    if (!clips) continue;
    const key = `${v.lesson}|${s.reading}|${v.gloss}`;
    if (seen.has(key)) continue;
    seen.add(key);
    words.push({ v, word: s.reading, clips });
  }

  const byLesson = new Map();
  for (const w of words) {
    if (!byLesson.has(w.v.lesson)) byLesson.set(w.v.lesson, []);
    byLesson.get(w.v.lesson).push(w);
  }

  for (const w of words) {
    const { v, word } = w;
    // A word that sounds the same can't be told apart by ear, so it is never a
    // distractor (はし: bridge or chopsticks).
    const peers = (byLesson.get(v.lesson) || []).filter((p) => p !== w && p.word !== word);
    const nearest = (n, list = peers) =>
      list
        .map((p) => [earSimilarity(word, p.word), p])
        .sort((x, y) => y[0] - x[0])
        .slice(0, n)
        .map(([, p]) => p);
    const audio = w.clips[Math.floor(rng() * w.clips.length)]; // one of the voices
    const shown = v.kanji ? `${v.kanji}（${word}）` : word;

    // 1. Hear it, choose the meaning — never a meaning this word also has.
    {
      const others = peers.filter((p) => !sameMeaning(p.v.gloss, v.gloss));
      const o = makeOptions(
        v.gloss,
        nearest(10, others).map((p) => p.v.gloss),
        rng,
        others.map((p) => p.v.gloss)
      );
      if (o) {
        out.push(
          q({
            section: 'listening-meaning',
            lesson: v.lesson,
            question: 'Listen, then choose what the word means.',
            audio,
            ...o,
            explain: `${shown} = ${v.gloss}`,
            ref: v.tag,
          })
        );
      }
    }

    // 2. Hear it, choose the word — options in kana throughout, so the script
    //    itself never hints at the answer.
    {
      const o = makeOptions(
        word,
        nearest(12).map((p) => p.word),
        rng,
        peers.map((p) => p.word)
      );
      if (o) {
        out.push(
          q({
            section: 'listening-word',
            lesson: v.lesson,
            question: 'Listen, then choose the word you heard.',
            hint: v.gloss,
            audio,
            ...o,
            explain: `${shown} = ${v.gloss}`,
            ref: v.tag,
          })
        );
      }
    }
  }
  return out;
}

/* -------------------------------------------------------- authored items */

function authoredQuestions() {
  return authored.map((a) =>
    q({
      section: a.section,
      lesson: a.lesson,
      question: a.question,
      hint: a.hint || null,
      correct: a.correct,
      distractors: a.distractors,
      explain: a.explain,
      ref: a.ref || null,
    })
  );
}

/* ---------------------------------------------------------------- assembly */

let BANK = null;

function buildBank() {
  if (BANK) return BANK;
  nextId = 0;
  BANK = [
    ...vocabQuestions(),
    ...kanjiQuestions(),
    ...verbQuestions(),
    ...adjectiveQuestions(),
    ...kanaQuestions(),
    ...listeningQuestions(),
    ...authoredQuestions(),
  ].filter((x) => x && x.correct && x.distractors && x.distractors.length >= 1);
  return BANK;
}

/** Section metadata: display name, and the weight used to lay out a full paper. */
const SECTIONS = [
  { id: 'listening-word', name: 'Listening — the word', weight: 7, audio: true },
  { id: 'listening-meaning', name: 'Listening — the meaning', weight: 7, audio: true },
  { id: 'kana', name: 'Hiragana & Katakana', weight: 6 },
  { id: 'vocab-jp-en', name: 'Vocabulary (Japanese → English)', weight: 14 },
  { id: 'vocab-en-jp', name: 'Vocabulary (English → Japanese)', weight: 12 },
  { id: 'kanji-reading', name: 'Kanji readings', weight: 11 },
  { id: 'kanji-meaning', name: 'Kanji meanings', weight: 6 },
  { id: 'kanji-writing', name: 'Kanji writing', weight: 7 },
  { id: 'verb-class', name: 'Verb classes', weight: 4 },
  { id: 'verb-conjugation', name: 'Verb conjugation', weight: 14 },
  { id: 'adjective', name: 'Adjectives', weight: 8 },
  { id: 'particle', name: 'Particles', weight: 8 },
  { id: 'grammar', name: 'Grammar patterns', weight: 14 },
  { id: 'counter', name: 'Numbers, counters & time', weight: 6 },
  { id: 'translation', name: 'Sentence translation', weight: 7 },
];

/**
 * Lay out an exam: sample each section in proportion to its weight, spreading
 * the picks evenly over the requested lessons so no lesson dominates.
 */
function buildExam({
  size = 250,
  books = null,
  lessons = null,
  sections = null,
  seed = null,
} = {}) {
  const bank = buildBank();
  const usedSeed = seed || `exam-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const rng = makeRng(usedSeed);

  const wantSections = SECTIONS.filter(
    (s) => !sections || sections.includes(s.id)
  );

  // A book selection is just shorthand for its lessons; an explicit lesson list
  // wins where both are given.
  let wantLessons = lessons;
  if ((!wantLessons || !wantLessons.length) && books && books.length) {
    wantLessons = BOOKS.filter((b) => books.map(Number).includes(b.id)).flatMap(
      (b) => b.lessons
    );
  }
  const lessonSet =
    wantLessons && wantLessons.length ? new Set(wantLessons.map(Number)) : null;

  // Greetings is lesson 0 and is selectable like any other lesson, so it must
  // be excluded when the caller leaves it out.
  const inScope = (x) =>
    wantSections.some((s) => s.id === x.section) &&
    (!lessonSet || lessonSet.has(x.lesson));

  const pool = bank.filter(inScope);
  const totalWeight = wantSections.reduce((a, s) => a + s.weight, 0);

  const chosen = [];
  for (const s of wantSections) {
    const target = Math.max(1, Math.round((size * s.weight) / totalWeight));
    const items = pool.filter((x) => x.section === s.id);
    if (!items.length) continue;

    // group by lesson so the sample is spread across the book
    const byLesson = new Map();
    for (const it of items) {
      if (!byLesson.has(it.lesson)) byLesson.set(it.lesson, []);
      byLesson.get(it.lesson).push(it);
    }
    const lessonKeys = shuffle([...byLesson.keys()], rng);
    const buckets = lessonKeys.map((k) => shuffle(byLesson.get(k), rng));

    const take = [];
    let i = 0;
    while (take.length < target) {
      let progressed = false;
      for (const b of buckets) {
        if (take.length >= target) break;
        if (b[i]) {
          take.push(b[i]);
          progressed = true;
        }
      }
      if (!progressed) break;
      i++;
    }
    chosen.push(...take);
  }

  // Present the paper section by section, in the canonical order.
  const order = new Map(SECTIONS.map((s, i) => [s.id, i]));
  chosen.sort((a, b) => order.get(a.section) - order.get(b.section));

  // Freeze the option order now, so scoring is by index and the paper is
  // reproducible from the seed alone.
  const questions = chosen.map((x, idx) => {
    const opts = shuffle([x.correct, ...x.distractors], rng);
    return {
      n: idx + 1,
      id: x.id,
      section: x.section,
      sectionName: (SECTIONS.find((s) => s.id === x.section) || {}).name || x.section,
      lesson: x.lesson,
      book: x.book,
      question: x.question,
      hint: x.hint || null,
      reading: x.reading || null,
      audio: x.audio || null,
      options: opts,
      answerIndex: opts.indexOf(x.correct),
      explain: x.explain,
      ref: x.ref || null,
    };
  });

  return {
    seed: usedSeed,
    createdAt: new Date().toISOString(),
    size: questions.length,
    requestedSize: size,
    books: books || BOOKS.map((b) => b.id),
    lessons: wantLessons && wantLessons.length ? wantLessons : 'all',
    sections: wantSections.map((s) => s.id),
    questions,
  };
}

function bankStats() {
  const bank = buildBank();
  const bySection = {};
  const byLesson = {};
  const byBook = {};
  // per-book section counts, so the UI can grey out what a book has none of
  const bySectionBook = {};
  for (const x of bank) {
    bySection[x.section] = (bySection[x.section] || 0) + 1;
    byLesson[x.lesson] = (byLesson[x.lesson] || 0) + 1;
    byBook[x.book] = (byBook[x.book] || 0) + 1;
    bySectionBook[x.book] = bySectionBook[x.book] || {};
    bySectionBook[x.book][x.section] = (bySectionBook[x.book][x.section] || 0) + 1;
  }
  return { total: bank.length, bySection, byLesson, byBook, bySectionBook };
}

module.exports = {
  buildBank,
  buildExam,
  bankStats,
  SECTIONS,
  BOOKS,
  bookOf,
  makeRng,
  shuffle,
};
