/**
 * Verb and adjective conjugation, following the course's first conjugation
 * chart (book 1) and the adjective rules of L5/L7.
 *
 * Every function takes the dictionary form as written in the book (kanji +
 * okurigana, or kana where the book gives no kanji) and returns the same
 * orthography with the ending swapped, so 食べる -> 食べます, かう -> かいます.
 */

/* u-verb endings: [masu-stem, te, ta, nai] keyed by the final kana. */
const U_ENDINGS = {
  う: ['い', 'って', 'った', 'わ'],
  つ: ['ち', 'って', 'った', 'た'],
  る: ['り', 'って', 'った', 'ら'],
  む: ['み', 'んで', 'んだ', 'ま'],
  ぶ: ['び', 'んで', 'んだ', 'ば'],
  ぬ: ['に', 'んで', 'んだ', 'な'],
  く: ['き', 'いて', 'いた', 'か'],
  ぐ: ['ぎ', 'いで', 'いだ', 'が'],
  す: ['し', 'して', 'した', 'さ'],
};

/**
 * The Part 2 conjugation chart (book 2), keyed by the
 * u-verb's final kana: [potential, volitional, ba, passive, causative,
 * causative-passive] — each the ending that replaces the final kana.
 */
const U_ADVANCED = {
  う: ['える', 'おう', 'えば', 'われる', 'わせる', 'わされる'],
  つ: ['てる', 'とう', 'てば', 'たれる', 'たせる', 'たされる'],
  る: ['れる', 'ろう', 'れば', 'られる', 'らせる', 'らされる'],
  む: ['める', 'もう', 'めば', 'まれる', 'ませる', 'まされる'],
  ぶ: ['べる', 'ぼう', 'べば', 'ばれる', 'ばせる', 'ばされる'],
  ぬ: ['ねる', 'のう', 'ねば', 'なれる', 'なせる', 'なされる'],
  く: ['ける', 'こう', 'けば', 'かれる', 'かせる', 'かされる'],
  ぐ: ['げる', 'ごう', 'げば', 'がれる', 'がせる', 'がされる'],
  す: ['せる', 'そう', 'せば', 'される', 'させる', 'させられる'],
};
const ADV_KEYS = [
  'potential',
  'volitional',
  'ba',
  'passive',
  'causative',
  'causativePassive',
];

/**
 * The five keigo u-verbs whose ます-form is irregular (L19–L20):
 * くださる → くださいます, not くださります. The stem loses its final ru and
 * takes い rather than り.
 */
const IRREGULAR_MASU_STEM = {
  くださる: 'くださ', 下さる: '下さ',
  いらっしゃる: 'いらっしゃ',
  おっしゃる: 'おっしゃ',
  なさる: 'なさ',
  ござる: 'ござ',
};

/** いく's て- and た-forms, which the chart stars as exceptions (ある's starred negatives are handled below). */
function exception(dict) {
  if (dict === 'いく' || dict === '行く') {
    const stem = dict.slice(0, -1);
    return { te: stem + 'って', ta: stem + 'った' };
  }
  return null;
}

/**
 * All the forms the course teaches for one verb.
 * @param {string} dict  dictionary form, e.g. 食べる / かう / 勉強する
 * @param {'u'|'ru'|'irr'} cls
 */
