// The conjugation engine against both Conjugation Charts, cell by cell.
const test = require('node:test');
const assert = require('node:assert/strict');
const { conjugateVerb, conjugateAdj, wrongVerbForms } = require('../../src/conjugate');

// books/textbook-1.pdf, printed p.382: dictionary, class, ます, て, short past, short neg, short past neg
const CHART_1 = [
  ['する', 'irr', 'します', 'して', 'した', 'しない', 'しなかった'],
  ['くる', 'irr', 'きます', 'きて', 'きた', 'こない', 'こなかった'],
  ['たべる', 'ru', 'たべます', 'たべて', 'たべた', 'たべない', 'たべなかった'],
  ['かう', 'u', 'かいます', 'かって', 'かった', 'かわない', 'かわなかった'],
  ['まつ', 'u', 'まちます', 'まって', 'まった', 'またない', 'またなかった'],
  ['とる', 'u', 'とります', 'とって', 'とった', 'とらない', 'とらなかった'],
  ['ある', 'u', 'あります', 'あって', 'あった', 'ない', 'なかった'],
  ['よむ', 'u', 'よみます', 'よんで', 'よんだ', 'よまない', 'よまなかった'],
  ['あそぶ', 'u', 'あそびます', 'あそんで', 'あそんだ', 'あそばない', 'あそばなかった'],
  ['しぬ', 'u', 'しにます', 'しんで', 'しんだ', 'しなない', 'しななかった'],
  ['かく', 'u', 'かきます', 'かいて', 'かいた', 'かかない', 'かかなかった'],
  ['いく', 'u', 'いきます', 'いって', 'いった', 'いかない', 'いかなかった'],
  ['いそぐ', 'u', 'いそぎます', 'いそいで', 'いそいだ', 'いそがない', 'いそがなかった'],
  ['はなす', 'u', 'はなします', 'はなして', 'はなした', 'はなさない', 'はなさなかった'],
];

// books/textbook-2.pdf, printed p.389: potential, volitional, ば, passive, causative, causative-passive
const CHART_2 = [
  ['する', 'irr', 'できる', 'しよう', 'すれば', 'される', 'させる', 'させられる'],
  ['くる', 'irr', 'こられる', 'こよう', 'くれば', 'こられる', 'こさせる', 'こさせられる'],
  ['たべる', 'ru', 'たべられる', 'たべよう', 'たべれば', 'たべられる', 'たべさせる', 'たべさせられる'],
  ['かう', 'u', 'かえる', 'かおう', 'かえば', 'かわれる', 'かわせる', 'かわされる'],
  ['まつ', 'u', 'まてる', 'まとう', 'まてば', 'またれる', 'またせる', 'またされる'],
  ['とる', 'u', 'とれる', 'とろう', 'とれば', 'とられる', 'とらせる', 'とらされる'],
  ['ある', 'u', 'あれる', 'あろう', 'あれば', 'あられる', 'あらせる', 'あらされる'],
  ['よむ', 'u', 'よめる', 'よもう', 'よめば', 'よまれる', 'よませる', 'よまされる'],
  ['あそぶ', 'u', 'あそべる', 'あそぼう', 'あそべば', 'あそばれる', 'あそばせる', 'あそばされる'],
  ['しぬ', 'u', 'しねる', 'しのう', 'しねば', 'しなれる', 'しなせる', 'しなされる'],
  ['かく', 'u', 'かける', 'かこう', 'かけば', 'かかれる', 'かかせる', 'かかされる'],
  ['いく', 'u', 'いける', 'いこう', 'いけば', 'いかれる', 'いかせる', 'いかされる'],
  ['いそぐ', 'u', 'いそげる', 'いそごう', 'いそげば', 'いそがれる', 'いそがせる', 'いそがされる'],
  ['はなす', 'u', 'はなせる', 'はなそう', 'はなせば', 'はなされる', 'はなさせる', 'はなさせられる'],
];

test('Part 1 conjugation chart — all 70 cells', () => {
  for (const [dict, cls, ...exp] of CHART_1) {
    const f = conjugateVerb(dict, cls);
    assert.deepEqual([f.masu, f.te, f.shortPast, f.shortNeg, f.shortPastNeg], exp, dict);
  }
});

test('Part 2 conjugation chart — all 84 cells', () => {
  for (const [dict, cls, ...exp] of CHART_2) {
    const f = conjugateVerb(dict, cls);
    assert.deepEqual(
      [f.potential, f.volitional, f.ba, f.passive, f.causative, f.causativePassive],
      exp,
      dict
    );
  }
});

test('つくる / おくる are u-verbs despite ending in くる', () => {
  assert.equal(conjugateVerb('つくる', 'u').masu, 'つくります');
  assert.equal(conjugateVerb('おくる', 'u').te, 'おくって');
});

test('kanji orthography is kept', () => {
  assert.equal(conjugateVerb('食べる', 'ru').masu, '食べます');
  assert.equal(conjugateVerb('来る', 'irr').shortNeg, '来ない');
  assert.equal(conjugateVerb('勉強する', 'irr').potential, '勉強できる');
  assert.equal(conjugateVerb('行く', 'u').te, '行って');
});

test('the five honorific 〜さる verbs take います', () => {
  for (const [d, m] of [
    ['くださる', 'くださいます'],
    ['下さる', '下さいます'],
    ['いらっしゃる', 'いらっしゃいます'],
    ['おっしゃる', 'おっしゃいます'],
    ['なさる', 'なさいます'],
    ['ござる', 'ございます'],
  ]) {
    assert.equal(conjugateVerb(d, 'u').masu, m);
    assert.ok(wrongVerbForms(d, 'u', 'masu').includes(d.slice(0, -1) + 'ります'), `${d}: regularised form offered as a distractor`);
  }
});

test('adjectives: いい-family irregular, かわいい regular, な-adjectives', () => {
  assert.equal(conjugateAdj('いい', 'i').te, 'よくて');
  assert.equal(conjugateAdj('かっこいい', 'i').pastPolite, 'かっこよかったです');
  assert.equal(conjugateAdj('かわいい', 'i').te, 'かわいくて');
  assert.equal(conjugateAdj('新しい', 'i').negPolite, '新しくないです');
  assert.equal(conjugateAdj('元気(な)', 'na').pastPolite, '元気でした');
  assert.equal(conjugateAdj('いろいろ(な)', 'na').pastNegPolite, 'いろいろじゃなかったです');
});

test('a wrong form never equals the right one', () => {
  for (const [dict, cls] of CHART_1) {
    for (const key of ['masu', 'te', 'shortPast', 'shortNeg', 'potential', 'passive']) {
      const right = conjugateVerb(dict, cls)[key];
      assert.ok(!wrongVerbForms(dict, cls, key).includes(right), `${dict} ${key}`);
    }
  }
});
