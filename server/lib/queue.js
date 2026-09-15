// Builds the Study (review) queue: every due card, most overdue first. New
// material never enters here — cards are introduced only by the learning
// path (lib/path.js) — so Study is pure spaced-repetition review.

import { todayStr, diffDays } from './dates.js';
import { isDue } from './srs.js';

const TYPE_TIEBREAK_ORDER = ['hiragana', 'katakana', 'kanji', 'vocab', 'grammar', 'sentence'];

export function buildQueue({ contentByType, progress, limit = 30 }) {
  const today = todayStr();

  const due = [];
  for (const [id, state] of Object.entries(progress.cards)) {
    if (!isDue(state, today)) continue;
    const card = findInContent(contentByType, id);
    if (!card) continue;
    due.push({ id, type: card.type, reason: 'review', overdue: diffDays(today, state.due) });
  }
  due.sort((a, b) => {
    if (b.overdue !== a.overdue) return b.overdue - a.overdue;
    return TYPE_TIEBREAK_ORDER.indexOf(a.type) - TYPE_TIEBREAK_ORDER.indexOf(b.type);
  });

  return due.slice(0, limit).map((d) => ({ id: d.id, type: d.type, reason: 'review' }));
}

function findInContent(contentByType, id) {
  for (const list of Object.values(contentByType)) {
    const found = list.find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}
