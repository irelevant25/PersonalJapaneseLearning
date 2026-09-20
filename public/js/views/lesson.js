import { api } from '../api.js';
import { escapeHtml, labelForType } from '../utils.js';
import { frontHtml, backHtml, speakTextFor } from '../components/cardView.js';
import { speak } from '../components/tts.js';

// Runs one learning-path step (learn / drill / sentences / story) or a
// test-out, then shows the result. The pass rule and unlocking live on the
// server (server/lib/path.js): this view only counts first-try answers and
// posts {correct, total}. A wrong answer comes back once at the end of the
// round for practice, but never changes the score.

const PROMPT_LABEL = {
  hiragana: 'Which sound is this?',
  katakana: 'Which sound is this?',
  kanji: 'What does this kanji mean?',
  vocab: 'What does this word mean?',
  grammar: 'What does this grammar mean?',
  sentence: 'What does this sentence mean?',
};

const REVERSE_LABEL = {
  hiragana: 'Pick the hiragana',
  katakana: 'Pick the katakana',
  kanji: 'Pick the kanji',
  vocab: 'Pick the word',
  grammar: 'Pick the grammar pattern',
  sentence: 'Pick the Japanese sentence',
};

// One document keydown listener for the whole view; each screen swaps in its own handler.
function createKeys() {
  let handler = null;
  const listener = (e) => handler?.(e);
  document.addEventListener('keydown', listener);
  return {
    set: (fn) => {
      handler = fn;
    },
    destroy: () => document.removeEventListener('keydown', listener),
  };
}

function renderBlocked(root, navigate, message) {
  root.innerHTML = `
    <section class="panel empty-state">
      <h2>This step is not open</h2>
      <p>${escapeHtml(message)}</p>
      <button class="btn-primary" id="ls-path">Back to the path</button>
    </section>`;
  root.querySelector('#ls-path').addEventListener('click', () => navigate('learn'));
}

function lessonShell(root, navigate, { kicker, title, steps, currentStepId }) {
  root.innerHTML = `
    <section class="panel lesson">
      <div class="lesson-head">
        <button class="btn-secondary" id="ls-back">&larr; Path</button>
        <div>
          <div class="muted">${escapeHtml(kicker)}</div>
          <h2 class="lesson-title">${escapeHtml(title)}</h2>
        </div>
      </div>
      ${
        steps
          ? `<ol class="step-dots">${steps
              .map((s) => `<li class="${s.id === currentStepId ? 'is-current' : s.status === 'passed' ? 'is-passed' : ''}">${escapeHtml(s.short)}</li>`)
              .join('')}</ol>`
          : ''
      }
      <div id="ls-body"></div>
    </section>`;
  root.querySelector('#ls-back').addEventListener('click', () => navigate('learn'));
  return root.querySelector('#ls-body');
}

export async function renderLesson(root, navigate, [unitId, stepId] = []) {
  let data;
  try {
    data = await api.getPathStep(unitId, stepId);
  } catch (err) {
    renderBlocked(root, navigate, err.message);
    return undefined;
  }

  const keys = createKeys();
  const { unit, step } = data;
  const body = lessonShell(root, navigate, {
    kicker: `${unit.sectionTitle} · Unit ${unit.number}`,
    title: `${unit.title} — ${step.title}`,
    steps: unit.steps,
    currentStepId: step.id,
  });

  function start() {
    keys.set(null);
    if (step.type === 'learn') runLearn(body, data, keys, finish);
    else if (step.type === 'story') runStory(body, data, keys, finish);
    else runQuiz(body, data.questions, keys, finish);
  }

  async function finish(score) {
    keys.set(null);
    body.innerHTML = '<div class="loading">Saving…</div>';
    let result;
    try {
      result = await api.submitPathStep(unit.id, step.id, score);
    } catch (err) {
      body.innerHTML = `<div class="error-box">Could not save your result: ${escapeHtml(err.message)}</div>`;
      return;
    }
    renderStepResult(body, result, { unit, step, story: data.story, keys, navigate, retry });
  }

  async function retry() {
    try {
      data = await api.getPathStep(unit.id, step.id); // fresh random questions
    } catch (err) {
      body.innerHTML = `<div class="error-box">${escapeHtml(err.message)}</div>`;
      return;
    }
    start();
  }

  if (step.type === 'story' && !data.story) {
    body.innerHTML = '<p class="muted">The story for this unit is not written yet. It will appear here later.</p>';
  } else {
    start();
  }
  return () => keys.destroy();
}

