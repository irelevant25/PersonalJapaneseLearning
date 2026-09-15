// The adaptive engine: once per day, looks at recent performance and decides
// whether to change the daily new-card pace (the learning path's soft daily
// budget of cards to introduce) or ask for kana review before new units. Every change is logged with a plain-English reason so the
// dashboard can show *why* something changed, not just that it did.
//
// This is intentionally a small, explainable rule set rather than a black
// box — the goal is a study plan the user can trust and override, not a
// mysterious auto-pilot.

import { todayStr, addDays } from './dates.js';

const BOUNDS = { min: 5, max: 30 };
const KANA_SAMPLE_SIZE = 20;
const KANA_ACCURACY_THRESHOLD = 0.8;
const LOW_ACCURACY_THRESHOLD = 0.7;
const HIGH_ACCURACY_THRESHOLD = 0.9;
const BACKLOG_MULTIPLIER = 2.5;

export function runAdaptiveEngine(progress, contentByType) {
  const today = todayStr();
  if (progress.lastAdaptiveRun === today) return [];

  const changes = [];
  const current = progress.settings.newCardsPerDay;
  const acc3 = rollingAccuracy(progress.sessions, today, 3);
  const acc7 = rollingAccuracy(progress.sessions, today, 7);
  const dueCount = countDue(progress.cards, today);

  if (dueCount > current * BACKLOG_MULTIPLIER && current > BOUNDS.min) {
    const next = Math.max(BOUNDS.min, Math.round(current * 0.6));
    progress.settings.newCardsPerDay = next;
    changes.push(
      logEntry(
        today,
        `Reduced new cards/day: ${current} -> ${next}`,
        `You have ${dueCount} reviews due today, more than ${BACKLOG_MULTIPLIER}x your daily new-card rate. Pausing new material so the backlog doesn't snowball.`
      )
    );
  } else if (acc3 !== null && acc3 < LOW_ACCURACY_THRESHOLD && current > BOUNDS.min) {
    const next = Math.max(BOUNDS.min, Math.round(current * 0.8));
    progress.settings.newCardsPerDay = next;
    changes.push(
      logEntry(
        today,
        `Reduced new cards/day: ${current} -> ${next}`,
        `Your accuracy over the last 3 days was ${Math.round(acc3 * 100)}%, below the ${Math.round(LOW_ACCURACY_THRESHOLD * 100)}% comfort threshold. Slowing down new material so review quality can catch up.`
      )
    );
  } else if (
    acc7 !== null &&
    acc7 > HIGH_ACCURACY_THRESHOLD &&
    dueCount < current * 1.5 &&
    current < BOUNDS.max
  ) {
    const next = Math.min(BOUNDS.max, current + 3);
    progress.settings.newCardsPerDay = next;
    changes.push(
      logEntry(
        today,
        `Increased new cards/day: ${current} -> ${next}`,
        `Your 7-day accuracy is ${Math.round(acc7 * 100)}% with no review backlog. You can handle a faster pace.`
      )
    );
  }

  const kanaAcc = categoryAccuracy(progress, contentByType, ['hiragana', 'katakana'], KANA_SAMPLE_SIZE);
  if (kanaAcc !== null && kanaAcc < KANA_ACCURACY_THRESHOLD && !progress.settings.kanaGateActive) {
    progress.settings.kanaGateActive = true;
    changes.push(
      logEntry(
        today,
        'Prioritizing kana practice',
        `Recent hiragana/katakana accuracy is ${Math.round(kanaAcc * 100)}%, below ${Math.round(KANA_ACCURACY_THRESHOLD * 100)}%. The learning path will ask you to review kana before starting new units until kana recognition is solid — everything else depends on reading kana instantly.`
      )
    );
  } else if ((kanaAcc === null || kanaAcc >= KANA_ACCURACY_THRESHOLD) && progress.settings.kanaGateActive) {
    progress.settings.kanaGateActive = false;
    changes.push(
      logEntry(today, 'Kana gate lifted', 'Hiragana/katakana accuracy is back at or above the 80% threshold. The learning path no longer asks for kana review first.')
    );
  }

  progress.lastAdaptiveRun = today;
  if (changes.length) {
    progress.adaptiveLog.push(...changes);
    if (progress.adaptiveLog.length > 200) progress.adaptiveLog = progress.adaptiveLog.slice(-200);
  }
  return changes;
}

function logEntry(date, change, reason) {
  return { date, change, reason };
}

function rollingAccuracy(sessions, today, days) {
  let correct = 0;
  let total = 0;
  for (let i = 0; i < days; i++) {
    const s = sessions[addDays(today, -i)];
    if (s) {
      correct += s.correct || 0;
      total += s.studied || 0;
    }
  }
  return total === 0 ? null : correct / total;
}

function countDue(cards, today) {
  return Object.values(cards).filter((s) => s.due <= today).length;
}

function categoryAccuracy(progress, contentByType, types, sampleSize) {
  const ids = new Set();
  for (const t of types) for (const c of contentByType[t] || []) ids.add(c.id);

  const events = [];
  for (const [id, state] of Object.entries(progress.cards)) {
    if (!ids.has(id)) continue;
    for (const h of state.history) events.push(h);
  }
  events.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const recent = events.slice(0, sampleSize);
  if (recent.length < Math.min(10, sampleSize)) return null;

  const correct = recent.filter((e) => e.grade !== 'again').length;
  return correct / recent.length;
}
