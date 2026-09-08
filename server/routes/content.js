import { Router } from 'express';
import { getContent } from '../lib/content.js';
import { getProgress } from '../lib/progress.js';

const router = Router();

router.get('/:type', (req, res) => {
  const content = getContent();
  const items = content[req.params.type];
  if (!items) {
    return res.status(404).json({ error: `Unknown content type: ${req.params.type}` });
  }
  const progress = getProgress();
  const withState = items.map((c) => ({
    ...c,
    srs: progress.cards[c.id] || null,
    note: progress.notes[c.id] || '',
  }));
  res.json(withState);
});

export default router;