export async function renderTestOut(root, navigate, [unitId] = []) {
  let data;
  try {
    data = await api.getTestOut(unitId);
  } catch (err) {
    renderBlocked(root, navigate, err.message);
    return undefined;
  }

  const keys = createKeys();
  const first = data.units[0];
  const last = data.units[data.units.length - 1];
  const range = first.id === last.id ? `Unit ${first.number}` : `Units ${first.number}–${last.number}`;
  const body = lessonShell(root, navigate, { kicker: 'Test out', title: range });

  function intro() {
    keys.set(null);
    body.innerHTML = `
      <div class="lesson-result">
        <p class="result-message">Already know this? Answer ${data.questions.length} questions from ${escapeHtml(range)}.</p>
        <p class="muted">With ${data.passAccuracy}% or more, ${first.id === last.id ? 'this unit is' : 'these units are'} marked as done and the cards go into your reviews, spread over the next week. If you don't pass, nothing changes.</p>
        <div class="lesson-actions">
          <button class="btn-primary btn-large" id="to-start">Start the test</button>
        </div>
      </div>`;
    body.querySelector('#to-start').addEventListener('click', () => runQuiz(body, data.questions, keys, finish));
  }

  async function finish(score) {
    keys.set(null);
    body.innerHTML = '<div class="loading">Saving…</div>';
    let result;
    try {
      result = await api.submitTestOut(unitId, score);
    } catch (err) {
      body.innerHTML = `<div class="error-box">Could not save your result: ${escapeHtml(err.message)}</div>`;
      return;
    }
    const message = result.passed
      ? `${range} done! ${result.introduced} card${result.introduced === 1 ? ' was' : 's were'} added to your reviews.`
      : `You need ${result.passAccuracy}% to test out. Nothing changed, so just continue the path normally.`;
    renderResultScreen(body, {
      accuracy: result.accuracy,
      pass: result.passed,
      message,
      next: result.passed ? result.next : null,
      nextLabel: result.next ? `Continue: Unit ${result.next.unitNumber}` : '',
      retryLabel: result.passed ? null : 'Try again',
      keys,
      navigate,
      retry: async () => {
        try {
          data = await api.getTestOut(unitId);
        } catch (err) {
          body.innerHTML = `<div class="error-box">${escapeHtml(err.message)}</div>`;
          return;
        }
        intro();
      },
    });
  }

  intro();
  return () => keys.destroy();
}

function renderStepResult(body, result, { unit, step, story, keys, navigate, retry }) {
  const open = result.passedNow || !!result.record.passedAt;
  const next = result.next;
  const finishesUnit = open && (!next || next.unitId !== unit.id);

  let message;
  if (step.type === 'learn') message = "You've seen all the new cards. Now let's check them in a drill.";
  else if (result.passedNow && finishesUnit) message = `Unit ${unit.number} complete! 🎉`;
  else if (result.passedNow) message = 'Step passed. Nice work!';
  else if (open) message = `Not this time, but your best is ${result.record.bestAccuracy}%, so the path stays open.`;
  else message = `You need ${result.passAccuracy}% to continue. Try again. It gets easier every time.`;

  const extra = [];
  if (result.introduced) {
    extra.push(`<p class="muted">${result.introduced} card${result.introduced === 1 ? ' was' : 's were'} added to your reviews. They come back tomorrow.</p>`);
  }
  if (story) {
    extra.push(`
      <details class="story-recap">
        <summary>See the translation</summary>
        ${story.lines.map((l) => `<p>${escapeHtml(l.jp)}<br><span class="muted">${escapeHtml(l.en)}</span></p>`).join('')}
      </details>`);
  }

  renderResultScreen(body, {
    accuracy: step.type === 'learn' ? null : result.accuracy,
    pass: open,
    message,
    extraHtml: extra.join(''),
    next: open ? next : null,
    nextLabel: next && next.unitId === unit.id ? 'Continue' : next ? `Next: Unit ${next.unitNumber}` : '',
    retryLabel: step.type === 'learn' ? 'See the cards again' : open ? 'Practice again' : 'Try again',
    keys,
    navigate,
    retry,
  });
}

function renderResultScreen(body, { accuracy, pass, message, extraHtml = '', next, nextLabel, retryLabel, keys, navigate, retry }) {
  body.innerHTML = `
    <div class="lesson-result ${pass ? 'is-pass' : 'is-fail'}">
      ${accuracy === null ? '' : `<div class="result-score">${accuracy}%</div>`}
      <p class="result-message">${escapeHtml(message)}</p>
      ${extraHtml}
      <div class="lesson-actions">
        ${next ? `<button class="btn-primary btn-large" id="rs-next">${escapeHtml(nextLabel)} &rarr;</button>` : ''}
        ${retryLabel ? `<button class="${next ? 'btn-secondary' : 'btn-primary btn-large'}" id="rs-retry">${escapeHtml(retryLabel)}</button>` : ''}
        <button class="btn-secondary" id="rs-path">Back to the path</button>
      </div>
    </div>`;

  const goNext = () => navigate('lesson', next.unitId, next.stepId);
  body.querySelector('#rs-next')?.addEventListener('click', goNext);
  body.querySelector('#rs-retry')?.addEventListener('click', retry);
  body.querySelector('#rs-path').addEventListener('click', () => navigate('learn'));
  keys.set((e) => {
    if (e.code !== 'Enter') return;
    e.preventDefault();
    if (next) goNext();
    else if (retryLabel) retry();
  });
}

