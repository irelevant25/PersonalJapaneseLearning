/**
 * The app in a real browser, the way a person uses it:
 *   kanji  lessons → quiz (romaji typed, one miss on purpose) → reviews (clock
 *          moved) → practice (+ "My answer was right") → item page → browse
 *   exam   a 40-question listening paper, answered, scored, reported
 *
 * Runs the real server against a throwaway database — your own database and
 * backups are never touched.   npm run test:browser
 */
const { isolate, startApp, ROOT } = require('../helpers');
isolate('academy-browser'); // before the server starts: a throwaway database

const path = require('path');
const fs = require('fs');
const wk = require(path.join(ROOT, 'public', 'vendor', 'wanakana.min.js'));
const { launch, watch, reporter, SHOTS } = require('./browser');

(async () => {
  const app = await startApp();
  const { ck, fails } = reporter();
  const browser = await launch();
  fs.mkdirSync(SHOTS, { recursive: true });

  const cat = await (await fetch(app.base + '/api/kanji/catalog')).json();
  const byChars = {};
  for (const it of cat.items) (byChars[it.chars] = byChars[it.chars] || []).push(it);

  const page = await (await browser.newContext({ viewport: { width: 1100, height: 860 } })).newPage();
  // /learn and /review may answer 409 by design (e.g. a double submit)
  const errors = watch(page, { ignore: [/\/api\/kanji\/(learn|review)/] });
  const shot = (name, fullPage = false) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage });

  async function card() {
    const chars = await page.textContent('.s-chars');
    const isKanji = await page.$eval('.s-card', (el) => el.classList.contains('t-kanji'));
    const part = await page.$eval('.s-q', (el) => (el.classList.contains('reading') ? 'reading' : 'meaning'));
    const it = (byChars[chars] || []).find((x) => x.type === (isKanji ? 'kanji' : 'vocab'));
    return { chars, part, it };
  }
  async function answer({ wrong = false } = {}) {
    const c = await card();
    let text;
    if (c.part === 'meaning') text = wrong ? 'zebra' : c.it.meanings[0].replace(/\(.*?\)/g, '').trim();
    else text = wrong ? (wk.toRomaji(c.it.readings[0]) === 'ken' ? 'mizu' : 'ken') : wk.toRomaji(c.it.readings[0]);
    await page.click('.s-input');
    await page.keyboard.type(text, { delay: 5 });
    await page.keyboard.press('Enter');
    await page.waitForTimeout(80);
    const shown = await page.inputValue('.s-input');
    const cls = await page.$eval('.session', (el) => el.className);
    return { ...c, typed: text, shown, verdict: cls.includes('is-wrong') ? 'wrong' : cls.includes('is-correct') ? 'correct' : 'none' };
  }
  const next = async () => {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(100);
  };
  const inSession = async () => (await page.$('.session')) !== null;
  // a real load every time: going to the same URL (hash included) would not reload the page
  const open = async (url) => {
    await page.goto('about:blank');
    await page.goto(app.base + url);
  };

  /* ---------------------------------------------------------- lessons */
  console.log('kanji: lessons');
  await open('/kanji.html#/');
  await page.waitForSelector('.cards3');
  await shot('dashboard-empty', true);
  await page.click('text=/^Learn \\d+ items?$/');
  await page.waitForSelector('.lband');
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(30);
  }
  await page.waitForSelector('.mode-lesson');
  let n = 0;
  let missed = false;
  let kana = null;
  while ((await inSession()) && n < 40) {
    const r = await answer({ wrong: n === 1 });
    if (n === 1) {
      missed = r.verdict === 'wrong';
      await shot('quiz-wrong');
    } else if (r.verdict !== 'correct') ck(`right answer accepted: ${r.chars} ${r.part}`, false, `${r.typed} → ${r.shown}`);
    if (r.part === 'reading' && r.verdict === 'correct' && !kana) kana = r;
    await next();
    n++;
  }
  ck('a deliberate miss turns the card red', missed);
  ck('romaji becomes kana', kana && /^[\u3040-\u30ff]+$/.test(kana.shown), kana && `${kana.typed} → ${kana.shown}`);
  ck('quiz: 5 items × 2 halves + 1 retry', n === 11, `${n} answers`);
  await page.waitForSelector('h1.page');
  ck('summary: 5 learned', /learned 5 item/.test(await page.textContent('.lead')));
  // The lesson ran over the dashboard, so the address is still #/, the same as
  // the Dashboard link's: clicking it must still bring the dashboard back.
  await page.click('.subnav a[data-route=""]');
  ck('the Dashboard link works after a lesson started there',
    await page.waitForSelector('.cards3', { timeout: 3000 }).then(() => true, () => false));
  let p = await (await fetch(app.base + '/api/kanji/progress')).json();
  const learned = Object.keys(p.items).filter((id) => p.items[id].stage === 1);
  ck('server: 5 items at Apprentice I', learned.length === 5, learned.join(' '));

  /* ---------------------------------------------------------- reviews */
  console.log('kanji: reviews');
  app.makeDue(learned);
  await open('/kanji.html#/');
  await page.waitForSelector('.cards3');
  ck('dashboard shows 5 due', (await page.textContent('.c-reviews .bc-num')).trim() === '5');
  await page.click('text=Start reviews');
  await page.waitForSelector('.mode-review');
  n = 0;
  let missedChars = null;
  while ((await inSession()) && n < 40) {
    const c = await card();
    const r = await answer({ wrong: !missedChars && c.part === 'reading' });
    if (!missedChars && c.part === 'reading') missedChars = r.chars;
    if (n === 0) await shot('review');
    await next();
    n++;
  }
  await page.waitForSelector('h1.page');
  await shot('review-summary', true);
  p = await (await fetch(app.base + '/api/kanji/progress')).json();
  const stages = learned.map((id) => p.items[id].stage);
  ck('4 clean reviews → Apprentice II, the missed one stays', stages.filter((s) => s === 2).length === 4 && stages.filter((s) => s === 1).length === 1, stages.join(','));
  ck('summary shows the moves', /Apprentice I → Apprentice II/.test(await page.textContent('main')));

  /* --------------------------------------------------------- practice */
  console.log('kanji: practice');
  const before = JSON.parse(JSON.stringify(p.items));
  await open('/kanji.html#/practice');
  await page.waitForSelector('text=/^Practise \\d+/');
  await page.click('text=/^Practise \\d+/');
  await page.waitForSelector('.mode-practice');
  n = 0;
  let accepted = null;
  while ((await inSession()) && n < 40) {
    const c = await card();
    if (!accepted && c.part === 'meaning') {
      await page.click('.s-input');
      await page.keyboard.type('numero uno');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(80);
      await page.click('text=My answer was right');
      await page.waitForTimeout(150);
      ck('"My answer was right" turns it green', (await page.$eval('.session', (el) => el.className)).includes('is-correct'));
      accepted = c.it.id;
    } else {
      await answer();
    }
    await next();
    n++;
  }
  await page.waitForSelector('h1.page');
  p = await (await fetch(app.base + '/api/kanji/progress')).json();
  const moved = Object.keys(before).filter((id) => before[id].stage !== p.items[id].stage || before[id].nextReview !== p.items[id].nextReview);
  ck('practice changed no stage or review time', moved.length === 0, moved.join(' '));
  ck('the accepted answer is now a synonym', (p.items[accepted].synonyms || []).includes('numero uno'));
  // the session ran at #/practice, the same address as this link
  await page.click('text=New practice');
  ck('"New practice" works after a practice session',
    await page.waitForSelector('text=/^Practise \\d+/', { timeout: 3000 }).then(() => true, () => false));

  await open(`/kanji.html#/item/${encodeURIComponent(accepted)}`);
  await page.waitForSelector('.ihead');
  ck('item page shows the synonym', (await page.textContent('main')).includes('numero uno'));

  // A slow save (Windows can hold a file for seconds) must not bring the summary
  // back over the screen the learner moved on to while it was saving.
  await page.route('**/api/kanji/practice', async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.click('text=Practise it now');
  await page.waitForSelector('.mode-practice');
  for (let i = 0; i < 6 && (await page.textContent('.s-feedback')) !== 'Saving…'; i++) {
    await answer();
    await next();
  }
  ck('the finished practice is still saving', (await page.textContent('.s-feedback')) === 'Saving…');
  await page.click('.subnav a[data-route=""]');
  await page.waitForSelector('.cards3');
  await page.waitForTimeout(2500); // the save lands meanwhile
  ck('a late save leaves the dashboard alone',
    (await page.$('.cards3')) !== null && !/Practice done/.test(await page.textContent('main')));
  await page.unroute('**/api/kanji/practice');
  await open('/kanji.html#/browse');
  await page.waitForSelector('.bgrid');
  await page.fill('input[type=text]', 'ichi');
  await page.waitForTimeout(150);
  ck('browse finds 一 by romaji', (await page.$$eval('.bgrid .tc', (els) => els.map((e) => e.textContent))).includes('一'));

  /* ------------------------------------------------------------- exam */
  console.log('exam');
  const audio = [];
  page.on('response', (r) => {
    if (r.url().includes('/audio/')) audio.push(`${r.status()} ${r.headers()['content-type']}`);
  });
  await open('/exam.html');
  await page.waitForSelector('#bookChips .chip');
  await page.click('[data-size="40"]');
  await page.click('summary');
  for (const b of await page.$$('#sectionChips .chip')) {
    const id = await b.getAttribute('data-section');
    const on = (await b.getAttribute('class')).includes('is-on');
    if (on !== id.startsWith('listening')) await b.click();
  }
  await page.click('#startBtn');
  await page.waitForSelector('#test:not([hidden])');
  const total = Number((await page.textContent('#counter')).split('/')[1]);
  for (let i = 0; i < total; i++) {
    await page.keyboard.press('1');
    await page.waitForTimeout(220);
  }
  page.on('dialog', (d) => d.accept());
  await page.click('#quitBtn');
  await page.waitForSelector('#result:not([hidden])', { timeout: 15000 });
  ck('exam scored', /%/.test(await page.textContent('#verdict')));
  // browsers fetch audio with Range headers, so 206 Partial Content is the normal answer
  ck('recordings stream', audio.length > 0 && audio.every((x) => /^20[06] audio\/mpeg/.test(x)), `${audio.length} clip(s)`);
  const rep = await page.request.get(app.base + (await page.getAttribute('#reportLink', 'href')));
  ck('report opens', rep.status() === 200);

  ck('no browser errors', errors.length === 0, errors.join(' | '));
  await browser.close();
  await app.close();
  console.log(`\n${fails() ? fails() + ' FAILURE(S)' : 'BROWSER SUITE PASSED'}  (screenshots: ${SHOTS})`);
  process.exit(fails() ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
