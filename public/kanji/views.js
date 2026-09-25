/* Kanji SRS — the screens: dashboard, lessons, reviews, practice, browse, item. */
(function () {
  const KA = window.KA;
  const { h } = KA;
  const V = (KA.views = {});
  const S = () => KA.state;

  const go = (hash) => {
    if (location.hash === hash) KA.route();
    else location.hash = hash;
  };

  /* ================================================== dashboard */

  V.dashboard = function (mount) {
    const s = S().summary;
    const set = S().settings;
    const next = KA.nextLessons({ count: set.batchSize || 5, types: set.lessonTypes || 'both' });

    const lessonsCard = h('div', { class: 'bigcard c-lessons' },
      h('div', { class: 'bc-head' }, h('span', { class: 'bc-title' }, 'Lessons'),
        h('span', { class: 'bc-num' }, String(s.lessonsAvailable))),
      h('div', { class: 'bc-body' },
        next.length
          ? h('div', { class: 'preview' }, next.map((it) => KA.tile(it)))
          : h('p', { class: 'muted small' }, 'Everything available has been learned.')),
      h('div', { class: 'bc-foot' },
        h('button', {
          class: 'primary', type: 'button', disabled: !next.length,
          onclick: () => V.startLessons(KA.clear(mount), next),
        }, next.length ? `Learn ${next.length} item${next.length === 1 ? '' : 's'}` : 'Nothing to learn'),
        h('a', { href: '#/lessons', class: 'small' }, 'Choose lessons…'))
    );

    const reviewsCard = h('div', { class: 'bigcard c-reviews' },
      h('div', { class: 'bc-head' }, h('span', { class: 'bc-title' }, 'Reviews'),
        h('span', { class: 'bc-num' }, String(s.reviewsDue))),
      h('div', { class: 'bc-body' },
        h('p', { class: 'muted small' },
          s.reviewsDue
            ? 'Due now. These are what move items up the SRS stages.'
            : s.nextReviewAt
              ? `Next review ${KA.fmtIn(s.nextReviewAt)} (${KA.fmtClock(s.nextReviewAt)}).`
              : 'Learn some lessons and their reviews will appear here.')),
      h('div', { class: 'bc-foot' },
        h('button', { class: 'primary', type: 'button', disabled: !s.reviewsDue, onclick: () => go('#/reviews') },
          'Start reviews'))
    );

    const practiceCard = h('div', { class: 'bigcard c-practice' },
      h('div', { class: 'bc-head' }, h('span', { class: 'bc-title' }, 'Practice'),
        h('span', { class: 'bc-num' }, String(s.learned))),
      h('div', { class: 'bc-body' },
        h('p', { class: 'muted small' },
          s.learned
            ? 'Drill anything you have learned, as often as you like. It never changes the SRS schedule.'
            : 'Once you have learned something you can drill it here any time.')),
      h('div', { class: 'bc-foot' },
        h('button', { class: 'primary', type: 'button', disabled: !s.learned, onclick: () => go('#/practice') },
          'Practice'))
    );

    const t = s.today;
    const today = h('div', { class: 'today' },
      h('span', null, h('b', null, t.lessons), ' learned today'),
      h('span', null, h('b', null, t.reviews), ' reviews', t.reviews ? ` (${KA.pct(t.reviewsCorrect, t.reviews)}% right)` : ''),
      h('span', null, h('b', null, t.practice), ' practised', t.practice ? ` (${KA.pct(t.practiceCorrect, t.practice)}% right)` : ''),
      h('span', { class: 'muted' }, `${s.learned} of ${s.total} items learned`)
    );

    const groups = h('div', { class: 'groups' },
      S().groups.map((g) => {
        const c = s.groups[g.id];
        return h('div', { class: `grp g-${g.id}` },
          h('span', { class: 'gn' }, g.name),
          h('span', { class: 'gc' }, String(c.total)),
          h('span', { class: 'gs small' }, `${c.kanji} kanji · ${c.vocab} vocab`));
      })
    );

    mount.append(
      h('div', { class: 'cards3' }, lessonsCard, reviewsCard, practiceCard),
      today,
      h('section', { class: 'panel' }, h('h2', null, 'SRS stages'), groups),
      V.forecast(s),
      V.lessonGrid(),
      h('p', { class: 'small muted foot' },
        'Your progress is saved in the database, with a daily copy in backups/. ',
        h('a', { href: '/api/kanji/export' }, 'Download a copy'), '.')
    );
  };

  V.forecast = function (s) {
    const max = Math.max(1, ...s.forecastHours);
    const now = new Date(s.now);
    const bars = s.forecastHours.map((n, i) => {
      const at = new Date(now.getTime() + i * 3600e3);
      return h('div', { class: 'fb', title: `${n} review(s) around ${KA.fmtClock(at.setMinutes(0, 0, 0))}` },
        h('div', { class: 'fbar', style: { height: `${(n / max) * 100}%` } }),
        i % 3 === 0 ? h('span', { class: 'fl' }, `${String(new Date(at).getHours()).padStart(2, '0')}`) : null);
    });
    const days = s.forecastDays.map((n, i) => {
      const d = new Date(s.now);
      d.setDate(d.getDate() + i);
      // English day names — the rest of the page is English, whatever the system locale
      const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString('en-GB', { weekday: 'short' });
      return h('div', { class: 'fd' }, h('span', { class: 'fdl' }, label), h('b', null, String(n)));
    });
    return h('section', { class: 'panel' },
      h('h2', null, 'Upcoming reviews'),
      s.forecastHours.some(Boolean)
        ? h('div', { class: 'fchart' }, bars)
        : h('p', { class: 'muted small' }, 'Nothing scheduled in the next 24 hours.'),
      h('div', { class: 'fdays' }, days));
  };

  V.lessonGrid = function () {
    const box = h('section', { class: 'panel' }, h('h2', null, 'Progress by lesson'));
    const byL = S().summary.byLesson;
    for (const L of S().lessons) {
      const kanji = S().items.filter((it) => it.lesson === L && it.type === 'kanji');
      const b = byL[L] || { kanji: {}, vocab: {} };
      box.appendChild(
        h('div', { class: 'lrow' },
          h('a', { class: 'lname', href: `#/browse?lesson=${L}` }, `L${L}`),
          h('div', { class: 'tiles' }, kanji.map((it) => KA.tile(it))),
          h('div', { class: 'lvocab small', title: 'vocabulary learned / total' },
            h('span', { class: 'muted' }, 'vocab '),
            h('b', null, `${b.vocab.learned || 0}`), `/${b.vocab.total || 0}`,
            h('div', { class: 'mini' }, h('div', { style: { width: `${KA.pct(b.vocab.learned || 0, b.vocab.total || 0)}%` } }))))
      );
    }
    return box;
  };

  /* ================================================== lessons */

  V.lessons = function (mount) {
    const set = S().settings;
    let batch = set.batchSize || 5;
    let types = set.lessonTypes || 'both';
    let lesson = null; // null = continue in course order

    const preview = h('div', { class: 'preview' });
    const startBtn = h('button', { class: 'primary', type: 'button' });
    const lessonChips = h('div', { class: 'chips' });

    const chip = (label, on, fn, extra = {}) =>
      h('button', { type: 'button', class: `chip${on ? ' is-on' : ''}`, onclick: fn, ...extra }, label);

    function redraw() {
      const next = KA.nextLessons({ count: batch, lessons: lesson ? [lesson] : null, types });
      KA.clear(preview).append(...(next.length ? next.map((it) => KA.tile(it, { withMeaning: true }))
        : [h('p', { class: 'muted small' }, 'Nothing left to learn with these choices.')]));
      startBtn.textContent = next.length ? `Start ${next.length} lesson${next.length === 1 ? '' : 's'}` : 'Nothing to learn';
      startBtn.disabled = !next.length;
      startBtn.onclick = () => V.startLessons(mount, next);

      KA.clear(lessonChips).append(
        chip('Course order', lesson === null, () => { lesson = null; redraw(); }),
        ...S().lessons.map((L) => {
          const n = KA.availableLessonCount(L, types);
          return chip(`L${L}`, lesson === L, () => { lesson = L; redraw(); }, {
            disabled: !n, title: `${n} available`,
          });
        })
      );
      KA.$$('[data-batch]', mount).forEach((b) => b.classList.toggle('is-on', Number(b.dataset.batch) === batch));
      KA.$$('[data-types]', mount).forEach((b) => b.classList.toggle('is-on', b.dataset.types === types));
    }

    const save = (patch) => KA.api.settings(patch).then((r) => (S().settings = r.settings)).catch(() => {});

    mount.append(
      h('h1', { class: 'page' }, 'Lessons'),
      h('p', { class: 'muted' },
        'Learn new items in small batches, then a short quiz fixes them in the SRS. ',
        'Take as many batches as you like — there is no daily limit.'),
      h('section', { class: 'panel' },
        h('div', { class: 'field' },
          h('span', { class: 'lbl' }, 'Batch size'),
          h('div', { class: 'chips' }, [3, 5, 10].map((n) =>
            h('button', { type: 'button', class: 'chip', dataset: { batch: n },
              onclick: () => { batch = n; save({ batchSize: n }); redraw(); } }, `${n} per batch`)))),
        h('div', { class: 'field' },
          h('span', { class: 'lbl' }, 'Include'),
          h('div', { class: 'chips' }, [['both', 'Kanji & vocabulary'], ['kanji', 'Kanji only'], ['vocab', 'Vocabulary only']]
            .map(([v, label]) => h('button', { type: 'button', class: 'chip', dataset: { types: v },
              onclick: () => { types = v; save({ lessonTypes: v }); redraw(); } }, label)))),
        h('div', { class: 'field' },
          h('span', { class: 'lbl' }, 'From ', h('em', null, '(vocabulary opens up once its kanji are learned)')),
          lessonChips),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Next up'), preview),
        h('div', { class: 'actions' }, startBtn))
    );
    redraw();
  };

  /** Show a batch item by item (Meaning → Reading → Context), then quiz it. */
  V.startLessons = function (mount, items) {
    if (!items.length) return;
    KA.markNav('lessons');
    let i = 0;
    let tab = 0;
    const TABS = ['Meaning', 'Reading', 'Context'];

    const strip = h('div', { class: 'lstrip' });
    const band = h('div', { class: 'lband' });
    const tabs = h('div', { class: 'ltabs', role: 'tablist' });
    const body = h('div', { class: 'lbody' });
    const prev = h('button', { class: 'ghost', type: 'button' }, '← Back');
    const next = h('button', { class: 'primary', type: 'button' });

    function draw() {
      const it = items[i];
      KA.clear(strip).append(...items.map((x, k) =>
        h('button', { type: 'button', class: `lchip t-${x.type}${k === i ? ' on' : ''}`, lang: 'ja',
          onclick: () => { i = k; tab = 0; draw(); } }, x.chars)));

      band.className = `lband t-${it.type}`;
      KA.clear(band).append(
        h('div', { class: 'lchars', lang: 'ja' }, it.chars),
        h('div', { class: 'lmeta' }, `${KA.typeLabel(it)} · Lesson ${it.lesson}`,
          it.type === 'kanji' ? ` · #${it.no}` : '')
      );

      KA.clear(tabs).append(...TABS.map((t, k) =>
        h('button', { type: 'button', role: 'tab', class: `ltab${k === tab ? ' on' : ''}`, 'aria-selected': k === tab,
          onclick: () => { tab = k; draw(); } }, t)));

      KA.clear(body).append(tabBody(it, tab));
      prev.disabled = i === 0 && tab === 0;
      const last = i === items.length - 1 && tab === TABS.length - 1;
      next.textContent = last ? 'Start the quiz →' : 'Next →';
      if (tab === 1 && it.type === 'vocab' && it.audio && S().settings.autoplay !== false) KA.play(it.audio);
    }

    function tabBody(it, t) {
      if (t === 0) {
        return h('div', null,
          h('p', { class: 'lbig' }, it.meanings.join('; ')),
          it.type === 'vocab'
            ? h('div', { class: 'dsec' }, h('h3', null, 'Made of'),
                h('div', { class: 'tiles' }, it.kanji.map((c) => KA.item(`k:${c}`)).filter(Boolean)
                  .map((k) => KA.tile(k, { withMeaning: true }))))
            : null,
          KA.notesEditor(it, ['meaning'], null));
      }
      if (t === 1) {
        return h('div', null,
          KA.readingsBlock(it),
          it.type === 'kanji'
            ? h('p', { class: 'small muted' },
                "On'yomi usually appear in compounds, kun'yomi when the kanji stands alone. ",
                'In reviews either kind of reading is accepted.')
            : null,
          KA.notesEditor(it, ['reading'], null));
      }
      const d = KA.itemDetails(it, { notes: false });
      // the Meaning and Reading tabs already covered those
      KA.$$('.dsec', d).slice(0, 2).forEach((x) => x.remove());
      if (!d.children.length) d.appendChild(h('p', { class: 'muted' }, 'Nothing more to add — on to the next one.'));
      return d;
    }

    function step(dir) {
      if (dir > 0) {
        if (tab < TABS.length - 1) tab++;
        else if (i < items.length - 1) { i++; tab = 0; }
        else return quiz();
      } else {
        if (tab > 0) tab--;
        else if (i > 0) { i--; tab = TABS.length - 1; }
      }
      draw();
    }

    function onKey(e) {
      if (!document.body.contains(band)) return document.removeEventListener('keydown', onKey);
      if (/^(TEXTAREA|INPUT)$/.test(e.target.tagName)) return;
      if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); step(1); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1); }
    }

    function quiz() {
      document.removeEventListener('keydown', onKey);
      KA.runSession({
        mode: 'lesson',
        items,
        mount,
        onDone: (r) => V.summary(mount, r, { lessonItems: items }),
      });
    }

    prev.onclick = () => step(-1);
    next.onclick = () => step(1);
    document.addEventListener('keydown', onKey);

    KA.clear(mount).append(
      h('div', { class: 'lhead' }, h('h1', { class: 'page' }, 'Lessons'), strip),
      band, tabs, body,
      h('div', { class: 'lnav' }, prev, h('span', { class: 'small muted lhint' }, 'Arrow keys or Enter to move on'), next)
    );
    draw();
  };

  /* ================================================== reviews */

  V.reviews = function (mount) {
    const now = Date.now();
    const due = S().items.filter((it) => KA.isDue(it.id, now));
    if (!due.length) {
      const s = S().summary;
      mount.append(
        h('h1', { class: 'page' }, 'Reviews'),
        h('section', { class: 'panel empty' },
          h('p', null, 'No reviews due right now.'),
          s.nextReviewAt ? h('p', { class: 'muted' }, `The next one comes ${KA.fmtIn(s.nextReviewAt)}, at ${KA.fmtClock(s.nextReviewAt)}.`) : null,
          h('p', { class: 'muted' }, 'You can still drill anything you have learned in Practice — it does not touch the schedule.'),
          h('div', { class: 'actions' },
            h('a', { class: 'btn primary', href: '#/practice' }, 'Practice'),
            h('a', { class: 'btn ghost', href: '#/lessons' }, 'Lessons')))
      );
      return;
    }
    KA.runSession({ mode: 'review', items: due, mount, onDone: (r) => V.summary(mount, r) });
  };

  /* ================================================== practice */

  const SCOPES = [
    ['all', 'Everything learned'],
    ['weakest', 'Weakest'],
    ['mistakes', 'Recent mistakes'],
    ['recent', 'Learned in the last 24 h'],
    ['apprentice', 'Apprentice'],
    ['guru', 'Guru and above'],
    ['burned', 'Burned'],
  ];

  function errorRate(st) {
    const r = st.reviews || { meaning: {}, reading: {} };
    const p = st.practice || {};
    const wrong = (r.meaning.incorrect || 0) + (r.reading.incorrect || 0) + (p.incorrect || 0);
    const all = wrong + (r.meaning.correct || 0) + (r.reading.correct || 0) + (p.correct || 0);
    return { wrong, rate: (wrong + 1) / (all + 2) };
  }

  function practicePool({ scope, lessons, types }) {
    const now = Date.now();
    let pool = S().items.filter((it) => {
      if (!KA.isLearned(it.id)) return false;
      if (types !== 'both' && it.type !== types) return false;
      if (lessons.size && !lessons.has(it.lesson)) return false;
      const st = KA.st(it.id);
      switch (scope) {
        case 'recent': return now - (st.learnedAt || 0) < 24 * 3600e3;
        case 'mistakes': return st.lastWrongAt && now - st.lastWrongAt < 72 * 3600e3;
        case 'apprentice': return st.stage >= 1 && st.stage <= 4;
        case 'guru': return st.stage >= 5 && st.stage <= 8;
        case 'burned': return st.stage === 9;
        case 'weakest': return errorRate(st).wrong > 0;
        default: return true;
      }
    });
    if (scope === 'weakest') {
      pool.sort((a, b) => errorRate(KA.st(b.id)).rate - errorRate(KA.st(a.id)).rate);
    }
    return pool;
  }

  V.practice = function (mount, params = {}) {
    let scope = params.scope || 'all';
    let types = 'both';
    let parts = 'both';
    let count = 20;
    const lessons = new Set();

    const info = h('p', { class: 'small muted' });
    const startBtn = h('button', { class: 'primary', type: 'button' });
    const scopeChips = h('div', { class: 'chips' });
    const lessonChips = h('div', { class: 'chips' });
    const typeChips = h('div', { class: 'chips' });
    const partChips = h('div', { class: 'chips' });
    const countChips = h('div', { class: 'chips' });

    const chip = (label, on, fn, extra = {}) =>
      h('button', { type: 'button', class: `chip${on ? ' is-on' : ''}`, onclick: fn, ...extra }, label);

    function redraw() {
      const learned = S().items.filter((it) => KA.isLearned(it.id));
      KA.clear(scopeChips).append(...SCOPES.map(([id, label]) => {
        const n = practicePool({ scope: id, lessons, types }).length;
        return chip(`${label} (${n})`, scope === id, () => { scope = id; redraw(); }, { disabled: !n && scope !== id });
      }));
      const learnedLessons = [...new Set(learned.map((it) => it.lesson))].sort((a, b) => a - b);
      KA.clear(lessonChips).append(
        chip('All lessons', !lessons.size, () => { lessons.clear(); redraw(); }),
        ...learnedLessons.map((L) => chip(`L${L}`, lessons.has(L), () => {
          lessons.has(L) ? lessons.delete(L) : lessons.add(L);
          redraw();
        }))
      );
      KA.clear(typeChips).append(...[['both', 'Kanji & vocabulary'], ['kanji', 'Kanji'], ['vocab', 'Vocabulary']]
        .map(([v, l]) => chip(l, types === v, () => { types = v; redraw(); })));
      KA.clear(partChips).append(...[['both', 'Meaning + reading'], ['meaning', 'Meaning only'], ['reading', 'Reading only']]
        .map(([v, l]) => chip(l, parts === v, () => { parts = v; redraw(); })));
      KA.clear(countChips).append(...[10, 20, 50, 100, 0]
        .map((n) => chip(n ? String(n) : 'All', count === n, () => { count = n; redraw(); })));

      const pool = practicePool({ scope, lessons, types });
      const take = count ? Math.min(count, pool.length) : pool.length;
      info.textContent = pool.length
        ? `${pool.length} item(s) match; this session will ask ${take}.`
        : 'Nothing matches — widen the choices above.';
      startBtn.disabled = !take;
      startBtn.textContent = take ? `Practise ${take}` : 'Nothing to practise';
      startBtn.onclick = () => {
        let items = pool;
        // "Weakest" keeps its ranking; the rest are sampled at random
        if (scope !== 'weakest') items = items.slice().sort(() => Math.random() - 0.5);
        items = items.slice(0, take);
        V.runPractice(mount, items, parts);
      };
    }

    const learnedCount = S().items.filter((it) => KA.isLearned(it.id)).length;
    mount.append(
      h('h1', { class: 'page' }, 'Practice'),
      h('p', { class: 'muted' },
        'Drill what you have learned — any time, as many rounds as you like. ',
        'Practice keeps its own statistics but never changes your SRS stages or review times.')
    );
    if (!learnedCount) {
      mount.append(h('section', { class: 'panel empty' },
        h('p', null, 'Nothing learned yet.'),
        h('div', { class: 'actions' }, h('a', { class: 'btn primary', href: '#/lessons' }, 'Go to lessons'))));
      return;
    }
    mount.append(
      h('section', { class: 'panel' },
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'What'), scopeChips),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Lessons'), lessonChips),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Type'), typeChips),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'Ask'), partChips),
        h('div', { class: 'field' }, h('span', { class: 'lbl' }, 'How many'), countChips),
        info,
        h('div', { class: 'actions' }, startBtn))
    );
    redraw();
  };

  V.runPractice = function (mount, items, parts = 'both') {
    KA.runSession({
      mode: 'practice',
      items,
      parts,
      mount,
      onDone: (r) => V.summary(mount, r, { practiceItems: items, parts }),
    });
  };

  /* ================================================== session summary */

  V.summary = async function (mount, r, ctx = {}) {
    const shown = mount.firstChild; // the finished session
    await KA.refresh().catch(() => {});
    if (mount.firstChild !== shown) return; // another screen took over meanwhile
    const clean = r.done.filter((d) => !d.error && d.wrongM + d.wrongR === 0);
    const missed = r.done.filter((d) => !d.error && d.wrongM + d.wrongR > 0);
    const failed = r.done.filter((d) => d.error);
    const s = S().summary;

    const title = { lesson: 'Lessons done', review: 'Reviews done', practice: 'Practice done' }[r.mode];
    const lines = [];

    if (r.mode === 'lesson') {
      lines.push(h('p', { class: 'lead' },
        `You learned ${r.done.length - failed.length} item(s).`,
        s.nextReviewAt ? ` The first review is ${KA.fmtIn(s.nextReviewAt)}, at ${KA.fmtClock(s.nextReviewAt)}.` : ''));
    } else {
      lines.push(h('p', { class: 'lead' },
        `${clean.length} of ${r.done.length} item(s) with no mistakes`,
        r.answered ? ` · ${KA.pct(r.right, r.answered)}% of answers right.` : '.'));
      if (r.unfinished) lines.push(h('p', { class: 'small muted' }, `${r.unfinished} half-answered item(s) were not saved.`));
    }

    const row = (d) => {
      const moved = r.mode === 'review' && d.from != null
        ? d.to === d.from
          ? h('span', { class: 'mv' }, `stays ${KA.stageName(d.to)}`)
          : h('span', { class: `mv ${d.to > d.from ? 'up' : 'down'}` },
              `${KA.stageName(d.from)} → ${KA.stageName(d.to)}`)
        : null;
      return h('li', null, KA.tile(d.it),
        h('span', { class: 'sm-m' }, d.it.meanings[0]),
        h('span', { class: 'sm-r', lang: 'ja' }, d.it.readings[0]),
        d.wrongM + d.wrongR ? h('span', { class: 'sm-x' }, `${d.wrongM + d.wrongR} miss${d.wrongM + d.wrongR === 1 ? '' : 'es'}`) : null,
        moved);
    };

    const lists = [];
    if (missed.length) lists.push(h('section', { class: 'panel' }, h('h2', null, `Missed (${missed.length})`), h('ul', { class: 'sumlist' }, missed.map(row))));
    if (clean.length) lists.push(h('section', { class: 'panel' }, h('h2', null, `Right first time (${clean.length})`), h('ul', { class: 'sumlist' }, clean.map(row))));
    if (failed.length) lists.push(h('section', { class: 'panel' }, h('h2', null, 'Not saved'),
      h('ul', { class: 'sumlist' }, failed.map((d) => h('li', null, KA.tile(d.it), h('span', { class: 'sm-x' }, d.error))))));

    const actions = h('div', { class: 'actions' });
    if (r.mode === 'lesson') {
      const set = S().settings;
      const more = KA.nextLessons({ count: set.batchSize || 5, types: set.lessonTypes || 'both' });
      actions.append(
        h('button', { class: 'primary', type: 'button', disabled: !more.length,
          onclick: () => V.startLessons(KA.clear(mount), more) }, more.length ? `Next ${more.length} lessons` : 'All caught up'),
        h('button', { class: 'ghost', type: 'button',
          onclick: () => V.runPractice(KA.clear(mount), ctx.lessonItems) }, 'Practise these now'));
    } else if (r.mode === 'practice') {
      actions.append(
        h('button', { class: 'primary', type: 'button',
          onclick: () => V.runPractice(KA.clear(mount), ctx.practiceItems, ctx.parts) }, 'Same set again'));
      if (missed.length) {
        actions.append(h('button', { class: 'ghost', type: 'button',
          onclick: () => V.runPractice(KA.clear(mount), missed.map((d) => d.it), ctx.parts) }, `Just the ${missed.length} missed`));
      }
      actions.append(h('a', { class: 'btn ghost', href: '#/practice' }, 'New practice'));
    } else if (s.reviewsDue) {
      actions.append(h('button', { class: 'primary', type: 'button', onclick: () => go('#/reviews') }, `${s.reviewsDue} more due`));
    }
    actions.append(h('a', { class: 'btn ghost', href: '#/' }, 'Dashboard'));

    KA.clear(mount).append(h('h1', { class: 'page' }, title), ...lines, actions, ...lists);
  };

  /* ================================================== browse */

  V.browse = function (mount, params = {}) {
    let type = params.type || 'all';
    let lesson = params.lesson ? Number(params.lesson) : null;
    let status = params.status || 'all';
    let query = params.q || '';

    const grid = h('div', { class: 'bgrid' });
    const count = h('p', { class: 'small muted' });
    const search = h('input', { type: 'text', placeholder: 'Search: kanji, reading (romaji or kana), or meaning', value: query });
    const chips = h('div', { class: 'bfilters' });

    const chip = (label, on, fn) => h('button', { type: 'button', class: `chip${on ? ' is-on' : ''}`, onclick: fn }, label);

    function matches(it) {
      if (type !== 'all' && it.type !== type) return false;
      if (lesson && it.lesson !== lesson) return false;
      const st = KA.stage(it.id);
      if (status === 'new' && st) return false;
      if (status !== 'all' && status !== 'new' && (!st || KA.groupOf(st) !== status)) return false;
      const q = query.trim().toLowerCase();
      if (!q) return true;
      if (it.chars.includes(query.trim())) return true;
      const kana = window.wanakana ? window.wanakana.toHiragana(q) : q;
      const canonQ = KA.answer.canonReading(kana);
      if (canonQ && !/[a-z]/.test(canonQ) && it.readings.some((r) => KA.answer.canonReading(r).startsWith(canonQ))) return true;
      return it.meanings.some((m) => m.toLowerCase().includes(q));
    }

    function redraw() {
      KA.clear(chips).append(
        h('div', { class: 'chips' }, [['all', 'All'], ['kanji', 'Kanji'], ['vocab', 'Vocabulary']]
          .map(([v, l]) => chip(l, type === v, () => { type = v; redraw(); }))),
        h('div', { class: 'chips' },
          chip('Any lesson', !lesson, () => { lesson = null; redraw(); }),
          ...S().lessons.map((L) => chip(`L${L}`, lesson === L, () => { lesson = L; redraw(); }))),
        h('div', { class: 'chips' }, [['all', 'Any stage'], ['new', 'Not learned'], ...S().groups.map((g) => [g.id, g.name])]
          .map(([v, l]) => chip(l, status === v, () => { status = v; redraw(); })))
      );
      const list = S().items.filter(matches);
      count.textContent = `${list.length} item(s)`;
      KA.clear(grid).append(...list.slice(0, 1500).map((it) => KA.tile(it, { withMeaning: true })));
    }

    search.addEventListener('input', () => { query = search.value; redraw(); });
    mount.append(h('h1', { class: 'page' }, 'Browse'), search, chips, count, grid);
    redraw();
  };

  /* ================================================== item page */

  V.item = function (mount, id) {
    const it = KA.item(id);
    if (!it) {
      mount.append(h('h1', { class: 'page' }, 'Not found'), h('p', null, 'No such item.'));
      return;
    }
    const st = KA.st(id) || {};
    const stage = st.stage || 0;

    const head = h('div', { class: `ihead t-${it.type}` },
      h('div', { class: 'ichars', lang: 'ja' }, it.chars),
      h('div', { class: 'imeta' },
        h('div', { class: 'itype' }, `${KA.typeLabel(it)} · Lesson ${it.lesson}`, it.type === 'kanji' ? ` · #${it.no}` : ''),
        h('div', { class: 'imean' }, it.meanings.join('; ')),
        h('span', { class: `stagepill g-${stage ? KA.groupOf(stage) : 'none'}` }, stage ? KA.stageName(stage) : 'Not learned')));

    const r = st.reviews || { meaning: { correct: 0, incorrect: 0 }, reading: { correct: 0, incorrect: 0 } };
    const p = st.practice || { correct: 0, incorrect: 0 };
    const accuracy = (c, i) => (c + i ? `${KA.pct(c, c + i)}% (${c}/${c + i})` : '—');
    const stats = h('section', { class: 'panel' }, h('h2', null, 'Progress'),
      h('dl', { class: 'stats' },
        h('dt', null, 'Stage'), h('dd', null, stage ? KA.stageName(stage) : 'Not learned'),
        h('dt', null, 'Learned'), h('dd', null, KA.fmtDate(st.learnedAt)),
        h('dt', null, 'Next review'), h('dd', null,
          stage === 9 ? 'Burned — no more reviews' : st.nextReview ? `${KA.fmtIn(st.nextReview)} (${new Date(st.nextReview).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})` : '—'),
        h('dt', null, 'Meaning answers'), h('dd', null, accuracy(r.meaning.correct, r.meaning.incorrect)),
        h('dt', null, 'Reading answers'), h('dd', null, accuracy(r.reading.correct, r.reading.incorrect)),
        h('dt', null, 'Practice'), h('dd', null, accuracy(p.correct, p.incorrect))));

    // your synonyms and extra readings — removable
    const accepted = h('section', { class: 'panel' }, h('h2', null, 'Your accepted answers'));
    const synIn = h('input', { type: 'text', placeholder: 'Add your own meaning' });
    function drawAccepted() {
      const cur = KA.st(id) || {};
      const syn = cur.synonyms || [];
      const ext = cur.extraReadings || [];
      KA.clear(accepted).append(
        h('h2', null, 'Your accepted answers'),
        h('p', { class: 'small muted' }, 'Answers you added with “My answer was right”, or here. They count in reviews and practice.'),
        h('div', { class: 'chips' },
          syn.length || ext.length ? null : h('span', { class: 'small muted' }, 'None yet.'),
          ...syn.map((x) => h('button', { type: 'button', class: 'chip', title: 'Remove',
            onclick: async () => { const res = await KA.api.item(id, { removeSynonym: x }); KA.setItemState(id, res.state); drawAccepted(); } }, `${x} ✕`)),
          ...ext.map((x) => h('button', { type: 'button', class: 'chip', lang: 'ja', title: 'Remove',
            onclick: async () => { const res = await KA.api.item(id, { removeReading: x }); KA.setItemState(id, res.state); drawAccepted(); } }, `${x} ✕`))),
        h('div', { class: 'addrow' }, synIn,
          h('button', { class: 'ghost', type: 'button', onclick: async () => {
            if (!synIn.value.trim()) return;
            const res = await KA.api.item(id, { addSynonym: synIn.value.trim() });
            KA.setItemState(id, res.state);
            synIn.value = '';
            drawAccepted();
          } }, 'Add')));
    }
    drawAccepted();

    const actions = h('div', { class: 'actions' });
    if (stage) {
      actions.append(
        h('button', { class: 'primary', type: 'button', onclick: () => V.runPractice(KA.clear(mount), [it]) }, 'Practise it now'),
        h('button', { class: 'ghost', type: 'button', onclick: async () => {
          if (!confirm(`Reset ${it.chars}? It goes back to "not learned"; your notes stay.`)) return;
          const res = await KA.api.resetItem(id);
          KA.setItemState(id, res.state);
          await KA.refresh();
          KA.route();
        } }, 'Reset progress'));
    } else if (KA.isAvailable(it)) {
      actions.append(h('button', { class: 'primary', type: 'button', onclick: () => V.startLessons(KA.clear(mount), [it]) }, 'Learn it now'));
    } else {
      const need = it.kanji.filter((c) => !KA.isLearned(`k:${c}`)).join(' ');
      actions.append(h('p', { class: 'small muted' }, `Learn its kanji first: ${need}`));
    }

    mount.append(head, actions,
      h('section', { class: 'panel' }, KA.itemDetails(it, { full: true })),
      stats, accepted);
  };
})();
