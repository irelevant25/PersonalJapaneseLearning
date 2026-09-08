import { api } from '../api.js';
import { labelForType } from '../utils.js';
import { frontHtml, backHtml, speakTextFor } from '../components/cardView.js';
import { speak } from '../components/tts.js';

export async function renderStudy(root, navigate) {
  const state = {
    queue: [],
    total: 0,
    index: 0,
    flipped: false,
    done: 0,
    correct: 0,
    finished: false,
    lastFetchWasExtra: false,
  };

  async function loadQueue(extra) {
    const data = await api.getQueue(20, { extra });
    state.queue = data.items;
    state.total = data.items.length;
    state.index = 0;
    state.done = 0;
    state.correct = 0;
    state.flipped = false;
    state.finished = false;
    state.lastFetchWasExtra = extra;
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
    const heading = state.lastFetchWasExtra ? 'Nothing left to study' : "You're caught up for now";
    const body = state.lastFetchWasExtra
      ? "There's genuinely nothing left available — everything unlocked so far has either been introduced already or isn't due for review yet."
      : "You've reached today's planned new-card limit, and nothing you've studied yet is due for review again today (reviews resurface starting tomorrow). That's normal pacing, not a wall.";

    root.innerHTML = `
      <section class="panel empty-state">
        <h2>${heading}</h2>
        <p>${body}</p>
        <div class="empty-actions">
          ${!state.lastFetchWasExtra ? '<button class="btn-primary" id="study-extra">Study extra cards anyway</button>' : ''}
          <button class="btn-secondary" id="go-stats">View stats</button>
        </div>
      </section>`;

    root.querySelector('#go-stats').addEventListener('click', () => navigate('stats'));
    root.querySelector('#study-extra')?.addEventListener('click', async () => {
      await loadQueue(true);
      render();
    });
  }

  function renderFinished() {
    const pct = state.done ? Math.round((state.correct / state.done) * 100) : 0;
    root.innerHTML = `
      <section class="panel empty-state">
        <h2>Session complete</h2>
        <p>You reviewed ${state.done} card${state.done === 1 ? '' : 's'} at ${pct}% correct.</p>
        <button class="btn-primary" id="study-again">Study more</button>
      </section>`;
    root.querySelector('#study-again').addEventListener('click', async () => {
      await loadQueue(false);
      render();
    });
  }

  function renderCard() {
    const item = currentItem();
    const card = item.card;
    const progressPct = Math.min(100, Math.round((state.done / state.total) * 100));

    root.innerHTML = `
      <div class="study-progress"><div class="study-progress-fill" style="width:${progressPct}%"></div></div>
      <div class="study-meta">${state.done + 1} / ${state.total} &middot; ${labelForType(card.type)}${item.reason === 'new' ? ' &middot; new' : ''}</div>
      <section class="flashcard">
        ${state.flipped ? backHtml(card) : frontHtml(card)}
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
    const item = currentItem();
    state.done += 1;
    if (g !== 'again') state.correct += 1;

    try {
      await api.submitReview(item.id, g);
    } catch (err) {
      console.error('Failed to save review:', err);
    }

    if (g === 'again' && state.index + 3 < state.queue.length) {
      // Resurface it later in this same session instead of losing it for a day.
      const [reinserted] = state.queue.splice(state.index, 1);
      state.queue.splice(state.index + 3, 0, reinserted);
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
  await loadQueue(false);
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
