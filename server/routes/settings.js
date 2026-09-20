import { Router } from 'express';
import { getProgress, saveProgress } from '../lib/progress.js';

const router = Router();

const intBetween = (min, max) => (v) => (Number.isInteger(v) && v >= min && v <= max ? null : `must be a whole number from ${min} to ${max}`);

function validDate(v) {
  const ok = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());
  return ok ? null : 'must be a date (YYYY-MM-DD)';
}

// key -> validator returning an error text, or null when the value is fine.
// A bad value (e.g. an empty exam date) would break the pace/phase math.
const VALIDATORS = {
  examDate: validDate,
  newCardsPerDay: intBetween(0, 60),
  maxReviewsPerDay: intBetween(10, 500),
  leechThreshold: intBetween(2, 10),
  ttsEnabled: (v) => (typeof v === 'boolean' ? null : 'must be true or false'),
};

router.get('/', (req, res) => {
  res.json(getProgress().settings);
});

router.put('/', async (req, res) => {
  const progress = getProgress();
  const body = req.body || {};
  const patch = {};
  for (const [key, validate] of Object.entries(VALIDATORS)) {
    if (body[key] === undefined) continue;
    const problem = validate(body[key]);
    if (problem) return res.status(400).json({ error: `${key} ${problem}` });
    patch[key] = body[key];
  }
  Object.assign(progress.settings, patch);
  await saveProgress();
  res.json(progress.settings);
});

export default router;
