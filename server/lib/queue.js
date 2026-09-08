// Builds "today's" study queue: overdue/due reviews first, then a capped
// batch of new cards chosen by curriculum phase weighting. Sentences are
// special-cased — they unlock per-item once every vocab word they use is
// already "known" (see srs.isKnown), rather than by a fixed weekly budget.

import { todayStr, diffDays } from './dates.js';
import { isDue, isKnown } from './srs.js';

const TYPE_TIEBREAK_ORDER = ['hiragana', 'katakana', 'kanji', 'vocab', 'grammar', 'sentence'];

export function buildQueue({ contentByType, progress, curriculumPhase, limit = 30, extra = false }) {
  const today = todayStr();
  const cardsState = progress.cards;

  const due = [];
  for (const [id, state] of Object.entries(cardsState)) {
    if (!isDue(state, today)) continue;
    const card = findInContent(contentByType, id);
    if (!card) continue;
    due.push({ id, type: card.type, reason: 'review', overdue: diffDays(today, state.due) });
  }
  due.sort((a, b) => {
    if (b.overdue !== a.overdue) return b.overdue - a.overdue;
    return TYPE_TIEBREAK_ORDER.indexOf(a.type) - TYPE_TIEBREAK_ORDER.indexOf(b.type);
  });

  // `extra` is an explicit, user-initiated opt-in (the "study extra cards"
  // button once the normal queue is empty) that ignores today's new-card
  // pacing cap for one fetch. It does NOT bypass the curriculum's own gating
  // (e.g. Exam Prep's empty `weights` still yields zero new cards) — it only
  // lifts the numeric daily-pace limit, which is a soft pacing aid, not a
  // pedagogical restriction.
  const introducedToday = progress.sessions[today]?.newCards || 0;
  const dailyTarget = curriculumPhase.newCardsOverride ?? progress.settings.newCardsPerDay;
  const budget = extra ? limit : Math.max(0, dailyTarget - introducedToday);
  const newItems = pickNewCards({ contentByType, cardsState, curriculumPhase, progress, budget });

  const queue = [
    ...due.map((d) => ({ id: d.id, type: d.type, reason: 'review' })),
    ...newItems.map((c) => ({ id: c.id, type: c.type, reason: 'new' })),
  ];

  return queue.slice(0, limit);
}

function findInContent(contentByType, id) {
  for (const list of Object.values(contentByType)) {
    const found = list.find((c) => c.id === id);
    if (found) return found;
  }
  return undefined;
}

function pickNewCards({ contentByType, cardsState, curriculumPhase, progress, budget }) {
  if (budget <= 0) return [];

  let weights = { ...(curriculumPhase.weights || {}) };
  if (progress.settings.kanaGateActive) {
    for (const cat of Object.keys(weights)) {
      if (cat !== 'hiragana' && cat !== 'katakana') weights[cat] *= 0.15;
    }
  }

  const categories = Object.keys(weights).filter((c) => weights[c] > 0);
  if (categories.length === 0) return [];
  const totalWeight = categories.reduce((sum, c) => sum + weights[c], 0) || 1;

  // Largest-remainder method so weighted slot counts always sum to `budget`.
  const raw = categories.map((cat) => {
    const exact = (weights[cat] / totalWeight) * budget;
    return { cat, count: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let used = raw.reduce((sum, r) => sum + r.count, 0);
  let remaining = budget - used;
  const byRemainder = raw.slice().sort((a, b) => b.rem - a.rem);
  for (let i = 0; i < remaining; i++) byRemainder[i % byRemainder.length].count += 1;

  const picked = [];
  for (const { cat, count } of raw) {
    if (count <= 0) continue;
    if (cat === 'sentence') {
      picked.push(...pickEligibleSentences(contentByType.sentence || [], cardsState, count));
    } else {
      const pool = contentByType[cat] || [];
      const next = pool.filter((c) => !cardsState[c.id]).slice(0, count);
      picked.push(...next);
    }
  }
  return picked;
}

function pickEligibleSentences(sentences, cardsState, count) {
  const eligible = sentences.filter(
    (s) => !cardsState[s.id] && (s.words || []).every((wordId) => isKnown(cardsState[wordId]))
  );
  return eligible.slice(0, count);
}
