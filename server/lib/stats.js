// Computes everything the dashboard/stats view needs in one pass: per-category
// mastery breakdown, due forecast, streak, rolling accuracy, and exam countdown.

import { todayStr, addDays, diffDays } from './dates.js';
import { isKnown, isDue, isMature } from './srs.js';
import { SRS_TRACKED_TYPES } from './content.js';

export function computeStats(progress, contentByType, curriculumPhase) {
  const today = todayStr();
  const cards = progress.cards;

  // `story` is excluded here — it's not SRS-tracked (see content.js), so a
  // new/learning/known/mature breakdown wouldn't mean anything for it.
  const byType = {};
  for (const type of SRS_TRACKED_TYPES) {
    const items = contentByType[type];
    let known = 0;
    let mature = 0;
    let leech = 0;
    let learning = 0;
    let newCount = 0;
    for (const c of items) {
      const st = cards[c.id];
      if (!st) {
        newCount++;
        continue;
      }
      if (st.isLeech) leech++;
      if (isKnown(st)) known++;
      else learning++;
      if (isMature(st)) mature++;
    }
    byType[type] = { total: items.length, new: newCount, learning, known, mature, leech };
  }

  const dueToday = Object.values(cards).filter((s) => isDue(s, today)).length;
  const forecast = [];
  for (let i = 0; i < 7; i++) {
    const date = addDays(today, i);
    forecast.push({ date, due: Object.values(cards).filter((s) => s.due === date).length });
  }

  const streak = computeStreak(progress.sessions, today);
  const accuracy = {
    today: accuracyPct(progress.sessions, today, 1),
    last3: accuracyPct(progress.sessions, today, 3),
    last7: accuracyPct(progress.sessions, today, 7),
    last30: accuracyPct(progress.sessions, today, 30),
  };

  const examDate = progress.settings.examDate;
  const daysToExam = examDate ? diffDays(examDate, today) : null;

  const leechCards = Object.entries(cards)
    .filter(([, s]) => s.isLeech)
    .map(([id]) => id);

  return {
    today,
    byType,
    dueToday,
    forecast,
    streak,
    accuracy,
    examDate,
    daysToExam,
    curriculumPhase,
    settings: progress.settings,
    leechCards,
  };
}

function accuracyPct(sessions, today, days) {
  let correct = 0;
  let total = 0;
  for (let i = 0; i < days; i++) {
    const s = sessions[addDays(today, -i)];
    if (s) {
      correct += s.correct || 0;
      total += s.studied || 0;
    }
  }
  return total === 0 ? null : Math.round((correct / total) * 100);
}

function computeStreak(sessions, today) {
  let streak = 0;
  let d = sessions[today] && sessions[today].studied > 0 ? today : addDays(today, -1);
  while (sessions[d] && sessions[d].studied > 0) {
    streak++;
    d = addDays(d, -1);
  }
  return streak;
}