/** Learn: flip through every new card of the unit, with its full details. */
function runLearn(body, data, keys, done) {
  const { cards, today } = data;
  let index = 0;

  const warnings = [];
  if (today.newCardsToday + cards.length > today.dailyNewCards) {
    warnings.push(`This unit adds ${cards.length} new cards, and you've added ${today.newCardsToday} today (daily pace: ${today.dailyNewCards}). You can continue, but your reviews will grow.`);
  }
  if (today.dueToday > 0) {
    warnings.push(`You have ${today.dueToday} review${today.dueToday === 1 ? '' : 's'} due. It's a good idea to do them first.`);
  }
  const warningHtml = warnings.map((w) => `<div class="notice notice-warn"><span>${escapeHtml(w)}</span></div>`).join('');

  function show() {
    const { card, inReview } = cards[index];
    body.innerHTML = `
      ${index === 0 ? warningHtml : ''}
      <div class="study-meta">${index + 1} / ${cards.length} · ${labelForType(card.type)}${inReview ? ' · already in your reviews' : ''}</div>
      <section class="flashcard learn-card">
        ${card.type === 'grammar' ? frontHtml(card) : ''}
        ${backHtml(card)}
      </section>
      <div class="lesson-actions">
        <button class="btn-secondary" id="ln-prev" ${index === 0 ? 'disabled' : ''}>&larr; Back</button>
        <button class="btn-icon" id="ln-listen" title="Listen">&#128266;</button>
        <button class="btn-primary btn-large" id="ln-next">${index === cards.length - 1 ? 'Finish' : 'Next'} &rarr;</button>
      </div>
      <p class="muted lesson-keys">Keys: &rarr; or Space for next, &larr; for back</p>`;
    body.querySelector('#ln-prev').addEventListener('click', back);
    body.querySelector('#ln-next').addEventListener('click', forward);
    body.querySelector('#ln-listen').addEventListener('click', () => speak(speakTextFor(card)));
  }

  function forward() {
    if (index === cards.length - 1) done({});
    else {
      index += 1;
      show();
    }
  }

  function back() {
    if (index === 0) return;
    index -= 1;
    show();
  }

  keys.set((e) => {
    if (e.code === 'ArrowRight' || e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      forward();
    } else if (e.code === 'ArrowLeft') {
      back();
    }
  });
  show();
}

