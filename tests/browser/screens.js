/**
 * Screenshots of every main screen in light, dark and phone layouts, for a
 * visual check after UI changes. Seeds a little progress first so the
 * dashboard, reviews and item pages have something to show.
 *
 *   npm run screens            → tests/browser/shots/screen-*.png
 *   npm run screens -- kanji   → only screens whose name contains "kanji"
 */
const { isolate, startApp } = require('../helpers');
isolate('academy-screens'); // before the server starts: a throwaway database

const path = require('path');
const fs = require('fs');
const { launch, watch, SHOTS } = require('./browser');

const FILTER = process.argv[2] || '';

const SCREENS = [
  ['home', '/'],
  ['kanji-dashboard', '/kanji.html#/'],
  ['kanji-lessons', '/kanji.html#/lessons'],
  ['kanji-lesson-screen', '/kanji.html#/lessons', async (page) => {
    await page.click('text=/^Start \\d+ lesson/');
    await page.waitForSelector('.lband');
  }],
  ['kanji-review', '/kanji.html#/reviews', async (page) => page.waitForSelector('.session')],
  ['kanji-practice', '/kanji.html#/practice'],
  ['kanji-browse', '/kanji.html#/browse'],
  ['kanji-item', '/kanji.html#/item/k%3A%E5%A4%A7'],
  ['exam', '/exam.html'],
];

const VARIANTS = [
  ['light', { viewport: { width: 1200, height: 900 }, colorScheme: 'light' }],
  ['dark', { viewport: { width: 1200, height: 900 }, colorScheme: 'dark' }],
  ['phone', { viewport: { width: 390, height: 844 }, colorScheme: 'light', deviceScaleFactor: 2, isMobile: true, hasTouch: true }],
];

(async () => {
  const app = await startApp();
  // some progress: 大 and 学 learned, one of them due, so every screen has content
  const post = (u, b) => fetch(app.base + u, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) });
  for (const id of ['k:一', 'k:二', 'k:大', 'k:学', 'v:大学']) await post('/api/kanji/learn', { id });
  app.makeDue(['k:大', 'k:学']);

  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await launch();
  const problems = [];
  for (const [variant, opts] of VARIANTS) {
    const page = await (await browser.newContext(opts)).newPage();
    const errors = watch(page);
    for (const [name, url, prep] of SCREENS) {
      if (FILTER && !name.includes(FILTER)) continue;
      await page.goto(app.base + url);
      await page.waitForLoadState('networkidle');
      if (prep) await prep(page);
      await page.mouse.move(0, 0); // no hover left over from an earlier click
      await page.waitForTimeout(150);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (overflow > 0) problems.push(`${variant}/${name}: ${overflow}px horizontal overflow`);
      const file = path.join(SHOTS, `screen-${name}-${variant}.png`);
      // Edge garbles full-page shots taller than ~16k device pixels: keep the top part
      const { height, dpr } = await page.evaluate(() => ({ height: document.documentElement.scrollHeight, dpr: devicePixelRatio }));
      const limit = Math.floor(16000 / dpr);
      const clip = height > limit ? { x: 0, y: 0, width: page.viewportSize().width, height: limit } : undefined;
      await page.screenshot({ path: file, fullPage: true, clip });
      console.log(`saved ${path.relative(process.cwd(), file)}${clip ? `  (top ${limit} of ${height} px)` : ''}`);
    }
    problems.push(...errors.map((e) => `${variant}: ${e}`));
  }
  await browser.close();
  await app.close();
  console.log(problems.length ? `\nPROBLEMS:\n  ${problems.join('\n  ')}` : '\nno overflow, no page errors');
  process.exit(problems.length ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
