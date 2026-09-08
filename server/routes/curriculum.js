import { Router } from 'express';
import path from 'path';
import { readJson } from '../lib/jsonStore.js';
import { getPhase } from '../lib/curriculum.js';
import { getProgress } from '../lib/progress.js';

const router = Router();
const CURRICULUM_PATH = path.join(process.cwd(), 'server', 'data', 'content', 'curriculum.json');

router.get('/', async (req, res) => {
  const curriculum = await readJson(CURRICULUM_PATH, null);
  const progress = getProgress();
  res.json({ ...curriculum, currentPhase: getPhase(curriculum, progress.settings.examDate) });
});

export default router;
