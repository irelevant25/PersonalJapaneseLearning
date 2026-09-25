/**
 * Shared setup of the Node tests: the browser code's unit test and the browser
 * suites. (The PHP tests have their own, in tests/lib.php.)
 *
 * isolate() MUST run before startApp(): it picks a throwaway database
 * (academy_test_<…>) and a temp folder for backups. startApp() makes that
 * database — a copy of academy_test_template, which it first brings up to date
 * — starts the real server (PHP's built-in web server, as npm start does) on a
 * free port with them, and checks that the server says it uses them. Nothing
 * can reach your database or backups/, and no test reads progress/, results/
 * or reports/.
 */
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawn } = require('child_process');
const { findPhp } = require('../tools/php');

const ROOT = path.join(__dirname, '..');
const TESTDB = path.join(ROOT, 'tests', 'tools', 'testdb.php');

let ENV = null;

function isolate(name = 'academy-test') {
  if (ENV) throw new Error('isolate() came twice');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`));
  ENV = {
    ACADEMY_DB_NAME: `academy_test_${process.pid}_${crypto.randomBytes(3).toString('hex')}`,
    ACADEMY_BACKUPS_DIR: dir.replace(/\\/g, '/'),
  };
  return dir;
}

const php = (args, opts = {}) =>
  execFileSync(findPhp(), args, { cwd: ROOT, encoding: 'utf8', env: { ...process.env, ...ENV }, maxBuffer: 64e6, ...opts });

/** SQL in the test's own database; returns the rows. */
const sql = (query, ...params) => JSON.parse(php([TESTDB, 'sql', ENV.ACADEMY_DB_NAME, query, JSON.stringify(params)]));

const freePort = () =>
  new Promise((resolve) => {
    const s = net.createServer().listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });

/** The real server, on a free port, against the test's database and backup folder. */
async function startApp() {
  if (!ENV) throw new Error('startApp() without isolate() would use your real database');
  php([TESTDB, 'template'], { stdio: ['ignore', 'ignore', 'inherit'] });
  php([TESTDB, 'create', ENV.ACADEMY_DB_NAME]);

  const port = await freePort();
  const log = path.join(ENV.ACADEMY_BACKUPS_DIR, '..', `${path.basename(ENV.ACADEMY_BACKUPS_DIR)}-server.log`);
  const out = fs.openSync(log, 'a');
  // this computer only, like the real server (and no firewall prompt on a new PC)
  const server = spawn(
    findPhp(),
    ['-d', 'display_errors=stderr', '-S', `127.0.0.1:${port}`, '-t', path.join(ROOT, 'public'), path.join(ROOT, 'server.php')],
    { cwd: ROOT, env: { ...process.env, ...ENV }, stdio: ['ignore', out, out] }
  );
  const base = `http://127.0.0.1:${port}`;

  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    server.kill();
    await new Promise((r) => (server.exitCode !== null ? r() : server.once('exit', r)));
    fs.closeSync(out);
    if (process.env.ACADEMY_KEEP_TEMP) return;
    php([TESTDB, 'drop', ENV.ACADEMY_DB_NAME]);
    for (const p of [ENV.ACADEMY_BACKUPS_DIR, log]) {
      try {
        fs.rmSync(p, { recursive: true, force: true });
      } catch {
        // a file still held open by Windows: harmless leftovers in %TEMP%
      }
    }
  };
  process.on('exit', () => {
    if (!closed) server.kill();
  });

  for (let i = 0; ; i++) {
    try {
      const health = await (await fetch(`${base}/api/health`)).json();
      if (health.database !== ENV.ACADEMY_DB_NAME || health.backups !== ENV.ACADEMY_BACKUPS_DIR) {
        await close();
        throw new Error(`the server uses ${health.database} / ${health.backups}, not this test's database and folder`);
      }
      break;
    } catch (e) {
      if (/not this test/.test(e.message)) throw e;
      if (i > 100) throw new Error(`the server did not start: ${fs.readFileSync(log, 'utf8')}`);
      await new Promise((r) => setTimeout(r, 50));
    }
  }

  return {
    base,
    sql,
    /** Makes items due for review now (the old tests edited the in-memory store). */
    makeDue: (ids, agoMs = 60000) =>
      sql(
        'UPDATE srs_progress SET next_review = academy_time(?) WHERE item_id IN (SELECT json_array_elements_text(?::json))',
        Date.now() - agoMs,
        JSON.stringify(ids)
      ),
    close,
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

/** The catalog as the server builds it, straight from data/ (no server needed). */
const catalog = () => JSON.parse(php([path.join(ROOT, 'tests', 'tools', 'catalog.php')]));

module.exports = { ROOT, isolate, startApp, call, catalog };
