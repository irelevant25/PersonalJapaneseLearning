// What a word is spoken as, and the audio builder, with a fake voice in temp
// folders: nothing is sent to Google and data/audio is never touched.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spoken } = require('../../src/speech');
const { build, requestFor, VOICES } = require('../../src/build-audio');

test('spoken: optional parts, notes and punctuation go; the kanji spelling stays', () => {
  const s = (kana, kanji = null) => {
    const r = spoken(kana, kanji);
    return r && `${r.text}|${r.reading}`;
  };
  assert.equal(s('いじわる(な)', '意地悪'), '意地悪|いじわる');
  assert.equal(s('いもうと(さん)', '妹(さん)'), '妹|いもうと');
  assert.equal(s('おかえり(なさい)'), 'おかえり|おかえり');
  assert.equal(s('ください(〜を)'), 'ください|ください');
  assert.equal(s('あまり + negative'), 'あまり|あまり');
  assert.equal(s('おはよう ございます。'), 'おはようございます|おはようございます');
  assert.equal(s('いりぐち', '入り口/入口'), '入り口|いりぐち', 'the first spelling');
  assert.equal(s('ほ(う)っておく', '放っておく'), '放っておく|ほうっておく', 'brackets inside a word are part of it');
  assert.equal(s('そんなこと(は)ない'), 'そんなことはない|そんなことはない');
  assert.equal(s('かける(かぎを)', 'かける(鍵を)'), '鍵をかける|かぎをかける', 'a phrase is spoken whole');
  assert.equal(s('いう(もんくを)', '言う(文句を)'), '文句を言う|もんくをいう');
  assert.equal(s('〜えん', '〜円'), null, 'a suffix is not a word');
  assert.equal(s('〜か〜'), null);
  assert.equal(s('Tシャツ'), null, 'letters are not voiced');
});

test('requests: kana as text, a kanji word with its reading as yomigana', () => {
  const kana = requestFor({ text: 'ねこ', reading: 'ねこ' }, VOICES[0]);
  assert.deepEqual(kana.input, { text: 'ねこ' });
  assert.equal(kana.voice.name, VOICES[0].name);
  assert.equal(kana.audioConfig.audioEncoding, 'MP3');
  const kanji = requestFor({ text: '今日', reading: 'きょう' }, VOICES[1]);
  assert.equal(kanji.input.ssml, '<speak><phoneme alphabet="yomigana" ph="きょう">今日</phoneme></speak>');
  assert.match(requestFor({ text: 'A&B', reading: 'えい' }, VOICES[0]).input.ssml, /A&#38;B/);
});

function sandbox() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'academy-audio-'));
  const dir = path.join(base, 'audio');
  const indexFile = path.join(base, 'audio.json');
  const sent = [];
  const synth = async (req) => {
    sent.push(req);
    return Buffer.from(`mp3 ${JSON.stringify(req.input)} ${req.voice.name}`);
  };
  const run = (words, opts = {}) => build({ words, dir, indexFile, synth, log: () => {}, ...opts });
  const index = () => JSON.parse(fs.readFileSync(indexFile, 'utf8'));
  const files = () => fs.readdirSync(dir).sort();
  return { base, dir, indexFile, sent, run, index, files };
}

const W = (text, reading = text) => ({ text, reading, key: `${text}|${reading}` });

test('build: each word once per voice, then only what is missing', async () => {
  const sb = sandbox();
  try {
    const words = [W('ねこ'), W('今日', 'きょう'), W('大学', 'だいがく')];
    let r = await sb.run(words);
    assert.equal(r.made, words.length * VOICES.length);
    assert.equal(sb.sent.length, 6);
    const idx = sb.index();
    assert.deepEqual(idx.voices, VOICES);
    for (const w of words) {
      const c = idx.clips[w.key];
      assert.deepEqual(Object.keys(c).sort(), VOICES.map((v) => v.id).sort(), w.key);
      for (const f of Object.values(c)) {
        assert.match(f, /^[0-9a-f]{16}\.mp3$/, 'a random name that gives nothing away');
        assert.ok(fs.existsSync(path.join(sb.dir, f)));
      }
    }
    assert.equal(sb.files().length, 6);

    // A second run sends nothing.
    r = await sb.run(words);
    assert.equal(r.made, 0);
    assert.equal(sb.sent.length, 6);

    // A word leaves the list and another joins: one new word is voiced, and the
    // clips of the old one are removed.
    const gone = Object.values(sb.index().clips['ねこ|ねこ']);
    r = await sb.run([W('いぬ'), W('今日', 'きょう'), W('大学', 'だいがく')]);
    assert.equal(r.made, 2);
    assert.equal(r.removed, 2);
    assert.ok(gone.every((f) => !sb.files().includes(f)));
    assert.equal(sb.files().length, 6);
  } finally {
    fs.rmSync(sb.base, { recursive: true, force: true });
  }
});

