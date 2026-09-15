import { Router } from 'express';
import { getContent } from '../lib/content.js';
import { getProgress } from '../lib/progress.js';
import { buildQueue } from '../lib/queue.js';
import { readingHints } from '../lib/path.js';

const router = Router();

router.get('/', (req, res) => {
  const progress = getProgress();
  const contentByType = getContent();
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);

  const items = buildQueue({ contentByType, progress, limit });
  const hintFor = readingHints(contentByType, progress.cards);
  const full = items.map((i) => {
    const card = contentByType[i.type]?.find((c) => c.id === i.id);
    return { ...i, card, hint: hintFor(card), srs: progress.cards[i.id] || null };
  });

  res.json({ count: full.length, items: full });
});

export default router;