function conjugateVerb(dict, cls) {
  const F = {};

  // Only the class decides: つくる and おくる end in くる but are ordinary u-verbs.
  if (cls === 'irr') {
    if (/する$/.test(dict)) {
      const s = dict.slice(0, -2); // 勉強 / '' for bare する
      F.masuStem = s + 'し';
      F.te = s + 'して';
      F.shortPast = s + 'した';
      F.shortNeg = s + 'しない';
      F.shortPastNeg = s + 'しなかった';
    } else {
      const s = dict.replace(/(くる|来る)$/, ''); // もって / つれて / ''
      const kanji = /来る$/.test(dict);
      F.masuStem = s + (kanji ? '来' : 'き');
      F.te = s + (kanji ? '来て' : 'きて');
      F.shortPast = s + (kanji ? '来た' : 'きた');
      F.shortNeg = s + (kanji ? '来ない' : 'こない');
      F.shortPastNeg = s + (kanji ? '来なかった' : 'こなかった');
    }
  } else if (cls === 'ru') {
    const s = dict.slice(0, -1); // drop る
    F.masuStem = s;
    F.te = s + 'て';
    F.shortPast = s + 'た';
    F.shortNeg = s + 'ない';
    F.shortPastNeg = s + 'なかった';
  } else {
    const last = dict.slice(-1);
    const e = U_ENDINGS[last];
    if (!e) return null;
    const s = dict.slice(0, -1);
    const ex = exception(dict);
    F.masuStem = s + e[0];
    F.te = ex ? ex.te : s + e[1];
    F.shortPast = ex ? ex.ta : s + e[2];
    // ある is the chart's other exception: short negative is ない, not あらない.
    if (dict === 'ある') {
      F.shortNeg = 'ない';
      F.shortPastNeg = 'なかった';
    } else {
      F.shortNeg = s + e[3] + 'ない';
      F.shortPastNeg = s + e[3] + 'なかった';
    }
  }

  /* ---- Part 2 forms (the second conjugation chart) ---- */
  if (cls === 'irr') {
    if (/する$/.test(dict)) {
      const s = dict.slice(0, -2);
      F.potential = s + 'できる';
      F.volitional = s + 'しよう';
      F.ba = s + 'すれば';
      F.passive = s + 'される';
      F.causative = s + 'させる';
      F.causativePassive = s + 'させられる';
    } else {
      const s = dict.replace(/(くる|来る)$/, '');
      const k = /来る$/.test(dict);
      F.potential = s + (k ? '来られる' : 'こられる');
      F.volitional = s + (k ? '来よう' : 'こよう');
      F.ba = s + (k ? '来れば' : 'くれば');
      F.passive = s + (k ? '来られる' : 'こられる');
      F.causative = s + (k ? '来させる' : 'こさせる');
      F.causativePassive = s + (k ? '来させられる' : 'こさせられる');
    }
  } else if (cls === 'ru') {
    const s = dict.slice(0, -1);
    F.potential = s + 'られる';
    F.volitional = s + 'よう';
    F.ba = s + 'れば';
    F.passive = s + 'られる';
    F.causative = s + 'させる';
    F.causativePassive = s + 'させられる';
  } else {
    const last = dict.slice(-1);
    const adv = U_ADVANCED[last];
    if (adv) {
      const s = dict.slice(0, -1);
      ADV_KEYS.forEach((k, i) => (F[k] = s + adv[i]));
    }
  }

  // くださる → くださいます (and the four other keigo verbs like it)
  if (IRREGULAR_MASU_STEM[dict]) {
    F.masuStem = IRREGULAR_MASU_STEM[dict] + 'い';
    F.irregularMasu = true;
  }

  F.dict = dict;
  F.masu = F.masuStem + 'ます';
  F.masen = F.masuStem + 'ません';
  F.mashita = F.masuStem + 'ました';
  F.masenDeshita = F.masuStem + 'ませんでした';
  F.masho = F.masuStem + 'ましょう';
  F.tai = F.masuStem + 'たい';
  F.nakute = F.shortNeg.replace(/ない$/, 'なくて');
  F.naide = F.shortNeg + 'で';
  F.tari = F.shortPast + 'り';
  return F;
}

/**
 * The irregular adjectives whose stem becomes よ- : いい and the compounds
 * built on it. かわいい is NOT one of them — it is a single word whose stem is
 * かわい, giving かわいくて, not かわよくて.
 */
const II_IRREGULAR = new Set(['いい', 'かっこいい', 'かっこういい', '格好いい']);

/** The vocabulary list writes な-adjectives as 元気(な); conjugation works on the stem. */
const bareAdj = (w) => String(w).replace(/\(な\)$/, '').replace(/^\s+|\s+$/g, '');

