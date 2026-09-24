/**
 * Japanese Academy server.
 *
 *   GET  /                    Academy home
 *   GET  /kanji.html          kanji SRS (lessons, reviews, practice)
 *   GET  /exam.html           the exam
 *   GET  /api/meta            exam: sections, lessons, bank size
 *   POST /api/exam            exam: build a paper  { size, books, lessons, sections, seed }
 *   POST /api/submit          exam: score it, store the attempt, write the report
 *   GET  /api/attempts        exam: past attempts (newest first)
 *   GET  /report/:id          exam: the HTML report for one attempt
 *   *    /api/kanji/...       kanji SRS — see src/srs/routes.js
 *   GET  /audio/:name         a vocabulary clip from data/audio
 */
const express = require('express');
const fs = require('fs');
const path = require('path');

const { buildExam, bankStats, SECTIONS, BOOKS } = require('./src/generate');
const { scoreAttempt } = require('./src/score');
const { renderReport } = require('./src/report');
const { router: kanjiRouter, summarize: kanjiSummary } = require('./src/srs/routes');
const { getCatalog } = require('./src/srs/catalog');
const { readIndex, CLIPS, CLIP_NAME } = require('./src/speech');
const store = require('./src/srs/store');

const ROOT = __dirname;
// Overridable so tests never write into your real attempt history.
const RESULTS = process.env.ACADEMY_RESULTS_DIR || path.join(ROOT, 'results');
const REPORTS = process.env.ACADEMY_REPORTS_DIR || path.join(ROOT, 'reports');
for (const d of [RESULTS, REPORTS]) fs.mkdirSync(d, { recursive: true });

const app = express();
// Where this app keeps your data: checked by the tests, shown at start-up.
app.locals.dirs = { progress: store.DIR, results: RESULTS, reports: REPORTS };
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(ROOT, 'public')));

// wanakana (MIT) turns romaji into kana as you type a reading.
app.get('/vendor/wanakana.min.js', (req, res) =>
  res.sendFile(path.join(ROOT, 'node_modules', 'wanakana', 'wanakana.min.js'))
);

/* ---------------------------------------------------------------- audio */

// The clips made by `npm run build:audio`. A clip's name never changes (a new
// recording gets a new name), so the browser may cache it for good.
app.get('/audio/:name', (req, res) => {
  if (!CLIP_NAME.test(req.params.name)) return res.status(404).end();
  // the caching headers go out only with a clip, never with a 404
  res.sendFile(path.join(CLIPS, req.params.name), { maxAge: '1y', immutable: true }, (err) => {
    if (err && !res.headersSent) res.status(404).end();
  });
});

app.use('/api/kanji', kanjiRouter);

/* ------------------------------------------------------------------ helpers */

const attemptFile = (id) => path.join(RESULTS, `${id}.json`);

function listAttempts() {
  return fs
    .readdirSync(RESULTS)
    .filter((f) => f.endsWith('.json'))
    .map((f) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(RESULTS, f), 'utf8'));
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(a.finishedAt) - new Date(b.finishedAt));
}

function historyRows() {
  return listAttempts().map((a) => ({
    id: a.id,
    finishedAt: a.finishedAt,
    total: a.summary.total,
    right: a.summary.right,
    pct: a.summary.pct,
    grade: a.summary.grade,
    passed: a.summary.passed,
    candidate: (a.meta || {}).candidate || '',
  }));
}

const safeId = (s) => /^[A-Za-z0-9_-]+$/.test(String(s || ''));

/* --------------------------------------------------------------------- api */

app.get('/api/meta', (req, res) => {
  const stats = bankStats();
  res.json({
    books: BOOKS.map((b) => ({
      id: b.id,
      name: b.name,
      lessons: b.lessons,
      available: stats.byBook[b.id] || 0,
      bySection: stats.bySectionBook[b.id] || {},
    })),
    sections: SECTIONS.map((s) => ({
      id: s.id,
      name: s.name,
      audio: !!s.audio,
      available: stats.bySection[s.id] || 0,
    })),
    lessons: [
      { id: 0, name: 'Greetings (あいさつ)', book: 1 },
      ...Array.from({ length: 23 }, (_, i) => ({
        id: i + 1,
        name: `Lesson ${i + 1}`,
        book: i + 1 <= 12 ? 1 : 2,
      })),
    ],
    bankSize: stats.total,
    attempts: historyRows().length,
  });
});

/**
 * The exact arguments a paper was built from. The client echoes this back on
 * submit so the server rebuilds the identical paper — passing the *resulting*
 * question count back instead would rebuild a different one.
 */
function normalizeSpec({ size, books, lessons, sections, seed }) {
  return {
    size: Math.min(Math.max(Number(size) || 250, 5), 1200),
    books: Array.isArray(books) && books.length ? books.map(Number) : null,
    lessons: Array.isArray(lessons) && lessons.length ? lessons.map(Number) : null,
    sections: Array.isArray(sections) && sections.length ? sections : null,
    seed: seed || null,
  };
}

