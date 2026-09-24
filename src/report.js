/**
 * Renders a standalone HTML report for one attempt.
 * No external assets, so the file can be opened, mailed or printed as-is.
 */

const esc = (s) =>
  String(s == null ? '' : s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );

const fmtDuration = (ms) => {
  const s = Math.round(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`;
};

/** "Part 1 — L3–L6" — what the paper actually covered. */
function describeScope(exam) {
  const ls = exam.lessons === 'all' ? null : [].concat(exam.lessons).map(Number);
  if (!ls || !ls.length) return 'Parts 1 and 2 — Greetings and Lessons 1–23';
  const sorted = [...new Set(ls)].sort((a, b) => a - b);
  const label = (n) => (n === 0 ? 'Greetings' : `L${n}`);
  // collapse runs: 1,2,3,5 -> L1–L3, L5
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) { prev = n; continue; }
    parts.push(start === prev ? label(start) : `${label(start)}–${label(prev)}`);
    start = prev = n;
  }
  parts.push(start === prev ? label(start) : `${label(start)}–${label(prev)}`);
  const books = [];
  if (sorted.some((n) => n <= 12)) books.push('Part 1');
  if (sorted.some((n) => n >= 13)) books.push('Part 2');
  return `${books.join(' + ')} — ${parts.join(', ')}`;
}

function bar(pct, total, right) {
  const p = Math.round(pct);
  const cls = p >= 80 ? 'good' : p >= 60 ? 'ok' : 'bad';
  return `<div class="bar"><div class="fill ${cls}" style="width:${p}%"></div>
    <span class="barlabel">${p}% <em>(${right}/${total})</em></span></div>`;
}

function renderReport({ attempt, result, history }) {
  const meta = attempt.meta || {};
  const when = new Date(attempt.finishedAt || Date.now());

  const sectionRows = result.bySection
    .map(
      (s) => `<tr>
        <td class="name">${esc(s.name)}</td>
        <td class="barcell">${bar(s.pct, s.total, s.right)}</td>
      </tr>`
    )
    .join('');

  const lessonRows = result.byLesson
    .map(
      (l) => `<tr>
        <td class="name">${esc(l.name)}</td>
        <td class="barcell">${bar(l.pct, l.total, l.right)}</td>
      </tr>`
    )
    .join('');

  // Only worth a section of its own when the paper spanned both books.
  const bookRows = (result.byBook || []).length > 1
    ? `<section class="card">
        <h2>By part</h2>
        <table>${result.byBook
          .map(
            (b) => `<tr>
              <td class="name">${esc(b.name)}</td>
              <td class="barcell">${bar(b.pct, b.total, b.right)}</td>
            </tr>`
          )
          .join('')}</table>
      </section>`
    : '';

  const missed = result.rows.filter((r) => !r.correct);
  const missedBySection = new Map();
  for (const r of missed) {
    if (!missedBySection.has(r.sectionName)) missedBySection.set(r.sectionName, []);
    missedBySection.get(r.sectionName).push(r);
  }

  const missedHtml = missed.length
    ? [...missedBySection.entries()]
        .map(
          ([name, rows]) => `
      <h3 class="subhead">${esc(name)} <span class="count">${rows.length}</span></h3>
      ${rows
        .map(
          (r) => `<div class="miss">
            <div class="q"><span class="qn">Q${r.n}</span> ${esc(r.question)}
              ${r.hint ? `<span class="hint">${esc(r.hint)}</span>` : ''}</div>
            <div class="ans">
              <div class="yours">Your answer: <b>${
                r.chosenAnswer === null
                  ? '<i class="blank">not answered</i>'
                  : esc(r.chosenAnswer)
              }</b></div>
              <div class="right">Correct: <b>${esc(r.correctAnswer)}</b></div>
            </div>
            <div class="why">${esc(r.explain)}${
            r.ref ? ` <span class="ref">${esc(r.ref)}</span>` : ''
          }</div>
          </div>`
        )
        .join('')}`
        )
        .join('')
    : '<p class="perfect">Nothing missed — a clean paper.</p>';

  const advice = [];
  if (result.weakSections.length) {
    advice.push(
      `Weakest skills: ${result.weakSections
        .map((s) => `<b>${esc(s.name)}</b> (${Math.round(s.pct)}%)`)
        .join(', ')}.`
    );
  }
  if (result.weakLessons.length) {
    advice.push(
      `Lessons to revisit: ${result.weakLessons
        .map((l) => `<b>${esc(l.name)}</b> (${Math.round(l.pct)}%)`)
        .join(', ')}.`
    );
  }
  if (result.unanswered) {
    advice.push(`${result.unanswered} question(s) were left unanswered.`);
  }
  if (!advice.length) {
    advice.push('No section fell below 60% — coverage is even across the book.');
  }

  const historyHtml =
    history && history.length > 1
      ? `<section>
      <h2>Attempt history</h2>
      <table class="hist">
        <thead><tr><th>Date</th><th>Questions</th><th>Score</th><th>Grade</th><th>Result</th></tr></thead>
        <tbody>${history
          .map(
            (h) => `<tr${h.id === attempt.id ? ' class="current"' : ''}>
              <td>${esc(new Date(h.finishedAt).toLocaleString())}</td>
              <td>${h.total}</td>
              <td>${h.pct}%</td>
              <td>${esc(h.grade)}</td>
              <td class="${h.passed ? 'pass' : 'fail'}">${h.passed ? 'PASS' : 'FAIL'}</td>
            </tr>`
          )
          .join('')}</tbody>
      </table>
    </section>`
      : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Exam report — ${esc(when.toLocaleDateString())}</title>
<style>
  :root{
    --bg:#f6f5f2; --card:#fff; --ink:#1d1d1f; --muted:#6b6b70; --line:#e3e1dc;
    --good:#2e7d5b; --ok:#b8862b; --bad:#b4453c; --accent:#3a5f8a;
  }
  *{box-sizing:border-box}
  body{margin:0;padding:32px 16px;background:var(--bg);color:var(--ink);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,
      "Hiragino Kaku Gothic ProN","Yu Gothic","Meiryo",sans-serif;}
  .wrap{max-width:880px;margin:0 auto}
  header{margin-bottom:24px}
  h1{font-size:26px;margin:0 0 4px}
  .sub{color:var(--muted);font-size:14px}
  .card{background:var(--card);border:1px solid var(--line);border-radius:10px;
    padding:22px;margin-bottom:20px}
  .verdict{display:flex;align-items:center;gap:22px;flex-wrap:wrap}
  .score{font-size:52px;font-weight:700;line-height:1}
  .score small{font-size:20px;font-weight:500;color:var(--muted)}
  .stamp{font-size:15px;font-weight:700;letter-spacing:.08em;padding:8px 16px;
    border-radius:6px;border:2px solid}
  .stamp.pass{color:var(--good);border-color:var(--good);background:#eaf5ef}
  .stamp.fail{color:var(--bad);border-color:var(--bad);background:#fdeeed}
  .facts{display:flex;gap:26px;flex-wrap:wrap;margin-left:auto;text-align:right}
  .fact .k{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
  .fact .v{font-size:19px;font-weight:600}
  h2{font-size:17px;margin:0 0 14px;padding-bottom:8px;border-bottom:2px solid var(--line)}
  table{width:100%;border-collapse:collapse}
  td.name{padding:5px 12px 5px 0;white-space:nowrap;font-size:14px;vertical-align:middle}
  td.barcell{width:100%;padding:5px 0}
  .bar{position:relative;background:#eeece7;border-radius:4px;height:22px}
  .fill{height:100%;border-radius:4px}
  .fill.good{background:var(--good)} .fill.ok{background:var(--ok)} .fill.bad{background:var(--bad)}
  .barlabel{position:absolute;right:8px;top:0;line-height:22px;font-size:12px;
    font-variant-numeric:tabular-nums;color:var(--ink)}
  .barlabel em{color:var(--muted);font-style:normal}
  .advice li{margin-bottom:6px}
  .subhead{font-size:15px;margin:22px 0 10px;color:var(--accent)}
  .subhead .count{background:#eeece7;color:var(--muted);border-radius:10px;
    padding:1px 8px;font-size:12px;margin-left:6px}
  .miss{border-left:3px solid var(--bad);padding:10px 0 10px 14px;margin-bottom:14px}
  .miss .q{font-size:15px;margin-bottom:6px}
  .qn{color:var(--muted);font-size:12px;margin-right:6px}
  .hint{color:var(--muted);font-size:13px;margin-left:6px}
  .ans{display:flex;gap:26px;flex-wrap:wrap;font-size:14px;margin-bottom:5px}
  .yours b{color:var(--bad)} .right b{color:var(--good)}
  .blank{color:var(--muted)}
  .why{font-size:13px;color:var(--muted)}
  .ref{opacity:.7;margin-left:6px}
  .perfect{color:var(--good);font-weight:600}
  table.hist th{text-align:left;font-size:12px;color:var(--muted);text-transform:uppercase;
    letter-spacing:.05em;padding:6px 10px 6px 0;border-bottom:1px solid var(--line)}
  table.hist td{padding:7px 10px 7px 0;border-bottom:1px solid var(--line);font-size:14px}
  table.hist tr.current td{font-weight:700}
  td.pass{color:var(--good)} td.fail{color:var(--bad)}
  footer{color:var(--muted);font-size:12px;text-align:center;margin-top:28px}
  @media print{body{background:#fff;padding:0}.card{break-inside:avoid;border:none;padding:0 0 18px}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Japanese Academy — Exam report</h1>
    <div class="sub">${esc(meta.candidate || 'Unnamed candidate')} ·
      ${esc(when.toLocaleString())} ·
      paper <code>${esc(attempt.exam.seed)}</code></div>
  </header>

  <div class="card">
    <div class="verdict">
      <div class="score">${result.pct}<small>%</small></div>
      <div class="stamp ${result.passed ? 'pass' : 'fail'}">
        ${result.passed ? 'PASS' : 'FAIL'} &middot; ${esc(result.grade)}
      </div>
      <div class="facts">
        <div class="fact"><div class="k">Correct</div><div class="v">${result.right} / ${result.total}</div></div>
        <div class="fact"><div class="k">Unanswered</div><div class="v">${result.unanswered}</div></div>
        <div class="fact"><div class="k">Time</div><div class="v">${fmtDuration(result.totalMs)}</div></div>
        <div class="fact"><div class="k">Per question</div><div class="v">${(result.avgMs / 1000).toFixed(1)}s</div></div>
      </div>
    </div>
    <p class="sub" style="margin:18px 0 0">
      Pass mark ${result.passMark}%. Scope: ${esc(describeScope(attempt.exam))}.
    </p>
  </div>

  ${bookRows}

  <section class="card">
    <h2>By skill</h2>
    <table>${sectionRows}</table>
  </section>

  <section class="card">
    <h2>By lesson</h2>
    <table>${lessonRows}</table>
  </section>

  <section class="card">
    <h2>What to work on</h2>
    <ul class="advice">${advice.map((a) => `<li>${a}</li>`).join('')}</ul>
  </section>

  ${historyHtml ? `<div class="card">${historyHtml}</div>` : ''}

  <section class="card">
    <h2>Questions missed (${missed.length})</h2>
    ${missedHtml}
  </section>

  <footer>
    Generated by Japanese Academy from its vocabulary and kanji lists, the
    conjugation charts and the hand-written questions.
  </footer>
</div>
</body>
</html>`;
}

module.exports = { renderReport };