test('build: a failed request keeps every clip made so far and deletes nothing', async () => {
  const sb = sandbox();
  try {
    await sb.run([W('ねこ')]);
    let calls = 0;
    const flaky = async (req) => {
      if (++calls > 3) throw new Error('quota');
      return Buffer.from(`mp3 ${req.voice.name}`);
    };
    await assert.rejects(
      sb.run([W('ねこ'), W('いぬ'), W('とり'), W('さかな')], { synth: flaky }),
      /quota/
    );
    const idx = sb.index();
    const listed = Object.values(idx.clips).flatMap((c) => Object.values(c));
    assert.equal(listed.length, 2 + 3, 'the old word, plus the three clips made before the failure');
    assert.deepEqual(listed.sort(), sb.files(), 'every file is listed, every listed file exists');
  } finally {
    fs.rmSync(sb.base, { recursive: true, force: true });
  }
});

test('build: a recipe or voice change remakes clips; a --limit run leaves the rest to do', async () => {
  const sb = sandbox();
  try {
    const words = [W('ねこ'), W('いぬ'), W('とり')];
    await sb.run(words, { recipe: 'r1' });
    let r = await sb.run(words, { recipe: 'r2', limit: 1 });
    assert.equal(r.made, 1);
    assert.equal(r.removed, 0, 'nothing is deleted after a partial run');
    r = await sb.run(words, { recipe: 'r2' });
    assert.equal(r.made, 5, 'the other five are still outdated');
    assert.equal(r.removed, 6, 'every r1 clip goes once all are replaced');
    assert.equal((await sb.run(words, { recipe: 'r2' })).made, 0);
    const renamed = [VOICES[0], { ...VOICES[1], name: 'another-voice' }];
    r = await sb.run(words, { recipe: 'r2', voices: renamed });
    assert.equal(r.made, 3, 'only the voice that changed');
    assert.deepEqual(sb.files(), Object.keys(sb.index().made).sort(), 'every clip is stamped, every stamp is a clip');
  } finally {
    fs.rmSync(sb.base, { recursive: true, force: true });
  }
});

test('build: an unreadable index stops the build and deletes nothing', async () => {
  const sb = sandbox();
  try {
    await sb.run([W('ねこ')]);
    fs.writeFileSync(sb.indexFile, '<<<<<<< a merge conflict');
    await assert.rejects(sb.run([W('ねこ')]), /unreadable/);
    assert.equal(sb.files().length, 2, 'the clips are still there');
    assert.equal(sb.sent.length, 2, 'nothing more was sent');
  } finally {
    fs.rmSync(sb.base, { recursive: true, force: true });
  }
});

test('build: a word Google refuses is skipped, and the others are still made', async () => {
  const sb = sandbox();
  try {
    const refuse = async (req) => {
      if (JSON.stringify(req.input).includes('とり')) {
        const e = new Error('Text-to-Speech answered 400: bad input');
        e.status = 400;
        throw e;
      }
      return Buffer.from('mp3');
    };
    const r = await sb.run([W('ねこ'), W('とり'), W('いぬ')], { synth: refuse });
    assert.equal(r.made, 4);
    assert.equal(r.skipped.length, 2);
    assert.deepEqual(sb.index().clips['とり|とり'], {});
  } finally {
    fs.rmSync(sb.base, { recursive: true, force: true });
  }
});

test('build: a stop request ends the run cleanly, with every clip made so far listed', async () => {
  const sb = sandbox();
  try {
    const words = ['ねこ', 'いぬ', 'とり', 'うま', 'さる'].map((w) => W(w));
    const r = await sb.run(words, { shouldStop: () => sb.sent.length >= 3 });
    assert.equal(r.stopped, true);
    assert.equal(r.made, 3);
    assert.equal(r.removed, 0);
    const listed = Object.values(sb.index().clips).flatMap((c) => Object.values(c));
    assert.deepEqual(listed.sort(), sb.files());
    assert.equal((await sb.run(words)).made, 7, 'the next run makes only the rest');
  } finally {
    fs.rmSync(sb.base, { recursive: true, force: true });
  }
});

test('build: a dry run sends and writes nothing', async () => {
  const sb = sandbox();
  try {
    const r = await sb.run([W('ねこ'), W('今日', 'きょう')], { dryRun: true });
    assert.equal(r.todo, 4);
    assert.ok(r.chars > 0);
    assert.equal(sb.sent.length, 0);
    assert.ok(!fs.existsSync(path.join(sb.base, 'audio.json')));
    assert.ok(!fs.existsSync(sb.dir));
  } finally {
    fs.rmSync(sb.base, { recursive: true, force: true });
  }
});
