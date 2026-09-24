/**
 * /api/kanji — the kanji SRS.
 *
 *   GET  /catalog        every study item (static)
 *   GET  /progress       your SRS state + dashboard summary
 *   GET  /summary        just the summary (for the Academy home page)
 *   POST /learn          { id }                              lesson quiz passed
 *   POST /review         { id, meaningWrong, readingWrong }  scheduled review
 *   POST /practice       { id, firstTryCorrect, wrong }      practice (no SRS change)
 *   POST /item           { id, notes?, addSynonym?, removeSynonym?,
 *                          addReading?, removeReading? }
 *   POST /settings       { batchSize?, lessonTypes?, autoplay? }
 *   POST /reset-item     { id }
 *   POST /reset          { confirm: "RESET" }
 *   GET  /export         download progress/kanji.json
 */
const express = require('express');
const { getCatalog } = require('./catalog');
const srs = require('./srs');
const store = require('./store');

const router = express.Router();

const stateOf = (id) => store.load().items[id] || null;

/** Kanji are always available; vocabulary once all of its kanji are learned. */
function isAvailable(item, items) {
  if (item.type === 'kanji') return true;
  return item.kanji.every((c) => srs.isLearned(items[`k:${c}`]));
}

function summarize(now = Date.now()) {
  const { items } = getCatalog();
  const progress = store.load().items;

  const groups = Object.fromEntries(
    srs.GROUPS.map((g) => [g.id, { total: 0, kanji: 0, vocab: 0 }])
  );
  let lessonsAvailable = 0;
  let reviewsDue = 0;
  let learned = 0;
  let nextReviewAt = null;
  const forecastHours = new Array(24).fill(0);
  const forecastDays = new Array(7).fill(0);
  const byLesson = {};
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  for (const it of items) {
    const st = progress[it.id];
    const L = (byLesson[it.lesson] = byLesson[it.lesson] || {
      kanji: { total: 0, learned: 0, guru: 0 },
      vocab: { total: 0, learned: 0, guru: 0 },
    });
    L[it.type].total += 1;

    if (!srs.isLearned(st)) {
      if (isAvailable(it, progress)) lessonsAvailable += 1;
      continue;
    }
    learned += 1;
    L[it.type].learned += 1;
    if (st.stage >= 5) L[it.type].guru += 1;

    const g = srs.STAGES[st.stage].group;
    groups[g].total += 1;
    groups[g][it.type] += 1;

    if (srs.isDue(st, now)) {
      reviewsDue += 1;
    } else if (st.nextReview) {
      if (nextReviewAt == null || st.nextReview < nextReviewAt) nextReviewAt = st.nextReview;
      const h = Math.floor((st.nextReview - now) / srs.HOUR);
      if (h >= 0 && h < 24) forecastHours[h] += 1;
      const d = Math.floor((st.nextReview - startOfToday.getTime()) / (24 * srs.HOUR));
      if (d >= 0 && d < 7) forecastDays[d] += 1;
    }
  }

  const s = store.load();
  const today = s.daily[store.localDate(now)] || {
    lessons: 0,
    reviews: 0,
    reviewsCorrect: 0,
    practice: 0,
    practiceCorrect: 0,
  };
  const history = Object.keys(s.daily)
    .sort()
    .slice(-14)
    .map((date) => ({ date, ...s.daily[date] }));

  return {
    now,
    total: items.length,
    learned,
    lessonsAvailable,
    reviewsDue,
    nextReviewAt,
    groups,
    forecastHours,
    forecastDays,
    byLesson,
    today,
    history,
  };
}

/* ---------------------------------------------------------------- reads */

router.get('/catalog', (req, res) => {
  const { items, lessons } = getCatalog();
  res.set('Cache-Control', 'no-cache');
  res.json({ items, lessons, stages: srs.STAGES, groups: srs.GROUPS });
});

router.get('/progress', (req, res) => {
  const s = store.load();
  res.json({ settings: s.settings, items: s.items, summary: summarize() });
});

router.get('/summary', (req, res) => res.json(summarize()));

router.get('/export', (req, res) => {
  store.load();
  store.save();
  res.download(store.FILE, `kanji-progress-${store.localDate()}.json`);
});

/* --------------------------------------------------------------- writes */

function itemOr404(req, res) {
  const it = getCatalog().byId.get(String((req.body || {}).id || ''));
  if (!it) {
    res.status(404).json({ error: 'No such item.' });
    return null;
  }
  return it;
}

const count = (v) => Math.max(0, Math.min(50, Math.floor(Number(v) || 0)));

