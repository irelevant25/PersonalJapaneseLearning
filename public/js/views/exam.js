import { api } from '../api.js';
import { escapeHtml, labelForType } from '../utils.js';
import { frontHtml, speakTextFor } from '../components/cardView.js';
import { speak } from '../components/tts.js';

// A mock exam is generated from cards already studied (never new material)
// and is purely a self-check: answering never touches SRS scheduling. Only
// the aggregate score gets logged (via /api/exam/submit) for the Stats page.
export async function renderExam(root, navigate) {
  const state = {
    questions: [],
    index: 0,
    answers: [], // { cardId, type, correct }
    selected: null,
    finished: false,
  };

  function render() {
    if (state.questions.length === 0) {
      renderStart();
    } else if (state.finished) {
      renderResults();
    } else {
      renderQuestion();
    }
  }

  function renderStart(message) {
    root.innerHTML = `
      <section class="panel empty-state">
        <h2>Mock exam</h2>
        <p>Multiple-choice questions built only from cards you've already studied — a closer match to the real JLPT format than flashcards, and a good way to spot-check what's actually sticking. Answering here never changes any card's schedule.</p>
        ${message ? `<p class="muted">${escapeHtml(message)}</p>` : ''}
        <label class="exam-count-label">Number of questions
          <input type="number" id="exam-count" min="5" max="50" value="20" />
        </label>
        <button class="btn-primary btn-large" id="start-exam">Start exam</button>
      </section>`;
    root.querySelector('#start-exam').addEventListener('click', async () => {
      const count = Number(root.querySelector('#exam-count').value) || 20;
      const data = await api.getExam(count);
      if (data.questions.length === 0) {
        renderStart("You haven't studied enough cards yet for a mock exam — do a few Study sessions first, then come back.");
        return;
      }
      state.questions = data.questions;
      state.index = 0;
      state.answers = [];
      state.selected = null;
      state.finished = false;
      render();
    });
  }

  function currentQuestion() {
    return state.questions[state.index];
  }

  function renderQuestion() {
    const q = currentQuestion();
    const progressPct = Math.round((state.index / state.questions.length) * 100);

    root.innerHTML = `
      <div class="study-progress"><div class="study-progress-fill" style="width:${progressPct}%"></div></div>
      <div class="study-meta">${state.index + 1} / ${state.questions.length} &middot; ${labelForType(q.type)}</div>
      <section class="flashcard exam-prompt">
        ${frontHtml(q.card)}
      </section>
      <div class="study-actions">
        <button class="btn-icon" id="listen-btn" title="Listen">&#128266;</button>
      </div>
      <div class="exam-choices">
        ${q.choices.map((c, i) => `<button class="exam-choice" data-choice="${i}">${escapeHtml(c)}</button>`).join('')}
      </div>
      <div class="exam-next-wrap"><button class="btn-primary" id="next-btn" hidden>Next</button></div>
    `;

    root.querySelector('#listen-btn').addEventListener('click', () => speak(speakTextFor(q.card)));
    root.querySelectorAll('.exam-choice').forEach((btn) => {
      btn.addEventListener('click', () => selectChoice(Number(btn.dataset.choice)));
    });
    root.querySelector('#next-btn').addEventListener('click', next);
  }

  function selectChoice(i) {
    if (state.selected !== null) return; // already answered
    state.selected = i;
    const q = currentQuestion();
    const correct = i === q.correctIndex;
    state.answers.push({ cardId: q.cardId, type: q.type, correct });

    root.querySelectorAll('.exam-choice').forEach((btn, idx) => {
      btn.disabled = true;
      if (idx === q.correctIndex) btn.classList.add('choice-correct');
      else if (idx === i) btn.classList.add('choice-incorrect');
    });
    root.querySelector('#next-btn').hidden = false;
  }

  async function next() {
    state.selected = null;
    state.index += 1;
    if (state.index >= state.questions.length) {
      state.finished = true;
      try {
        await api.submitExam(state.answers);
      } catch (err) {
        console.error('Failed to save exam result:', err);
      }
    }
    render();
  }

  function renderResults() {
    const correct = state.answers.filter((a) => a.correct).length;
    const total = state.answers.length;
    const pct = total ? Math.round((correct / total) * 100) : 0;

    const byType = {};
    for (const a of state.answers) {
      const bucket = (byType[a.type] ||= { total: 0, correct: 0 });
      bucket.total += 1;
      if (a.correct) bucket.correct += 1;
    }

    const missed = state.answers
      .map((a, i) => ({ ...a, q: state.questions[i] }))
      .filter((a) => !a.correct);

    root.innerHTML = `
      <section class="panel empty-state">
        <h2>${pct}% (${correct}/${total})</h2>
        <p>Score breakdown by category:</p>
        <div class="table-scroll">
          <table class="stats-table">
            <thead><tr><th>Category</th><th>Correct</th><th>Total</th></tr></thead>
            <tbody>
              ${Object.entries(byType)
                .map(([type, b]) => `<tr><td>${labelForType(type)}</td><td>${b.correct}</td><td>${b.total}</td></tr>`)
                .join('')}
            </tbody>
          </table>
        </div>
        ${
          missed.length
            ? `<h3>Missed (${missed.length})</h3>
               <div class="browse-list">
                 ${missed
                   .map(
                     (m) =>
                       `<div class="browse-item leech-item"><span class="browse-item-main"><span class="s-char">${escapeHtml(
                         m.q.prompt
                       )}</span><span class="s-sub">${escapeHtml(m.q.choices[m.q.correctIndex])}</span></span></div>`
                   )
                   .join('')}
               </div>`
            : '<p>Nothing missed — great run.</p>'
        }
        <div class="empty-actions">
          <button class="btn-primary" id="exam-again">Take another exam</button>
          <button class="btn-secondary" id="go-dashboard">Back to dashboard</button>
        </div>
      </section>`;

    root.querySelector('#exam-again').addEventListener('click', () => {
      state.questions = [];
      render();
    });
    root.querySelector('#go-dashboard').addEventListener('click', () => navigate('dashboard'));
  }

  function keyHandler(e) {
    if (state.questions.length === 0 || state.finished) return;
    if (state.selected === null) {
      const map = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3 };
      if (map[e.code] !== undefined && map[e.code] < currentQuestion().choices.length) {
        selectChoice(map[e.code]);
      }
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      next();
    }
  }

  document.addEventListener('keydown', keyHandler);
  render();

  return () => document.removeEventListener('keydown', keyHandler);
}
