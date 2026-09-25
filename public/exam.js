/* The exam — front end. Plain DOM, no framework. */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const show = (id) => {
  ['setup', 'test', 'result'].forEach((s) => ($('#' + s).hidden = s !== id));
  window.scrollTo(0, 0);
};

const state = {
  meta: null,
  size: 250,
  books: new Set([1]),
  lessons: new Set(),
  sections: new Set(),
  exam: null,
  idx: 0,
  answers: {}, // id -> {choice, ms}
  flags: new Set(),
  preloaded: new Set(),
  shownAt: 0,
  startedAt: null,
  timer: null,
  lastResult: null,
  reviewMode: 'wrong',
};

/* ------------------------------------------------------------- setup */

async function init() {
  const meta = await fetch('/api/meta').then((r) => r.json());
  state.meta = meta;
  $('#bankLine').textContent =
    `${meta.bankSize.toLocaleString()} questions in the bank · ` +
    `${meta.sections.length} sections · ${meta.attempts} attempt(s) recorded`;

  // Book chips. Selecting a book decides which lesson chips exist at all.
  meta.books.forEach((bk) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip' + (state.books.has(bk.id) ? ' is-on' : '');
    b.dataset.book = bk.id;
    b.textContent = bk.name;
    b.title = `${bk.available.toLocaleString()} questions · lessons ${bk.lessons[0]}–${
      bk.lessons[bk.lessons.length - 1]
    }`;
    b.onclick = () => {
      toggle(b, state.books, bk.id);
      if (!state.books.size) {
        // never leave nothing selected
        toggle(b, state.books, bk.id);
        return;
      }
      renderLessonChips();
    };
    $('#bookChips').appendChild(b);
  });

  renderLessonChips();

  meta.sections.forEach((s) => {
    state.sections.add(s.id);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip is-on';
    b.dataset.section = s.id;
    b.textContent = s.name;
    b.title = `${s.available} available`;
    b.onclick = () => toggle(b, state.sections, s.id);
    $('#sectionChips').appendChild(b);
  });

  $$('#sizeChips .chip').forEach((b) => {
    b.onclick = () => {
      $$('#sizeChips .chip').forEach((x) => x.classList.remove('is-on'));
      b.classList.add('is-on');
      state.size = Number(b.dataset.size);
    };
  });

  $$('.link').forEach((b) => {
    b.onclick = () => {
      const which = b.dataset.all || b.dataset.none;
      const on = !!b.dataset.all;
      const set = which === 'lessons' ? state.lessons : state.sections;
      const attr = which === 'lessons' ? 'lesson' : 'section';
      set.clear();
      $$(`[data-${attr}]`).forEach((c) => {
        c.classList.toggle('is-on', on);
        if (on) set.add(attr === 'lesson' ? Number(c.dataset.lesson) : c.dataset.section);
      });
    };
  });

  $('#startBtn').onclick = startExam;
  $('#historyBtn').onclick = toggleHistory;
  $('#againBtn').onclick = () => location.reload();
  $('#prevBtn').onclick = () => go(state.idx - 1);
  $('#nextBtn').onclick = () => {
    if (state.idx === state.exam.questions.length - 1) finish();
    else go(state.idx + 1);
  };
  $('#quitBtn').onclick = () => {
    const done = Object.values(state.answers).filter((a) => a.choice !== null).length;
    const left = state.exam.questions.length - done;
    if (!left || confirm(`${left} question(s) unanswered. Finish and score anyway?`))
      finish();
  };
  $('#playBtn').onclick = playAudio;
  const audio = $('#audio');
  audio.onplay = () => {
    $('#playBtn').classList.add('playing');
    $('#playState').textContent = 'Playing…';
  };
  audio.onended = audio.onpause = () => {
    $('#playBtn').classList.remove('playing');
    $('#playState').textContent = 'Listen again?';
  };
  audio.onerror = () => {
    $('#player').classList.add('err');
    $('#playBtn').classList.remove('playing');
    $('#playState').textContent = 'Recording unavailable';
  };

  $('#flagBox').onchange = (e) => {
    const id = state.exam.questions[state.idx].id;
    e.target.checked ? state.flags.add(id) : state.flags.delete(id);
    paintGrid();
  };
  $$('[data-rev]').forEach((b) => {
    b.onclick = () => {
      $$('[data-rev]').forEach((x) => x.classList.remove('is-on'));
      b.classList.add('is-on');
      state.reviewMode = b.dataset.rev;
      paintReview();
    };
  });

  document.addEventListener('keydown', onKey);
}

