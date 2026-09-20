import { api } from '../api.js';
import { escapeHtml, labelForType } from '../utils.js';
import { frontHtml, backHtml, speakTextFor } from '../components/cardView.js';
import { speak } from '../components/tts.js';

// Reviews: every due card, graded Again/Hard/Good/Easy. New cards never
// appear here — they enter review from the learning path (Learn tab).
export async function renderStudy(root, navigate) {
  const state = {
    queue: [],
    total: 0,
    index: 0,
    flipped: false,
    done: 0,
    correct: 0,
    finished: false,
    saving: false,
    saveError: '',
    capped: false,
    maxReviewsPerDay: 0,
  };

  async function loadQueue() {
    const data = await api.getQueue(20);
    state.queue = data.items;
    state.capped = data.capped;
    state.maxReviewsPerDay = data.maxReviewsPerDay;
    state.total = data.items.length;
    state.index = 0;
    state.done = 0;
    state.correct = 0;
    state.flipped = false;
    state.finished = false;
  }

  function currentItem() {
    return state.queue[state.index];
  }

  function render() {
    if (state.queue.length === 0) {
      renderEmpty();
    } else if (state.finished) {
      renderFinished();
    } else {
      renderCard();
    }
  }

  function renderEmpty() {
    const title = state.capped ? 'Daily review limit reached' : 'No reviews due right now';
    const text = state.capped
      ? `You did ${state.maxReviewsPerDay} reviews today. That is your daily maximum, so the rest waits for tomorrow. You can change the limit in Settings.`
      : "Everything you've learned is scheduled for a later day. New cards come from the learning path.";
    root.innerHTML = `
      <section class="panel empty-state">
        <h2>${title}</h2>
        <p>${text}</p>
        <div class="empty-actions">
          <button class="btn-primary" id="go-learn">Continue the learning path</button>
          <button class="btn-secondary" id="go-stats">View stats</button>
        </div>
      </section>`;

    root.querySelector('#go-learn').addEventListener('click', () => navigate('learn'));
    root.querySelector('#go-stats').addEventListener('click', () => navigate('stats'));
  }

  function renderFinished() {
    const pct = state.done ? Math.round((state.correct / state.done) * 100) : 0;
    root.innerHTML = `
      <section class="panel empty-state">
        <h2>Session complete</h2>
        <p>You reviewed ${state.done} card${state.done === 1 ? '' : 's'} at ${pct}% correct.</p>
        <div class="empty-actions">
          <button class="btn-primary" id="study-again">Review more</button>
          <button class="btn-secondary" id="go-learn">Continue the learning path</button>
        </div>
      </section>`;
    root.querySelector('#study-again').addEventListener('click', async () => {
      await loadQueue();
      render();
    });
    root.querySelector('#go-learn').addEventListener('click', () => navigate('learn'));
  }

  function renderCard() {
    const item = currentItem();
    const card = item.card;
    const progressPct = Math.min(100, Math.round((state.done / state.total) * 100));

    root.innerHTML = `
      <div class="study-progress"><div class="study-progress-fill" style="width:${progressPct}%"></div></div>
      ${state.saveError ? `<div class="notice notice-warn"><span>${escapeHtml(state.saveError)}</span></div>` : ''}
      <div class="study-meta">${state.done + 1} / ${state.total} &middot; ${labelForType(card.type)}</div>
      <section class="flashcard">
        ${state.flipped ? backHtml(card) : frontHtml(card, item.hint)}
      </section>
      <div class="study-actions">
        ${state.flipped ? gradeButtonsHtml() : '<button class="btn-primary btn-large" id="flip-btn">Show answer (Space)</button>'}
        <button class="btn-icon" id="listen-btn" title="Listen">&#128266;</button>
      </div>
    `;

    root.querySelector('#flip-btn')?.addEventListener('click', flip);
    root.querySelector('#listen-btn')?.addEventListener('click', () => speak(speakTextFor(card)));
    if (state.flipped) {
      root.querySelectorAll('[data-grade]').forEach((btn) => {
        btn.addEventListener('click', () => grade(btn.dataset.grade));
      });
    }
  }

  function flip() {
    state.flipped = true;
    render();
  }

  async function grade(g) {
    // A second key press while the first grade is still saving would grade
    // the same card twice.
    if (state.saving) return;
    state.saving = true;
    const item = currentItem();
    try {
      await api.submitReview(item.id, g);
      state.saveError = '';
    } catch (err) {
      // Keep the card on screen so the review is not silently lost.
      state.saveError = `Could not save this review (${err.message}). Is the app still running? Please try again.`;
      render();
      return;
    } finally {
      state.saving = false;
    }
    state.done += 1;
    if (g !== 'again') state.correct += 1;

    if (g === 'again' && state.index + 3 < state.queue.length) {
      // Resurface it later in this same session instead of losing it for a day.
      const [reinserted] = state.queue.splice(state.index, 1);
      state.queue.splice(state.index + 3, 0, reinserted);
      state.total += 1;
    } else {
      state.index += 1;
    }

    state.flipped = false;
    if (state.index >= state.queue.length) state.finished = true;
    render();
  }

  function keyHandler(e) {
    if (state.queue.length === 0 || state.finished) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.flipped) flip();
      return;
    }
    if (!state.flipped) return;
    const map = { Digit1: 'again', Digit2: 'hard', Digit3: 'good', Digit4: 'easy' };
    if (map[e.code]) grade(map[e.code]);
  }

  document.addEventListener('keydown', keyHandler);
  await loadQueue();
  render();

  return () => document.removeEventListener('keydown', keyHandler);
}

function gradeButtonsHtml() {
  return `
    <div class="grade-buttons">
      <button class="grade-btn grade-again" data-grade="again">Again<span>1</span></button>
      <button class="grade-btn grade-hard" data-grade="hard">Hard<span>2</span></button>
      <button class="grade-btn grade-good" data-grade="good">Good<span>3</span></button>
      <button class="grade-btn grade-easy" data-grade="easy">Easy<span>4</span></button>
    </div>`;
}
