import { Router } from 'express';
import { getContent } from '../lib/content.js';
import { getProgress } from '../lib/progress.js';
import { buildQueue } from '../lib/queue.js';
import { readingHints } from '../lib/path.js';
import { todayStr } from '../lib/dates.js';

const router = Router();

router.get('/', (req, res) => {
  const progress = getProgress();
  const contentByType = getContent();
  const requested = Math.min(parseInt(req.query.limit, 10) || 30, 100);

  // settings.maxReviewsPerDay caps the reviews served per day; `capped` tells
  // the Reviews tab that cards are still due but today's cap is reached.
  const studiedToday = progress.sessions[todayStr()]?.studied || 0;
  const remaining = Math.max(0, progress.settings.maxReviewsPerDay - studiedToday);
  const items = buildQueue({ contentByType, progress, limit: Math.min(requested, remaining) });
  const dueTotal = buildQueue({ contentByType, progress, limit: Infinity }).length;

  const hintFor = readingHints(contentByType, progress.cards);
  const full = items.map((i) => {
    const card = contentByType[i.type]?.find((c) => c.id === i.id);
    return { ...i, card, hint: hintFor(card), srs: progress.cards[i.id] || null };
  });

  res.json({ count: full.length, dueTotal, capped: remaining === 0 && dueTotal > 0, maxReviewsPerDay: progress.settings.maxReviewsPerDay, items: full });
});

export default router;
