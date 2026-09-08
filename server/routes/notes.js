import { Router } from 'express';
import { getProgress, saveProgress } from '../lib/progress.js';

const router = Router();

router.put('/:cardId', async (req, res) => {
  const progress = getProgress();
  progress.notes[req.params.cardId] = String(req.body?.note ?? '');
  await saveProgress();
  res.json({ ok: true });
});

export default router;
