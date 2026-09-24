/* Kanji SRS — shared state, API client, DOM and formatting helpers. */
(function () {
  const KA = (window.KA = window.KA || {});

  /* ------------------------------------------------------------- DOM */

  /**
   * h('div', {class: 'x', onclick: fn}, 'text', child, [more])
   * Strings become text nodes, so catalog and note text is never parsed as HTML.
   */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const [k, v] of Object.entries(attrs)) {
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else if (v === true) el.setAttribute(k, '');
        else el.setAttribute(k, v);
      }
    }
    const add = (k) => {
      if (k == null || k === false) return;
      if (Array.isArray(k)) k.forEach(add);
      else el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
    };
    kids.forEach(add);
    return el;
  }
  KA.h = h;
  KA.$ = (s, r) => (r || document).querySelector(s);
  KA.$$ = (s, r) => [...(r || document).querySelectorAll(s)];
  KA.clear = (el) => {
    while (el.firstChild) el.removeChild(el.firstChild);
    return el;
  };

  /* ------------------------------------------------------------- API */

  async function req(method, url, body) {
    const r = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const e = new Error(data.error || r.statusText);
      e.status = r.status;
      e.data = data;
      throw e;
    }
    return data;
  }

  KA.api = {
    catalog: () => req('GET', '/api/kanji/catalog'),
    progress: () => req('GET', '/api/kanji/progress'),
    learn: (id) => req('POST', '/api/kanji/learn', { id }),
    review: (id, meaningWrong, readingWrong) =>
      req('POST', '/api/kanji/review', { id, meaningWrong, readingWrong }),
    practice: (id, firstTryCorrect, wrong) =>
      req('POST', '/api/kanji/practice', { id, firstTryCorrect, wrong }),
    item: (id, patch) => req('POST', '/api/kanji/item', { id, ...patch }),
    settings: (patch) => req('POST', '/api/kanji/settings', patch),
    resetItem: (id) => req('POST', '/api/kanji/reset-item', { id }),
    reset: () => req('POST', '/api/kanji/reset', { confirm: 'RESET' }),
  };

  /* ----------------------------------------------------------- state */

  const S = (KA.state = {
    items: [],
    byId: new Map(),
    stages: [],
    groups: [],
    lessons: [],
    progress: {}, // id -> item state
    settings: {},
    summary: null,
    known: null, // every meaning in the catalog, for the typo guard
  });

  KA.load = async function load() {
    if (!S.items.length) {
      const c = await KA.api.catalog();
      S.items = c.items;
      S.stages = c.stages;
      S.groups = c.groups;
      S.lessons = c.lessons;
      S.byId = new Map(c.items.map((it) => [it.id, it]));
      S.known = KA.answer.knownCoresOf(c.items);
    }
    await KA.refresh();
  };

  KA.refresh = async function refresh() {
    const p = await KA.api.progress();
    S.progress = p.items || {};
    S.settings = p.settings || {};
    S.summary = p.summary;
    KA.updateNavBadge();
  };

  KA.setItemState = (id, st) => {
    if (st) S.progress[id] = st;
  };

  /** Highlight a sub-nav tab — sessions started from the dashboard mark their own. */
  KA.markNav = (name) =>
    document.querySelectorAll('.subnav a').forEach((a) => a.toggleAttribute('aria-current', a.dataset.route === name));

  KA.updateNavBadge = () => {
    const b = document.getElementById('navDue');
    if (!b || !S.summary) return;
    b.hidden = !S.summary.reviewsDue;
    b.textContent = S.summary.reviewsDue;
  };

  /* ------------------------------------------------------ item logic */

  KA.item = (id) => S.byId.get(id);
  KA.st = (id) => S.progress[id] || null;
  KA.stage = (id) => (S.progress[id] ? S.progress[id].stage || 0 : 0);
  KA.isLearned = (id) => KA.stage(id) >= 1;
  KA.isDue = (id, now = Date.now()) => {
    const s = S.progress[id];
    return !!s && s.stage >= 1 && s.stage <= 8 && s.nextReview != null && s.nextReview <= now;
  };

  /** Kanji are always available; vocabulary once all of its kanji are learned. */
  KA.isAvailable = (it) =>
    it.type === 'kanji' || it.kanji.every((c) => KA.isLearned(`k:${c}`));

  KA.groupOf = (stage) => (S.stages[stage] ? S.stages[stage].group : 'lesson');
  KA.stageName = (stage) => (S.stages[stage] ? S.stages[stage].name : '—');

  KA.acceptMeanings = (it) => [...it.meanings, ...((KA.st(it.id) || {}).synonyms || [])];
  KA.acceptReadings = (it) => [...it.readings, ...((KA.st(it.id) || {}).extraReadings || [])];

  KA.typeLabel = (it) => (it.type === 'kanji' ? 'Kanji' : 'Vocabulary');

  /** The next lessons in course order, honouring the chosen lessons and types. */
  KA.nextLessons = ({ count = 5, lessons = null, types = 'both' } = {}) => {
    const want = lessons && lessons.length ? new Set(lessons.map(Number)) : null;
    const out = [];
    for (const it of S.items) {
      if (out.length >= count) break;
      if (KA.isLearned(it.id)) continue;
      if (want && !want.has(it.lesson)) continue;
      if (types !== 'both' && it.type !== types) continue;
      if (!KA.isAvailable(it)) continue;
      out.push(it);
    }
    return out;
  };

  KA.availableLessonCount = (lesson, types = 'both') =>
    S.items.filter(
      (it) =>
        it.lesson === lesson &&
        !KA.isLearned(it.id) &&
        (types === 'both' || it.type === types) &&
        KA.isAvailable(it)
    ).length;

  /* ---------------------------------------------------------- format */

  KA.fmtIn = (ts, now = Date.now()) => {
    if (ts == null) return '—';
    const ms = ts - now;
    if (ms <= 0) return 'now';
    const m = Math.round(ms / 60000);
    if (m < 60) return `in ${m} min`;
    const hr = Math.floor(m / 60);
    if (hr < 24) return `in ${hr} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
    const d = Math.floor(hr / 24);
    return `in ${d} day${d === 1 ? '' : 's'}`;
  };
  KA.fmtClock = (ts) =>
    new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  KA.fmtDate = (ts) =>
    ts ? new Date(ts).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
  KA.pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

  /* ----------------------------------------------------------- audio */

  // A word has one clip per voice. The voices take turns, so every word is
  // heard from both over time.
  let current = null;
  let turn = 0;
  KA.play = (clips) => {
    const list = [].concat(clips || []).filter(Boolean);
    if (!list.length) return;
    const name = list[turn++ % list.length];
    try {
      if (current) current.pause();
      current = new Audio(`/audio/${encodeURIComponent(name)}`);
      const p = current.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* no audio device — fine */
    }
  };

  /* ------------------------------------------------- item rendering */

  /** A small tile: character, coloured by type, edged by SRS stage. */
  KA.tile = (it, opts = {}) => {
    const st = KA.stage(it.id);
    return h(
      'a',
      {
        class: `tile t-${it.type} g-${st ? KA.groupOf(st) : 'none'}${opts.big ? ' big' : ''}`,
        href: `#/item/${encodeURIComponent(it.id)}`,
        title: `${it.chars} — ${it.meanings[0]}${st ? ' · ' + KA.stageName(st) : ' · not learned'}`,
        lang: 'ja',
      },
      h('span', { class: 'tc' }, it.chars),
      opts.withMeaning ? h('span', { class: 'tm' }, it.meanings[0]) : null
    );
  };

  /** Readings block: on/kun for a kanji, the word's readings for vocabulary. */
  KA.readingsBlock = (it) => {
    const st = KA.st(it.id) || {};
    if (it.type === 'kanji') {
      return h(
        'div',
        { class: 'readings' },
        h('div', { class: 'rd' }, h('span', { class: 'rk' }, "On'yomi"), h('span', { class: 'rv', lang: 'ja' }, it.on.join('、') || '—')),
        h('div', { class: 'rd' }, h('span', { class: 'rk' }, "Kun'yomi"), h('span', { class: 'rv', lang: 'ja' }, it.kun.join('、') || '—')),
        st.extraReadings && st.extraReadings.length
          ? h('div', { class: 'rd' }, h('span', { class: 'rk' }, 'Also accepted'), h('span', { class: 'rv', lang: 'ja' }, st.extraReadings.join('、')))
          : null
      );
    }
    return h(
      'div',
      { class: 'readings' },
      h('div', { class: 'rd' },
        h('span', { class: 'rk' }, 'Reading'),
        h('span', { class: 'rv', lang: 'ja' }, [...it.readings, ...(st.extraReadings || [])].join('、')),
        it.audio ? h('button', { class: 'ghost sm play', type: 'button', onclick: () => KA.play(it.audio) }, '▶ Listen') : null
      )
    );
  };

  /** Everything worth knowing about an item — used by lessons, the item page and "item info". */
  KA.itemDetails = (it, opts = {}) => {
    const st = KA.st(it.id) || {};
    const wrap = h('div', { class: 'details' });

    wrap.appendChild(
      h('section', { class: 'dsec' },
        h('h3', null, 'Meaning'),
        h('p', { class: 'meanings' }, it.meanings.join('; ')),
        st.synonyms && st.synonyms.length
          ? h('p', { class: 'syn small muted' }, 'Your synonyms: ', st.synonyms.join(', '))
          : null,
        it.type === 'vocab' && (it.verbClass || it.adjClass)
          ? h('p', { class: 'small muted' },
              it.verbClass ? `${it.verbClass === 'irr' ? 'irregular' : it.verbClass + '-'}verb` : '',
              it.adjClass ? `${it.adjClass}-adjective` : '')
          : null
      )
    );

    wrap.appendChild(h('section', { class: 'dsec' }, h('h3', null, 'Reading'), KA.readingsBlock(it)));

    if (it.type === 'kanji') {
      const ex = (it.examples || []).map(KA.item).filter(Boolean).slice(0, opts.full ? 40 : 8);
      if (ex.length) {
        wrap.appendChild(
          h('section', { class: 'dsec' },
            h('h3', null, 'Found in vocabulary'),
            h('ul', { class: 'examples' },
              ex.map((v) =>
                h('li', null,
                  h('a', { href: `#/item/${encodeURIComponent(v.id)}`, class: 'ex-w', lang: 'ja' }, v.chars),
                  h('span', { class: 'ex-r', lang: 'ja' }, v.readings[0]),
                  h('span', { class: 'ex-m' }, v.meanings[0]),
                  v.audio ? h('button', { class: 'ghost sm play', type: 'button', onclick: () => KA.play(v.audio) }, '▶') : null
                )
              )
            )
          )
        );
      }
    } else {
      wrap.appendChild(
        h('section', { class: 'dsec' },
          h('h3', null, 'Kanji'),
          h('div', { class: 'tiles' },
            it.kanji.map((c) => KA.item(`k:${c}`)).filter(Boolean).map((k) => KA.tile(k, { withMeaning: true }))
          )
        )
      );
    }

    if (opts.notes !== false) wrap.appendChild(KA.notesEditor(it));
    return wrap;
  };

  /** Your own mnemonics — saved as you type (debounced). */
  KA.notesEditor = (it, parts = ['meaning', 'reading'], title = 'Your notes') => {
    const st = KA.st(it.id) || {};
    const notes = st.notes || { meaning: '', reading: '' };
    const box = h('section', { class: 'dsec notes' }, title ? h('h3', null, title) : null);
    for (const part of parts) {
      let timer = null;
      const status = h('span', { class: 'small muted' });
      const ta = h('textarea', {
        placeholder:
          part === 'meaning'
            ? 'A mnemonic for the meaning — e.g. 休: a person (亻) resting against a tree (木).'
            : 'A mnemonic for the reading.',
        rows: 2,
      });
      ta.value = notes[part] || '';
      const save = async () => {
        clearTimeout(timer);
        try {
          const r = await KA.api.item(it.id, { notes: { [part]: ta.value } });
          KA.setItemState(it.id, r.state);
          status.textContent = 'saved';
        } catch (e) {
          status.textContent = `not saved: ${e.message}`;
        }
      };
      ta.addEventListener('input', () => {
        status.textContent = '…';
        clearTimeout(timer);
        timer = setTimeout(save, 700);
      });
      ta.addEventListener('blur', () => timer && save());
      // typing here must not trigger the session shortcuts
      ta.addEventListener('keydown', (e) => e.stopPropagation());
      box.appendChild(
        h('label', { class: 'field' },
          h('span', { class: 'lbl' }, part === 'meaning' ? 'Meaning note' : 'Reading note', ' ', status),
          ta
        )
      );
    }
    return box;
  };
})();
