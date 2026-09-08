import { Router } from 'express';
import { getContent } from '../lib/content.js';
import { getProgress } from '../lib/progress.js';
import { isKnown } from '../lib/srs.js';

const router = Router();

// Stories are never gated/hidden — readiness is informational so the
// learner can still choose to read something above their current
// vocabulary level, they just see how much of it they already know first.
router.get('/', (req, res) => {
  const stories = getContent().story || [];
  const cards = getProgress().cards;

  const annotated = stories.map((s) => {
    const words = s.words || [];
    const known = words.filter((w) => isKnown(cards[w])).length;
    return {
      ...s,
      readiness: { known, total: words.length, ready: words.length === 0 || known === words.length },
    };
  });

  res.json(annotated);
});

export default router;