/** Story: read (and listen), then answer comprehension questions with the story still visible. */
function runStory(body, data, keys, done) {
  const { story, questions } = data;
  let showReading = true;

  const linesHtml = (withListen) =>
    story.lines
      .map(
        (l, i) => `
      <li>
        <div class="story-line-jp">${escapeHtml(l.jp)}${withListen ? ` <button class="btn-icon btn-icon-inline" data-line="${i}" title="Listen">&#128266;</button>` : ''}</div>
        <div class="story-line-reading" ${showReading && l.reading !== l.jp ? '' : 'hidden'}>${escapeHtml(l.reading)}</div>
      </li>`
      )
      .join('');

  body.innerHTML = `
    <div class="reader-toolbar">
      <label class="checkbox-label"><input type="checkbox" id="st-reading" checked /> Show reading</label>
      <button class="btn-icon" id="st-listen-all" title="Listen to the whole story">&#128266;</button>
    </div>
    <div class="story-reader-inline">
      <h3 class="story-title">${escapeHtml(story.title)}</h3>
      ${story.titleReading && story.titleReading !== story.title ? `<p class="muted">${escapeHtml(story.titleReading)}</p>` : ''}
      <ol class="story-lines">${linesHtml(true)}</ol>
    </div>
    <p class="muted">Read the story. Listen too, if you like. Then answer ${questions.length} questions about it.</p>
    <div class="lesson-actions">
      <button class="btn-primary btn-large" id="st-go">Answer the questions &rarr;</button>
    </div>`;

  body.querySelector('#st-reading').addEventListener('change', (e) => {
    showReading = e.target.checked;
    body.querySelectorAll('.story-line-reading').forEach((el, i) => {
      el.hidden = !showReading || story.lines[i].reading === story.lines[i].jp;
    });
  });
  body.querySelector('#st-listen-all').addEventListener('click', () => speak(story.lines.map((l) => l.jp).join(' ')));
  body.querySelectorAll('[data-line]').forEach((btn) => {
    btn.addEventListener('click', () => speak(story.lines[Number(btn.dataset.line)].jp));
  });

  const go = () => {
    const recap = `
      <details class="story-recap" open>
        <summary>The story</summary>
        <ol class="story-lines">${linesHtml(false)}</ol>
      </details>`;
    runQuiz(body, questions, keys, done, { headerHtml: recap });
  };
  body.querySelector('#st-go').addEventListener('click', go);
  keys.set((e) => {
    if (e.code === 'Enter') {
      e.preventDefault();
      go();
    }
  });
}

/**
 * Multiple choice. `questions` are either card questions (from lib/exam.js
 * buildQuestion: {card, prompt, choices, correctIndex, reverse, hint}) or
 * story questions ({prompt, promptReading, choices, correctIndex}).
 */
function runQuiz(body, questions, keys, done, { headerHtml = '' } = {}) {
  if (!questions.length) {
    body.innerHTML = '<p class="error-box">No questions could be made for this step.</p>';
    return;
  }
  const queue = questions.map((q) => ({ q, retry: false }));
  const total = questions.length;
  let pos = 0;
  let firstTries = 0;
  let correct = 0;
  let answered = false;

  function promptHtml(q) {
    if (!q.card) {
      return `<div class="quiz-text-prompt">${escapeHtml(q.prompt)}</div>${q.promptReading ? `<div class="card-reading">${escapeHtml(q.promptReading)}</div>` : ''}`;
    }
    if (q.reverse) return `<div class="quiz-text-prompt">${escapeHtml(q.prompt)}</div>`;
    return frontHtml(q.card, q.hint);
  }

  function show() {
    answered = false;
    const { q, retry } = queue[pos];
    const label = !q.card ? 'Answer the question' : q.reverse ? REVERSE_LABEL[q.type] : PROMPT_LABEL[q.type];
    const canListen = q.card && !q.reverse;
    body.innerHTML = `
      ${headerHtml}
      <div class="study-progress"><div class="study-progress-fill" style="width:${Math.round((firstTries / total) * 100)}%"></div></div>
      <div class="study-meta">${retry ? 'One more try (this does not change your score)' : `${firstTries + 1} / ${total}`}</div>
      <p class="quiz-label">${escapeHtml(label)}</p>
      <section class="flashcard exam-prompt">${promptHtml(q)}</section>
      ${canListen ? '<div class="study-actions"><button class="btn-icon" id="qz-listen" title="Listen">&#128266;</button></div>' : ''}
      <div class="exam-choices">
        ${q.choices.map((c, i) => `<button class="exam-choice" data-choice="${i}"><span class="choice-key">${i + 1}</span> ${escapeHtml(c)}</button>`).join('')}
      </div>
      <p class="quiz-feedback" id="qz-feedback"></p>
      <div class="exam-next-wrap"><button class="btn-primary" id="qz-next" hidden>Next (Enter)</button></div>`;

    body.querySelector('#qz-listen')?.addEventListener('click', () => speak(speakTextFor(q.card)));
    body.querySelectorAll('.exam-choice').forEach((btn) => btn.addEventListener('click', () => select(Number(btn.dataset.choice))));
    body.querySelector('#qz-next').addEventListener('click', next);
  }

  function select(i) {
    if (answered) return;
    answered = true;
    const { q, retry } = queue[pos];
    const isCorrect = i === q.correctIndex;
    if (!retry) {
      firstTries += 1;
      if (isCorrect) correct += 1;
      else queue.push({ q, retry: true });
    }

    body.querySelectorAll('.exam-choice').forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === q.correctIndex) btn.classList.add('choice-correct');
      else if (idx === i) btn.classList.add('choice-incorrect');
    });
    const feedback = body.querySelector('#qz-feedback');
    feedback.textContent = isCorrect ? 'Correct!' : `Not quite. The answer is: ${q.choices[q.correctIndex]}`;
    feedback.className = `quiz-feedback ${isCorrect ? 'is-correct' : 'is-incorrect'}`;
    body.querySelector('#qz-next').hidden = false;
    body.querySelector('.study-progress-fill').style.width = `${Math.round((firstTries / total) * 100)}%`;
  }

  function next() {
    pos += 1;
    if (pos >= queue.length) done({ correct, total });
    else show();
  }

  keys.set((e) => {
    if (!answered) {
      const n = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 }[e.code];
      if (n !== undefined && n < queue[pos].q.choices.length) select(n);
    } else if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      next();
    }
  });
  show();
}
