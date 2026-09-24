/**
 * Shared test setup.
 *
 * isolate() MUST run before any app module is required: it points every data
 * folder (kanji progress, exam results, exam reports) at a fresh temp directory,
 * so no test can ever read or write the real ones in progress/, results/ and
 * reports/. startApp() then checks the folders the app actually uses.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// The modules that pick their data folders when they load.
const DATA_MODULES = ['server.js', 'src/srs/store.js', 'src/srs/routes.js'].map((f) => path.join(ROOT, f));

let BASE = null;

function isolate(name = 'academy-test') {
  const loaded = DATA_MODULES.filter((f) => require.cache[f]);
  if (loaded.length) {
    throw new Error(`isolate() came too late: ${loaded.map((f) => path.relative(ROOT, f)).join(', ')} already loaded`);
  }
  BASE = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  for (const d of ['progress', 'results', 'reports']) fs.mkdirSync(path.join(BASE, d));
  process.env.ACADEMY_PROGRESS_DIR = path.join(BASE, 'progress');
  process.env.ACADEMY_RESULTS_DIR = path.join(BASE, 'results');
  process.env.ACADEMY_REPORTS_DIR = path.join(BASE, 'reports');
  // Remove the temp data when the run ends; ACADEMY_KEEP_TEMP=1 keeps it to look at.
  const base = BASE;
  process.on('exit', () => {
    if (process.env.ACADEMY_KEEP_TEMP) return;
    try {
      fs.rmSync(base, { recursive: true, force: true });
    } catch {
      // a file still held open by Windows: harmless leftovers in %TEMP%
    }
  });
  return BASE;
}

/** Real, case-folded path: 8.3 short names, junctions and letter case can't fool the check. */
const real = (p) => {
  const r = fs.realpathSync.native(p);
  return process.platform === 'win32' ? r.toLowerCase() : r;
};

/** The real app, in-process, on a free port. Call isolate() first. */
async function startApp() {
  if (!BASE) throw new Error('startApp() without isolate() would touch the real data folders');
  const app = require(path.join(ROOT, 'server.js'));
  const store = require(path.join(ROOT, 'src', 'srs', 'store.js'));
  for (const [name, dir] of Object.entries(app.locals.dirs)) {
    const rel = path.relative(real(BASE), real(dir));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(`the app's ${name} folder (${dir}) is outside this test's temp folder ${BASE}`);
    }
  }
  // this computer only, like the real server (and no firewall prompt on a new PC)
  const server = await new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    store,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/** fetch → { status, body } with JSON in and out. */
async function call(base, method, url, body) {
  const r = await fetch(base + url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }
  return { status: r.status, body: parsed, headers: r.headers };
}

module.exports = { ROOT, isolate, startApp, call };
