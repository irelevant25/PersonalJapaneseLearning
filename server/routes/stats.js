import { Router } from 'express';
import path from 'path';
import { getContent } from '../lib/content.js';
import { getProgress } from '../lib/progress.js';
import { readJson } from '../lib/jsonStore.js';
import { getPhase } from '../lib/curriculum.js';
import { computeStats } from '../lib/stats.js';

const router = Router();
const CURRICULUM_PATH = path.join(process.cwd(), 'server', 'data', 'content', 'curriculum.json');

router.get('/', async (req, res) => {
  const curriculum = await readJson(CURRICULUM_PATH, null);
  const progress = getProgress();
  const phase = getPhase(curriculum, progress.settings.examDate);
  const stats = computeStats(progress, getContent(), phase);
  res.json(stats);
});

export default router;
