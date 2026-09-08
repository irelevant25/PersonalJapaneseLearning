// Manages progress.json — the single file that IS this app's "database" of
// learner state: per-card SRS state, daily session logs, settings, the
// adaptive engine's decision log, and personal notes/mnemonics.

import path from 'path';
import { readJson, writeJson } from './jsonStore.js';
import { todayStr, addMonths } from './dates.js';

const PROGRESS_PATH = path.join(process.cwd(), 'server', 'data', 'user', 'progress.json');

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
  };
}

export function getProgress() {
  if (!cache) throw new Error('Progress not loaded yet — call loadProgress() first');
  return cache;
}

export async function saveProgress() {
  await writeJson(PROGRESS_PATH, cache);
}
