// Typed-answer checking for the kanji SRS, against real catalog items.
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../../public/kanji/answer.js');
const { getCatalog } = require('../../src/srs/catalog');

const cat = getCatalog();
const known = A.knownCoresOf(cat.items);
const item = (id) => {
  const it = cat.byId.get(id);
  assert.ok(it, `catalog has ${id}`);
  return it;
};
const meaning = (id, answer) => A.checkMeaning(answer, item(id).meanings, known).verdict;
const reading = (id, answer) => A.checkReading(answer, item(id).readings).verdict;

test('meaning: normalisation', () => {
  assert.equal(meaning('k:食', 'eat'), 'correct');
  assert.equal(meaning('k:食', 'To Eat!'), 'correct');
  assert.equal(meaning('k:食', 'drink'), 'wrong');
  assert.equal(meaning('v:大学', 'college'), 'correct');
  assert.equal(meaning('v:父', 'father'), 'correct', '"(my) father" without the parenthesis');
  assert.equal(meaning('v:感動する', 'moved'), 'correct', '"to be moved" without "to be"');
});

test('meaning: typos forgiven, but not a typo that is another real answer', () => {
  assert.equal(meaning('v:大学', 'univercity'), 'correct');
  assert.equal(meaning('k:右', 'rigth'), 'correct', 'transposition counts as one edit');
  assert.equal(meaning('k:右', 'night'), 'wrong', '"night" is 夜, not a typo of "right"');
  assert.equal(meaning('k:回', 'time'), 'wrong', '"time" is 時');
  assert.equal(meaning('k:犬', 'dig'), 'wrong', 'short words get no tolerance');
});

test('meaning: numbers', () => {
  assert.equal(meaning('k:百', '100'), 'correct');
  assert.equal(meaning('k:万', '10,000'), 'correct');
  assert.equal(meaning('v:三百', 'three hundred'), 'correct');
  assert.equal(meaning('v:三百', '30'), 'wrong', 'numbers must be exact');
  assert.equal(meaning('v:一時', 'one oclock'), 'correct', 'apostrophes do not matter');
});

test('meaning: slashes, nested parentheses, keigo', () => {
  assert.equal(meaning('v:二台', 'two machines'), 'correct');
  assert.equal(meaning('k:様', 'Ms.'), 'correct');
  assert.equal(meaning('v:お子さん', 'your child'), 'correct');
  assert.equal(meaning('v:お子さん', 'their child'), 'wrong');
  assert.equal(meaning('v:作品', 'work'), 'correct', 'comma inside parentheses does not split');
  assert.equal(meaning('v:下さる', 'give me'), 'correct', 'keigo resolved to the plain verb');
});

test('meaning: kana or nothing is invalid, not wrong', () => {
  assert.equal(meaning('k:食', 'たべる'), 'invalid');
  assert.equal(meaning('k:食', '  '), 'invalid');
});

test('reading', () => {
  assert.equal(reading('k:食', 'しょく'), 'correct');
  assert.equal(reading('k:食', 'たべる'), 'correct', 'kun + okurigana');
  assert.equal(reading('v:大学', 'ダイガク'), 'correct', 'katakana = hiragana');
  assert.equal(reading('v:大学', 'たいがく'), 'wrong');
  assert.equal(reading('v:大学', 'daigak'), 'invalid', 'unconverted romaji');
  assert.equal(reading('v:大学', '大学'), 'invalid');
  assert.equal(reading('v:一日', 'ついたち'), 'correct');
  assert.equal(reading('v:一日', 'いちにち'), 'correct');
  assert.equal(reading('v:何も', 'なにも'), 'correct', 'no "+ negative" in the reading');
});

test('reading: katakana long vowels can be typed out', () => {
  const it = cat.items.find((i) => i.readings.some((r) => r.includes('ー')));
  const r = it.readings.find((x) => x.includes('ー'));
  const forms = [...A.readingForms(r)];
  assert.ok(forms.length > 1, forms.join(' '));
  for (const f of forms) assert.equal(A.checkReading(f, it.readings).verdict, 'correct', f);
});

test('every item is answerable and accepts its own printed answers', () => {
  const jp = /[぀-ヿ一-龯]/;
  for (const it of cat.items) {
    const typeable = [...A.meaningVariants(it.meanings)].filter((v) => /^[a-z0-9 -]+$/.test(v));
    assert.ok(typeable.length, `${it.id} has an English meaning you can type`);
    for (const m of it.meanings.filter((x) => !jp.test(x))) {
      assert.equal(A.checkMeaning(m, it.meanings, known).verdict, 'correct', `${it.id} "${m}"`);
    }
    for (const r of it.readings) {
      assert.equal(A.checkReading(r, it.readings).verdict, 'correct', `${it.id} ${r}`);
    }
  }
});