/** Lesson chips follow the chosen book(s); all of them start selected. */
function renderLessonChips() {
  const box = $('#lessonChips');
  box.innerHTML = '';
  state.lessons.clear();
  state.meta.lessons
    .filter((l) => state.books.has(l.book))
    .forEach((l) => {
      state.lessons.add(l.id);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip is-on';
      b.dataset.lesson = l.id;
      b.textContent = l.id === 0 ? 'Greetings' : 'L' + l.id;
      b.title = l.name;
      b.onclick = () => toggle(b, state.lessons, l.id);
      box.appendChild(b);
    });
}

function toggle(btn, set, val) {
  if (set.has(val)) {
    set.delete(val);
    btn.classList.remove('is-on');
  } else {
    set.add(val);
    btn.classList.add('is-on');
  }
}

async function toggleHistory() {
  const p = $('#historyPanel');
  if (!p.hidden) {
    p.hidden = true;
    return;
  }
  const rows = await fetch('/api/attempts').then((r) => r.json());
  $('#historyBody').innerHTML = rows.length
    ? `<table class="hist"><thead><tr>
         <th>Date</th><th>Name</th><th>Qs</th><th>Score</th><th>Grade</th>
         <th>Result</th><th>Report</th></tr></thead><tbody>
       ${rows
         .map(
           (r) => `<tr>
             <td>${new Date(r.finishedAt).toLocaleString()}</td>
             <td>${escapeHtml(r.candidate || '—')}</td>
             <td>${r.total}</td><td>${r.pct}%</td><td>${r.grade}</td>
             <td class="${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASS' : 'FAIL'}</td>
             <td><a href="/report/${encodeURIComponent(r.id)}" target="_blank" rel="noopener">open</a></td>
           </tr>`
         )
         .join('')}</tbody></table>`
    : '<p class="tagline">No attempts recorded yet.</p>';
  p.hidden = false;
}

/* -------------------------------------------------------------- exam */