/** The forms Part 1 teaches for い- and な-adjectives. */
function conjugateAdj(rawWord, cls) {
  const word = bareAdj(rawWord);
  const F = { dict: word };
  if (cls === 'i') {
    const isII = II_IRREGULAR.has(word);
    const stem = isII ? word.slice(0, -2) + 'よ' : word.slice(0, -1);
    F.present = word;
    F.presentPolite = word + 'です';
    F.neg = stem + 'くない';
    F.negPolite = stem + 'くないです';
    F.past = stem + 'かった';
    F.pastPolite = stem + 'かったです';
    F.pastNeg = stem + 'くなかった';
    F.pastNegPolite = stem + 'くなかったです';
    F.te = stem + 'くて';
    F.adverb = stem + 'く';
    F.becomes = stem + 'くなる';
  } else {
    const stem = word.replace(/な$/, '');
    F.present = stem + 'だ';
    F.presentPolite = stem + 'です';
    F.neg = stem + 'じゃない';
    F.negPolite = stem + 'じゃないです';
    F.past = stem + 'だった';
    F.pastPolite = stem + 'でした';
    F.pastNeg = stem + 'じゃなかった';
    F.pastNegPolite = stem + 'じゃなかったです';
    F.te = stem + 'で';
    F.adverb = stem + 'に';
    F.becomes = stem + 'になる';
    F.attributive = stem + 'な';
    F.stem = stem;
  }
  return F;
}

/**
 * Wrong-but-plausible forms: conjugate the word as if it belonged to each of
 * the other verb classes. These make far better distractors than random words,
 * because they are exactly the mistakes the conjugation rules invite.
 */
function wrongVerbForms(dict, trueClass, formKey) {
  const out = new Set();
  const correct = conjugateVerb(dict, trueClass);
  const truth = correct && correct[formKey];

  for (const cls of ['u', 'ru', 'irr']) {
    if (cls === trueClass) continue;
    // Treating 座る as irregular would produce 座るきて — not a mistake anyone
    // makes. Only offer the irregular reading when the word could be read that way.
    if (cls === 'irr' && !/(する|くる|来る)$/.test(dict)) continue;
    const f = conjugateVerb(dict, cls);
    if (f && f[formKey] && f[formKey] !== truth) out.add(f[formKey]);
  }

  // くださります / いらっしゃります — the regularised form is the mistake these
  // five verbs actually invite, so offer it.
  if (correct && correct.irregularMasu) {
    const regular = conjugateVerb(dict.slice(0, -1) + 'る', 'u');
    // rebuild with the ordinary り stem
    const plainStem = dict.slice(0, -1) + 'り';
    const map = {
      masu: plainStem + 'ます',
      masen: plainStem + 'ません',
      mashita: plainStem + 'ました',
      masenDeshita: plainStem + 'ませんでした',
      masho: plainStem + 'ましょう',
      tai: plainStem + 'たい',
    };
    if (map[formKey] && map[formKey] !== truth) out.add(map[formKey]);
    void regular;
  }

  // For u-verbs, also mis-apply the other u-verb ending groups.
  if (trueClass === 'u') {
    const last = dict.slice(-1);
    const s = dict.slice(0, -1);
    for (const [end, e] of Object.entries(U_ENDINGS)) {
      if (end === last) continue;
      const fake = conjugateVerb(s + end, 'u');
      if (!fake || !fake[formKey]) continue;
      // graft the wrong ending onto the real stem
      const cand = fake[formKey];
      if (cand !== truth) out.add(cand);
    }
  }
  return [...out].filter(Boolean);
}

function wrongAdjForms(rawWord, trueClass, formKey) {
  const word = bareAdj(rawWord);
  const other = trueClass === 'i' ? 'na' : 'i';
  const out = new Set();
  const truth = conjugateAdj(word, trueClass)[formKey];
  const f = conjugateAdj(word, other);
  if (f && f[formKey] && f[formKey] !== truth) out.add(f[formKey]);

  // Common learner errors: い-adjective treated with です-negation, and the
  // な-adjective past applied to an い-adjective.
  if (trueClass === 'i') {
    const stem = word.slice(0, -1);
    out.add(word + 'じゃないです');
    out.add(word + 'でした');
    out.add(stem + 'くでした');
  } else {
    out.add(word + 'かったです');
    out.add(word + 'くないです');
    out.add(word + 'くて');
  }
  out.delete(truth);
  return [...out].filter(Boolean);
}

module.exports = {
  conjugateVerb,
  conjugateAdj,
  wrongVerbForms,
  wrongAdjForms,
  U_ENDINGS,
};
