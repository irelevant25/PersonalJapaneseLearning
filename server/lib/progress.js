// Manages progress.json — the single file that IS this app's "database" of
// learner state: per-card SRS state, daily session logs, settings, the
// adaptive engine's decision log, personal notes/mnemonics, and learning-path
// step results.

import path from 'path';
import { readJson, writeJson } from './jsonStore.js';
import { todayStr, addMonths } from './dates.js';

// N4_PROGRESS_FILE points a verification instance at a throwaway copy, so
// testing never writes the real learner state.
export const PROGRESS_PATH = process.env.N4_PROGRESS_FILE
  ? path.resolve(process.env.N4_PROGRESS_FILE)
  : path.join(process.cwd(), 'server', 'data', 'user', 'progress.json');

function defaultProgress() {
  const today = todayStr();
  return {
    createdAt: today,
    cards: {},
    sessions: {},
    settings: {
      examDate: addMonths(today, 4),
      newCardsPerDay: 12,
      maxReviewsPerDay: 150,
      ttsEnabled: true,
      leechThreshold: 4,
      kanaGateActive: false,
    },
    adaptiveLog: [],
    lastAdaptiveRun: null,
    notes: {},
    examLog: [],
    path: { steps: {} },
  };
}

let cache = null;

export async function loadProgress() {
  const loaded = await readJson(PROGRESS_PATH, null);
  if (loaded) {
    cache = withDefaults(loaded);
  } else {
    cache = defaultProgress();
    await saveProgress();
  }
  return cache;
}

// Fills in any fields missing from an older progress.json so the app never
// crashes after a schema addition — new installs and long-running ones both
// go through this.
function withDefaults(loaded) {
  const defaults = defaultProgress();
  return {
    ...defaults,
    ...loaded,
    settings: { ...defaults.settings, ...(loaded.settings || {}) },
    path: { ...defaults.path, ...(loaded.path || {}) },
  };
}

export function getProgress() {
  if (!cache) throw new Error('Progress not loaded yet — call loadProgress() first');
  return cache;
}

export async function saveProgress() {
  await writeJson(PROGRESS_PATH, cache);
}

// The per-day log entry: SRS review counts (studied/correct/grades), cards
// introduced that day (newCards), and learning-path attempts (lessons).
export function ensureSession(progress, date) {
  const existing = progress.sessions[date] || {};
  progress.sessions[date] = {
    studied: 0,
    correct: 0,
    again: 0,
    hard: 0,
    good: 0,
    easy: 0,
    newCards: 0,
    lessons: 0,
    ...existing,
  };
  return progress.sessions[date];
}