async function startExam() {
  $('#setupErr').textContent = '';
  if (!state.sections.size) return ($('#setupErr').textContent = 'Pick at least one section.');
  if (!state.lessons.size) return ($('#setupErr').textContent = 'Pick at least one lesson.');

  $('#startBtn').disabled = true;
  $('#startBtn').textContent = 'Building the paper…';
  try {
    const body = {
      size: state.size,
      books: [...state.books],
      lessons: [...state.lessons],
      sections: [...state.sections],
      seed: $('#seed').value.trim() || null,
    };
    const exam = await fetch('/api/exam', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then((r) => r.json());
    if (exam.error) throw new Error(exam.error);
    if (!exam.questions.length) throw new Error('No questions match that scope.');

    state.exam = exam;
    state.idx = 0;
    state.answers = {};
    state.flags = new Set();
    state.startedAt = new Date().toISOString();
    buildGrid();
    show('test');
    render();
    startClock();
  } catch (e) {
    $('#setupErr').textContent = e.message;
  } finally {
    $('#startBtn').disabled = false;
    $('#startBtn').textContent = 'Start the test';
  }
}

function startClock() {
  const t0 = Date.now();
  clearInterval(state.timer);
  state.timer = setInterval(() => {
    const s = Math.floor((Date.now() - t0) / 1000);
    const m = Math.floor(s / 60);
    $('#clock').textContent = `${m}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
}

function buildGrid() {
  const g = $('#gridNav');
  g.innerHTML = '';
  state.exam.questions.forEach((q, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = i + 1;
    b.title = q.sectionName;
    b.onclick = () => go(i);
    g.appendChild(b);
  });
}

function paintGrid() {
  const kids = $('#gridNav').children;
  state.exam.questions.forEach((q, i) => {
    const b = kids[i];
    if (!b) return;
    b.className = '';
    // recordTime() creates an entry for a merely *visited* question, so only a
    // real choice counts as answered.
    if (state.answers[q.id] && state.answers[q.id].choice !== null)
      b.classList.add('done');
    if (state.flags.has(q.id)) b.classList.add('flag');
    if (i === state.idx) b.classList.add('cur');
  });
}

function recordTime() {
  const q = state.exam?.questions[state.idx];
  if (!q || !state.shownAt) return;
  const dt = Date.now() - state.shownAt;
  if (state.answers[q.id]) state.answers[q.id].ms += dt;
  else state.answers[q.id] = { choice: null, ms: dt };
  state.shownAt = 0;
}

function go(i) {
  if (i < 0 || i >= state.exam.questions.length) return;
  recordTime();
  state.idx = i;
  render();
}

/* ------------------------------------------------------------- audio */

function setupAudio(q) {
  const player = $('#player');
  const audio = $('#audio');
  if (!q.audio) {
    audio.pause();
    audio.removeAttribute('src');
    player.hidden = true;
    return;
  }
  player.hidden = false;
  player.classList.remove('err');
  $('#playState').textContent = 'Playing…';
  audio.src = `/audio/${encodeURIComponent(q.audio)}`;
  playAudio();
  preloadNext();
}

function playAudio() {
  const audio = $('#audio');
  if (!audio.src) return;
  audio.currentTime = 0;
  const p = audio.play();
  // Autoplay can still be refused; the question stays answerable by tapping.
  if (p && p.catch) {
    p.catch(() => {
      $('#playState').textContent = 'Tap to listen';
    });
  }
}

/** Fetch the next clip while the current question is on screen. */
function preloadNext() {
  const nxt = state.exam.questions[state.idx + 1];
  if (!nxt || !nxt.audio) return;
  const url = `/audio/${encodeURIComponent(nxt.audio)}`;
  if (state.preloaded.has(url)) return;
  state.preloaded.add(url);
  const a = new Audio();
  a.preload = 'auto';
  a.src = url;
}

function render() {
  const q = state.exam.questions[state.idx];
  const n = state.exam.questions.length;

  $('#counter').textContent = `${state.idx + 1} / ${n}`;
  $('#sectionTag').textContent = q.sectionName;
  $('#progressFill').style.width = `${((state.idx + 1) / n) * 100}%`;
  $('#qLesson').textContent = q.lesson === 0 ? 'Greetings' : `Lesson ${q.lesson}`;
  $('#qHint').textContent = q.hint || '';
  $('#qText').textContent = q.question;
  $('#flagBox').checked = state.flags.has(q.id);
  $('#prevBtn').disabled = state.idx === 0;
  $('#nextBtn').textContent =
    state.idx === n - 1 ? 'Finish →' : 'Next →';

  setupAudio(q);

  const chosen = state.answers[q.id]?.choice;
  const box = $('#opts');
  box.innerHTML = '';
  q.options.forEach((opt, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt' + (chosen === i ? ' is-on' : '');
    b.innerHTML = `<span class="key">${'ABCD'[i] || i + 1}</span><span class="txt"></span>`;
    b.querySelector('.txt').textContent = opt;
    b.onclick = () => choose(i);
    box.appendChild(b);
  });

  state.shownAt = Date.now();
  paintGrid();
}

function choose(i) {
  const q = state.exam.questions[state.idx];
  const dt = state.shownAt ? Date.now() - state.shownAt : 0;
  const prev = state.answers[q.id];
  state.answers[q.id] = { choice: i, ms: (prev?.ms || 0) + dt };
  state.shownAt = Date.now();

  $$('#opts .opt').forEach((b, k) => b.classList.toggle('is-on', k === i));
  paintGrid();

  // Move on by itself, so a long paper stays a flow rather than a chore.
  if (state.idx < state.exam.questions.length - 1) {
    setTimeout(() => {
      if (state.answers[q.id]?.choice === i) go(state.idx + 1);
    }, 170);
  }
}

function onKey(e) {
  if ($('#test').hidden) return;
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  const map = { a: 0, b: 1, c: 2, d: 3, 1: 0, 2: 1, 3: 2, 4: 3 };
  if (k in map) {
    const q = state.exam.questions[state.idx];
    if (map[k] < q.options.length) {
      e.preventDefault();
      choose(map[k]);
    }
  } else if (e.key === 'ArrowRight' || e.key === 'Enter') {
    e.preventDefault();
    state.idx === state.exam.questions.length - 1 ? finish() : go(state.idx + 1);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    go(state.idx - 1);
  } else if (k === 'f') {
    $('#flagBox').click();
  } else if (k === 'r' || e.key === ' ') {
    if (!$('#player').hidden) {
      e.preventDefault();
      playAudio();
    }
  }
}

/* ------------------------------------------------------------ finish */

async function finish() {
  recordTime();
  clearInterval(state.timer);
  $('#quitBtn').disabled = true;

  const res = await fetch('/api/submit', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      // echo the spec verbatim so the server rebuilds this exact paper
      spec: state.exam.spec,
      startedAt: state.startedAt,
      meta: { candidate: $('#candidate').value.trim() },
      responses: state.answers,
    }),
  }).then((r) => r.json());

  if (res.error) {
    alert('Could not score the test: ' + res.error);
    return;
  }
  state.lastResult = res;
  paintResult(res);
  show('result');
}

function paintResult(res) {
  const s = res.summary;
  $('#verdict').innerHTML = `
    <div class="bigscore">${s.pct}<small>%</small></div>
    <div class="stamp ${s.passed ? 'pass' : 'fail'}">
      ${s.passed ? 'PASS' : 'FAIL'} &middot; ${s.grade}</div>
    <div class="vfacts">
      <div><div class="k">Correct</div><div class="v">${s.right} / ${s.total}</div></div>
      <div><div class="k">Unanswered</div><div class="v">${s.unanswered}</div></div>
      <div><div class="k">Time</div><div class="v">${fmt(s.totalMs)}</div></div>
      <div><div class="k">Per question</div><div class="v">${(s.avgMs / 1000).toFixed(1)}s</div></div>
    </div>`;

  $('#bySection').innerHTML = res.bySection.map(barRow).join('');
  $('#byLesson').innerHTML = res.byLesson.map(barRow).join('');
  $('#reportLink').href = res.reportUrl;
  $('#savedLine').textContent = `Attempt and its report saved (${res.id}).`;
  paintReview();
}

function barRow(g) {
  const p = Math.round(g.pct);
  const cls = p >= 80 ? 'good' : p >= 60 ? 'ok' : 'bad';
  return `<div class="brow">
    <div class="bname">${escapeHtml(g.name)}</div>
    <div class="bbar"><div class="bfill ${cls}" style="width:${p}%"></div>
      <span class="bpct">${p}% (${g.right}/${g.total})</span></div>
  </div>`;
}

function paintReview() {
  const rows = state.lastResult.review.filter(
    (r) => state.reviewMode === 'all' || !r.correct
  );
  $('#review').innerHTML = rows.length
    ? rows
        .map(
          (r) => `<div class="rev ${r.correct ? 'good' : 'bad'}">
        <div class="rq"><span class="rn">Q${r.n} · ${escapeHtml(r.section)}</span>
          ${escapeHtml(r.question)}
          ${
            r.audio
              ? `<button type="button" class="miniplay" data-audio="${escapeHtml(
                  r.audio
                )}" aria-label="Play the recording">&#9654; listen</button>`
              : ''
          }</div>
        <div class="ra">
          <span class="mine">You: <b>${
            r.chosen === null ? '—' : escapeHtml(r.chosen)
          }</b></span>
          ${
            r.correct
              ? ''
              : `<span class="sol">Correct: <b>${escapeHtml(r.correctAnswer)}</b></span>`
          }
        </div>
        <div class="rw">${escapeHtml(r.explain)}${
            r.ref ? ` · ${escapeHtml(r.ref)}` : ''
          }</div>
      </div>`
        )
        .join('')
    : '<p class="tagline">Nothing missed.</p>';

  // Let them hear again whatever they got wrong.
  $$('#review .miniplay').forEach((b) => {
    b.onclick = () => {
      const a = new Audio(`/audio/${encodeURIComponent(b.dataset.audio)}`);
      a.play().catch(() => {});
    };
  });
}

const fmt = (ms) => {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  return m ? `${m}m ${s % 60}s` : `${s}s`;
};

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s == null ? '' : s;
  return d.innerHTML;
}

init();
