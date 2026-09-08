import { Router } from 'express';
import path from 'path';
import { getContent } from '../lib/content.js';
import { getProgress } from '../lib/progress.js';
import { readJson } from '../lib/jsonStore.js';
import { getPhase } from '../lib/curriculum.js';
import { buildQueue } from '../lib/queue.js';

const router = Router();
const CURRICULUM_PATH = path.join(process.cwd(), 'server', 'data', 'content', 'curriculum.json');

router.get('/', async (req, res) => {
  const curriculum = await readJson(CURRICULUM_PATH, null);
  const progress = getProgress();
  const phase = getPhase(curriculum, progress.settings.examDate);
  const contentByType = getContent();
  const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
  const extra = req.query.extra === '1' || req.query.extra === 'true';

  const items = buildQueue({ contentByType, progress, curriculumPhase: phase, limit, extra });
  const full = items.map((i) => {
    const card = contentByType[i.type]?.find((c) => c.id === i.id);
    return { ...i, card, srs: progress.cards[i.id] || null };
  });

  res.json({ phase, count: full.length, items: full });
});

export default router;
