import { Router } from 'express';
import { getProgress, saveProgress } from '../lib/progress.js';

const router = Router();
const ALLOWED_KEYS = ['examDate', 'newCardsPerDay', 'maxReviewsPerDay', 'ttsEnabled', 'leechThreshold'];

router.get('/', (req, res) => {
  res.json(getProgress().settings);
});

router.put('/', async (req, res) => {
  const progress = getProgress();
  const body = req.body || {};
  for (const key of ALLOWED_KEYS) {
    if (body[key] !== undefined) progress.settings[key] = body[key];
  }
  await saveProgress();
  res.json(progress.settings);
});

export default router;
