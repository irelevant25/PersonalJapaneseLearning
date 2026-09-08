// A modified SM-2 (SuperMemo-2) spaced repetition scheduler with Anki-style
// 4-button grading. This is the only place scheduling math happens.

import { addDays, todayStr } from './dates.js';

const MIN_EFACTOR = 1.3;
const DEFAULT_EFACTOR = 2.5;

// Cap the max interval so even "mature" cards resurface at least this often
// before the exam — the user's stated memory issue means nothing should be
// allowed to drift out of rotation for months at a time.
export const MAX_INTERVAL_DAYS = 45;

export const LEECH_LAPSE_THRESHOLD = 4;

export function newCardState(today = todayStr()) {
  return {
    box: 0,
    efactor: DEFAULT_EFACTOR,
    interval: 0,
    reps: 0,
    lapses: 0,
    due: today,
    lastReview: null,
    isLeech: false,
    note: '',
    history: [],
  };
}

// grade: 'again' | 'hard' | 'good' | 'easy'
export function gradeCard(state, grade, today = todayStr()) {
  const s = { ...state, history: state.history.slice() };

  switch (grade) {
    case 'again':
      s.lapses += 1;
      s.reps = 0;
      s.box = 0;
      s.efactor = Math.max(MIN_EFACTOR, s.efactor - 0.2);
      s.interval = 1;
      if (s.lapses >= LEECH_LAPSE_THRESHOLD) s.isLeech = true;
      break;
    case 'hard':
      s.reps += 1;
      s.efactor = Math.max(MIN_EFACTOR, s.efactor - 0.15);
      s.interval = s.reps <= 1 ? 1 : Math.max(1, Math.round(s.interval * 1.2));
      s.box = Math.max(1, s.box);
      break;
    case 'good':
      s.reps += 1;
      if (s.reps === 1) s.interval = 1;
      else if (s.reps === 2) s.interval = 6;
      else s.interval = Math.round(s.interval * s.efactor);
      s.box += 1;
      break;
    case 'easy':
      s.reps += 1;
      s.efactor += 0.15;
      if (s.reps === 1) s.interval = 2;
      else if (s.reps === 2) s.interval = 8;
      else s.interval = Math.round(s.interval * s.efactor * 1.3);
      s.box += 1;
      break;
    default:
      throw new Error(`Unknown grade: ${grade}`);
  }

  s.interval = Math.min(s.interval, MAX_INTERVAL_DAYS);
  s.due = addDays(today, s.interval);
  s.lastReview = today;
  s.history.push({ date: today, grade });
  if (s.history.length > 200) s.history = s.history.slice(-200);

  return s;
}

// A card counts as "known" once it has survived at least two successful
// reviews. Sentence unlocking and stats both key off this definition.
export function isKnown(state) {
  return !!state && state.box >= 2;
}

export function isDue(state, today = todayStr()) {
  return !!state && state.due <= today;
}

export function isMature(state) {
  return !!state && state.interval >= 21;
}
