import { Router } from 'express';
import { PROGRESS_PATH } from '../lib/progress.js';

const router = Router();

router.get('/', (req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.download(PROGRESS_PATH, `japanese-n4-progress-${stamp}.json`);
});

export default router;
