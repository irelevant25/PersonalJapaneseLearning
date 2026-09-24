/*
 * The answering engine behind the lesson quiz, reviews and practice.
 *
 * Each item is asked twice — meaning, then reading, back to back. A missed half
 * is shown with the right answer and comes back a few cards later; the item is
 * finished (and saved) only once both halves have been answered right, and the
 * misses along the way are what the SRS uses to move it down.
 *
 *   Enter  submit, then Enter again to continue
 *   F      item info, once answered
 */
(function () {
  const KA = window.KA;
  const { h } = KA;

  const MODES = {
    lesson: { title: 'Lesson quiz', note: 'Get each one right once to learn it.' },
    review: { title: 'Reviews', note: null },
    practice: { title: 'Practice', note: 'Practice never changes your SRS schedule.' },
  };

  function shuffle(a) {
    const x = a.slice();
    for (let i = x.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [x[i], x[j]] = [x[j], x[i]];
    }
    return x;
  }

  /**
   * @param {object}   o
   * @param {'lesson'|'review'|'practice'} o.mode
   * @param {object[]} o.items   catalog items
   * @param {'both'|'meaning'|'reading'} [o.parts]
   * @param {HTMLElement} o.mount
   * @param {function} o.onDone  called with the session result
   */
  KA.runSession = function runSession({ mode, items, parts = 'both', mount, onDone, shuffleItems = true }) {
    const cfg = MODES[mode];
    KA.markNav({ lesson: 'lessons', review: 'reviews', practice: 'practice' }[mode]);
    const queue = (shuffleItems ? shuffle(items) : items.slice()).map((it) => ({
      it,
      needM: parts !== 'reading',
      needR: parts !== 'meaning',
      wrongM: 0,
      wrongR: 0,
      started: false,
    }));
    const total = queue.length;
    const done = [];
    let answered = 0;
    let right = 0;
    let phase = 'ask'; // 'ask' | 'shown'
    let verdict = null; // 'correct' | 'wrong'
    let typed = '';
    let cur = null;
    let part = null;
    let busy = false;
    let wrapping = false;
    let bound = false;
    let finished = false;

    /* ------------------------------------------------------------ DOM */

    const $done = h('b', null, '0');
    const $left = h('b', null, String(total));
    const $acc = h('span', { class: 's-acc' }, '—');
    const $fill = h('div', { class: 'fill' });
    const $chars = h('div', { class: 's-chars', lang: 'ja' });
    const $type = h('span', { class: 's-type' });
    const $ask = h('b', { class: 's-ask' });
    const $input = h('input', {
      type: 'text',
      class: 's-input',
      autocomplete: 'off',
      autocapitalize: 'off',
      autocorrect: 'off',
      spellcheck: 'false',
      'aria-label': 'Your answer',
    });
    const $go = h('button', { type: 'button', class: 's-go', 'aria-label': 'Submit' }, '→');
    const $feedback = h('div', { class: 's-feedback', 'aria-live': 'polite' });
    const $info = h('button', { type: 'button', class: 'ghost sm' }, 'Item info ', h('kbd', null, 'F'));
    const $accept = h('button', { type: 'button', class: 'ghost sm' }, 'My answer was right');
    const $listen = h('button', { type: 'button', class: 'ghost sm' }, '▶ Listen');
    const $actions = h('div', { class: 's-actions' }, $info, $accept, $listen);
    const $panel = h('div', { class: 's-panel' });
    const $wrap = h('button', { type: 'button', class: 'ghost sm' }, 'Wrap up');
    const $end = h('button', { type: 'button', class: 'ghost sm' }, 'End');
    const $card = h('div', { class: 's-card' }, $chars);
    const $q = h('div', { class: 's-q' }, $type, ' ', $ask);

    const root = h(
      'section',
      { class: `session mode-${mode}` },
      h('div', { class: 's-top' },
        h('span', { class: 's-mode' }, cfg.title),
        h('span', { class: 's-count' }, $done, ' done · ', $left, ' left'),
        $acc,
        h('span', { class: 'spacer' }),
        mode === 'review' ? $wrap : null,
        $end
      ),
      h('div', { class: 's-progress' }, $fill),
      cfg.note ? h('p', { class: 's-note small muted' }, cfg.note) : null,
      $card,
      $q,
      h('div', { class: 's-form' }, $input, $go),
      $feedback,
      $actions,
      $panel
    );
    KA.clear(mount).appendChild(root);

    /* ----------------------------------------------------- rendering */

    function bindKana(on) {
      if (!window.wanakana) return;
      if (on && !bound) {
        window.wanakana.bind($input, { IMEMode: 'toHiragana' });
        bound = true;
      } else if (!on && bound) {
        window.wanakana.unbind($input);
        bound = false;
      }
    }

    function counts() {
      $done.textContent = String(done.length);
      $left.textContent = String(queue.length);
      $acc.textContent = answered ? `${KA.pct(right, answered)}%` : '—';
      $fill.style.width = `${total ? (done.length / (done.length + queue.length)) * 100 : 100}%`;
    }

    function show() {
      if (!queue.length) return finish();
      cur = queue[0];
      part = cur.needM ? 'meaning' : 'reading';
      phase = 'ask';
      verdict = null;
      typed = '';

      root.classList.remove('is-correct', 'is-wrong', 'is-close');
      $card.className = `s-card t-${cur.it.type}`;
      $chars.textContent = cur.it.chars;
      $chars.classList.toggle('long', [...cur.it.chars].length > 4);
      $q.className = `s-q ${part}`;
      $type.textContent = KA.typeLabel(cur.it);
      $ask.textContent = part === 'meaning' ? 'Meaning' : 'Reading';

      $input.value = '';
      $input.readOnly = false;
      $input.placeholder = part === 'meaning' ? 'Answer in English' : 'Type the reading — romaji turns into kana';
      $input.lang = part === 'reading' ? 'ja' : 'en';
      bindKana(part === 'reading');

      $feedback.textContent = '';
      $actions.hidden = true;
      KA.clear($panel).hidden = true;
      counts();
      $input.focus();
    }

    function shake(message) {
      $feedback.textContent = message;
      root.classList.remove('shake');
      void root.offsetWidth; // restart the animation
      root.classList.add('shake');
    }

    function expected() {
      if (part === 'meaning') return KA.acceptMeanings(cur.it).join('; ');
      if (cur.it.type === 'kanji') {
        const bits = [];
        if (cur.it.on.length) bits.push(`on: ${cur.it.on.join('、')}`);
        if (cur.it.kun.length) bits.push(`kun: ${cur.it.kun.join('、')}`);
        return bits.join('  ·  ');
      }
      return KA.acceptReadings(cur.it).join('、');
    }

    /* -------------------------------------------------------- answer */

    function submit() {
      if (phase !== 'ask' || busy) return;
      let v = $input.value;
      if (part === 'reading' && window.wanakana) v = window.wanakana.toKana(v); // trailing n → ん
      typed = v.trim();

      const res =
        part === 'meaning'
          ? KA.answer.checkMeaning(typed, KA.acceptMeanings(cur.it), KA.state.known)
          : KA.answer.checkReading(typed, KA.acceptReadings(cur.it));

      if (res.verdict === 'invalid') return shake(res.message);

      cur.started = true;
      answered += 1;
      phase = 'shown';
      $input.value = typed;
      $input.readOnly = true;

      if (res.verdict === 'correct') {
        right += 1;
        verdict = 'correct';
        if (part === 'meaning') cur.needM = false;
        else cur.needR = false;
        root.classList.add('is-correct');
        if (res.close) {
          root.classList.add('is-close');
          $feedback.textContent = `Close enough — it's “${expected()}”.`;
        }
        if (part === 'reading' && cur.it.audio && KA.state.settings.autoplay !== false) KA.play(cur.it.audio);
      } else {
        verdict = 'wrong';
        if (part === 'meaning') cur.wrongM += 1;
        else cur.wrongR += 1;
        root.classList.add('is-wrong');
        $feedback.textContent = `The answer: ${expected()}`;
      }

      $actions.hidden = false;
      $accept.hidden = verdict !== 'wrong';
      $listen.hidden = !cur.it.audio;
      counts();
      $input.focus();
    }

    /** "My answer was right": keep it as a synonym / extra reading and count it. */
    async function acceptMine() {
      if (phase !== 'shown' || verdict !== 'wrong' || busy) return;
      busy = true;
      try {
        const patch =
          part === 'meaning'
            ? { addSynonym: typed }
            : { addReading: KA.answer.canonReading(typed) };
        const r = await KA.api.item(cur.it.id, patch);
        KA.setItemState(cur.it.id, r.state);
        if (part === 'meaning') {
          cur.wrongM -= 1;
          cur.needM = false;
        } else {
          cur.wrongR -= 1;
          cur.needR = false;
        }
        right += 1;
        verdict = 'correct';
        root.classList.remove('is-wrong');
        root.classList.add('is-correct');
        $feedback.textContent =
          part === 'meaning'
            ? `Added “${typed}” as one of your synonyms for ${cur.it.chars}.`
            : `Added ${typed} as an accepted reading for ${cur.it.chars}.`;
        $accept.hidden = true;
        counts();
      } catch (e) {
        $feedback.textContent = `Could not save that: ${e.message}`;
      } finally {
        busy = false;
        $input.focus();
      }
    }

    function advance() {
      if (phase !== 'shown' || busy) return;
      const e = queue.shift();
      if (verdict === 'wrong') {
        // Back in a few cards, so it is fresh but not immediate.
        const pos = Math.min(queue.length, 2 + Math.floor(Math.random() * 3));
        queue.splice(pos, 0, e);
      } else if (e.needM || e.needR) {
        queue.unshift(e); // the other half, straight away
      } else {
        complete(e);
      }
      if (wrapping) {
        for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].started) queue.splice(i, 1);
      }
      if (!finished) show();
    }

    /**
     * Saved in the background — the next card never waits for the disk. The
     * summary waits for every save to land, so it reports what was stored.
     */
    const pending = [];
    function complete(e) {
      const wrong = e.wrongM + e.wrongR;
      const entry = { it: e.it, wrongM: e.wrongM, wrongR: e.wrongR };
      done.push(entry);
      const call =
        mode === 'lesson'
          ? KA.api.learn(e.it.id)
          : mode === 'review'
            ? KA.api.review(e.it.id, e.wrongM, e.wrongR)
            : KA.api.practice(e.it.id, wrong === 0, wrong);
      pending.push(
        call
          .then((r) => {
            KA.setItemState(e.it.id, r.state);
            entry.from = r.from;
            entry.to = r.to;
          })
          .catch((err) => {
            entry.error = err.message;
          })
      );
    }

    function toggleInfo() {
      if (phase !== 'shown') return;
      if (!$panel.hidden) {
        $panel.hidden = true;
        return;
      }
      KA.clear($panel).appendChild(KA.itemDetails(cur.it));
      $panel.hidden = false;
    }

    function finish(early = false) {
      if (finished) return;
      finished = true;
      bindKana(false);
      document.removeEventListener('keydown', onDocKey);
      $input.readOnly = true;
      $feedback.textContent = pending.length ? 'Saving…' : '';
      Promise.allSettled(pending).then(() => {
        // Left for another screen while saving: the saves landed, keep that screen.
        if (!document.body.contains(root)) return;
        onDone({
          mode,
          done,
          answered,
          right,
          unfinished: queue.filter((q) => q.started).length,
          early,
        });
      });
    }

    /* -------------------------------------------------------- events */

    function onKey(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        if (phase === 'ask') submit();
        else advance();
      } else if (phase === 'shown' && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        toggleInfo();
      }
    }
    // Enter / F work even when focus has wandered to a button.
    function onDocKey(e) {
      if (!document.body.contains(root)) return document.removeEventListener('keydown', onDocKey);
      const t = e.target;
      if (t === $input || (t && /^(TEXTAREA|INPUT|SELECT)$/.test(t.tagName))) return;
      onKey(e);
    }

    $input.addEventListener('keydown', onKey);
    document.addEventListener('keydown', onDocKey);
    $go.addEventListener('click', () => (phase === 'ask' ? submit() : advance()));
    $info.addEventListener('click', toggleInfo);
    $accept.addEventListener('click', acceptMine);
    $listen.addEventListener('click', () => KA.play(cur && cur.it.audio));
    $wrap.addEventListener('click', () => {
      wrapping = true;
      $wrap.disabled = true;
      $wrap.textContent = 'Wrapping up…';
      if (phase === 'ask' && cur && !cur.started) {
        for (let i = queue.length - 1; i >= 0; i--) if (!queue[i].started) queue.splice(i, 1);
        if (!queue.length) return finish(true);
        show();
      }
    });
    $end.addEventListener('click', () => {
      const half = queue.filter((q) => q.started).length;
      if (half && !confirm(`Stop now? ${half} half-answered item(s) will not be saved.`)) return;
      finish(true);
    });

    show();
    return { finish, get queue() { return queue; } };
  };
})();