app.post('/api/exam', (req, res) => {
  try {
    const spec = normalizeSpec(req.body || {});
    const exam = buildExam(spec);
    // The client must not receive the answers.
    res.json({
      spec: { ...spec, seed: exam.seed },
      seed: exam.seed,
      size: exam.size,
      createdAt: exam.createdAt,
      sections: exam.sections,
      lessons: exam.lessons,
      books: exam.books,
      questions: exam.questions.map((q) => ({
        n: q.n,
        id: q.id,
        section: q.section,
        sectionName: q.sectionName,
        lesson: q.lesson,
        book: q.book,
        question: q.question,
        hint: q.hint,
        reading: q.reading,
        audio: q.audio,
        options: q.options,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.post('/api/submit', (req, res) => {
  const { responses, meta, startedAt } = req.body || {};
  const spec = normalizeSpec(req.body.spec || req.body || {});
  if (!spec.seed) return res.status(400).json({ error: 'spec.seed is required' });

  try {
    // Rebuild the identical paper from the spec — the answers never left the server.
    const exam = buildExam(spec);

    // Guard against a spec/answer mismatch silently scoring the wrong paper.
    const ids = new Set(exam.questions.map((q) => q.id));
    const stray = Object.keys(responses || {}).filter((id) => !ids.has(id));
    if (stray.length) {
      return res.status(409).json({
        error:
          `The submitted answers do not belong to this paper ` +
          `(${stray.length} unknown question id(s)). Nothing was saved.`,
      });
    }

    const result = scoreAttempt(exam, responses || {});
    const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${exam.seed}`.replace(
      /[^A-Za-z0-9_-]/g,
      '-'
    );

    const attempt = {
      id,
      startedAt: startedAt || null,
      finishedAt: new Date().toISOString(),
      meta: meta || {},
      exam: {
        seed: exam.seed,
        size: exam.size,
        books: exam.books,
        lessons: exam.lessons,
        sections: exam.sections,
      },
      summary: {
        total: result.total,
        answered: result.answered,
        unanswered: result.unanswered,
        right: result.right,
        wrong: result.wrong,
        pct: result.pct,
        grade: result.grade,
        passed: result.passed,
        passMark: result.passMark,
        totalMs: result.totalMs,
        avgMs: result.avgMs,
      },
      bySection: result.bySection,
      byLesson: result.byLesson,
      byBook: result.byBook,
      responses: result.rows.map((r) => ({
        n: r.n,
        id: r.id,
        section: r.section,
        lesson: r.lesson,
        book: r.book,
        audio: r.audio,
        question: r.question,
        chosen: r.chosenAnswer,
        correctAnswer: r.correctAnswer,
        correct: r.correct,
        ms: r.ms,
      })),
    };

    fs.writeFileSync(attemptFile(id), JSON.stringify(attempt, null, 2));

    const html = renderReport({ attempt, result, history: historyRows() });
    fs.writeFileSync(path.join(REPORTS, `${id}.html`), html);

    res.json({
      id,
      summary: attempt.summary,
      bySection: result.bySection,
      byLesson: result.byLesson,
      weakSections: result.weakSections,
      weakLessons: result.weakLessons,
      reportUrl: `/report/${id}`,
      reportFile: path.join(REPORTS, `${id}.html`),
      byBook: result.byBook,
      review: result.rows.map((r) => ({
        n: r.n,
        section: r.sectionName,
        lesson: r.lesson,
        audio: r.audio,
        question: r.question,
        chosen: r.chosenAnswer,
        correctAnswer: r.correctAnswer,
        correct: r.correct,
        explain: r.explain,
        ref: r.ref,
      })),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err.message || err) });
  }
});

app.get('/api/attempts', (req, res) => res.json(historyRows().reverse()));

app.get('/report/:id', (req, res) => {
  const { id } = req.params;
  if (!safeId(id)) return res.status(400).send('bad id');
  const file = path.join(REPORTS, `${id}.html`);
  if (!fs.existsSync(file)) return res.status(404).send('No such report');
  res.type('html').send(fs.readFileSync(file, 'utf8'));
});

// `node server.js` starts listening; `require('./server')` just returns the app,
// so the tests can run it in-process on a free port with their own data folders.
if (require.main === module) {
  // From package.json's "config", which start.ps1 / start.sh read too. Only
  // this computer can reach the app: it has no login, and it can reset progress.
  const { config = {} } = require('./package.json');
  const PORT = process.env.PORT || config.port || 3000;
  const HOST = process.env.HOST || config.host || '127.0.0.1';
  store.load(); // loads your progress and takes today's backup before any request
  app.listen(PORT, HOST, () => {
    const stats = bankStats();
    const catalog = getCatalog();
    const k = kanjiSummary();
    const moved = Object.entries(app.locals.dirs).filter(([name, dir]) => path.resolve(dir) !== path.join(ROOT, name));
    const audio = readIndex();
    const words = Object.keys(audio.clips).length;
    console.log(`\n  Japanese Academy  →  http://localhost:${PORT}`);
    console.log(`  kanji SRS : ${catalog.items.length} items, ${k.learned} learned, ${k.reviewsDue} review(s) due`);
    console.log(`  exam      : ${stats.total} questions across ${SECTIONS.length} sections`);
    console.log(
      words
        ? `  audio     : ${words} words in ${audio.voices.length} voices (data/audio)`
        : '  audio     : none yet: run npm run build:audio (see README)'
    );
    if (moved.length) {
      console.log(`  WARNING   : not your usual data (ACADEMY_*_DIR set): ${moved.map(([n, d]) => `${n} → ${d}`).join(', ')}`);
    }
    console.log('');
  });
}

module.exports = app;