router.post('/learn', (req, res) => {
  const it = itemOr404(req, res);
  if (!it) return;
  const s = store.load();
  if (srs.isLearned(s.items[it.id])) {
    return res.status(409).json({ error: 'Already learned.', state: s.items[it.id] });
  }
  if (!isAvailable(it, s.items)) {
    return res.status(409).json({ error: 'Learn its kanji first.' });
  }
  const now = Date.now();
  s.items[it.id] = srs.learn(s.items[it.id], now);
  store.bumpDaily('lesson', true, now);
  store.save();
  store.log({ kind: 'lesson', id: it.id });
  res.json({ state: s.items[it.id] });
});

router.post('/review', (req, res) => {
  const it = itemOr404(req, res);
  if (!it) return;
  const s = store.load();
  const now = Date.now();
  const st = s.items[it.id];
  // A minute's grace for clock edges; anything else means a double submit.
  if (!srs.isLearned(st) || !srs.isDue(st, now + 60 * 1000)) {
    return res.status(409).json({ error: 'That item is not due for review.', state: st });
  }
  const meaningWrong = count(req.body.meaningWrong);
  const readingWrong = count(req.body.readingWrong);
  const { state, from, to } = srs.review(st, { meaningWrong, readingWrong }, now);
  s.items[it.id] = state;
  store.bumpDaily('review', meaningWrong + readingWrong === 0, now);
  store.save();
  store.log({ kind: 'review', id: it.id, meaningWrong, readingWrong, from, to });
  res.json({ state, from, to });
});

router.post('/practice', (req, res) => {
  const it = itemOr404(req, res);
  if (!it) return;
  const s = store.load();
  if (!srs.isLearned(s.items[it.id])) {
    return res.status(409).json({ error: 'Only learned items can be practised.' });
  }
  const now = Date.now();
  const firstTryCorrect = !!req.body.firstTryCorrect;
  const wrong = count(req.body.wrong);
  s.items[it.id] = srs.practice(s.items[it.id], { firstTryCorrect, wrong }, now);
  store.bumpDaily('practice', firstTryCorrect, now);
  store.save();
  store.log({ kind: 'practice', id: it.id, firstTryCorrect, wrong });
  res.json({ state: s.items[it.id] });
});

const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

router.post('/item', (req, res) => {
  const it = itemOr404(req, res);
  if (!it) return;
  const s = store.load();
  const st = (s.items[it.id] = { ...srs.blank(), ...(s.items[it.id] || {}) });
  const b = req.body || {};

  if (b.notes) {
    if ('meaning' in b.notes) st.notes.meaning = clip(b.notes.meaning, 2000);
    if ('reading' in b.notes) st.notes.reading = clip(b.notes.reading, 2000);
  }
  const addTo = (list, v, n) => {
    const x = clip(v, n).trim();
    if (x && !list.includes(x)) list.push(x);
  };
  if (b.addSynonym) addTo(st.synonyms, b.addSynonym, 80);
  if (b.removeSynonym) st.synonyms = st.synonyms.filter((x) => x !== b.removeSynonym);
  if (b.addReading) addTo(st.extraReadings, b.addReading, 40);
  if (b.removeReading) st.extraReadings = st.extraReadings.filter((x) => x !== b.removeReading);

  store.save();
  res.json({ state: st });
});

router.post('/settings', (req, res) => {
  const s = store.load();
  const b = req.body || {};
  if (b.batchSize != null) s.settings.batchSize = Math.max(1, Math.min(20, Number(b.batchSize) || 5));
  if (['both', 'kanji', 'vocab'].includes(b.lessonTypes)) s.settings.lessonTypes = b.lessonTypes;
  if (b.autoplay != null) s.settings.autoplay = !!b.autoplay;
  store.save();
  res.json({ settings: s.settings });
});

router.post('/reset-item', (req, res) => {
  const it = itemOr404(req, res);
  if (!it) return;
  const s = store.load();
  const old = s.items[it.id];
  // Keep what the learner wrote; forget the schedule.
  s.items[it.id] = {
    ...srs.blank(),
    notes: (old && old.notes) || srs.blank().notes,
    synonyms: (old && old.synonyms) || [],
    extraReadings: (old && old.extraReadings) || [],
  };
  store.save();
  store.log({ kind: 'reset-item', id: it.id });
  res.json({ state: s.items[it.id] });
});

router.post('/reset', (req, res) => {
  if ((req.body || {}).confirm !== 'RESET') {
    return res.status(400).json({ error: 'Send { confirm: "RESET" } to erase all kanji progress.' });
  }
  store.reset();
  res.json({ ok: true });
});

module.exports = { router, summarize, isAvailable };
