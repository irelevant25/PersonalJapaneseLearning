import { Router } from 'express';
import { getContent } from '../lib/content.js';
import { getProgress, saveProgress } from '../lib/progress.js';
import { buildExam } from '../lib/exam.js';
import { todayStr } from '../lib/dates.js';

const router = Router();

router.get('/', (req, res) => {
  const count = Math.min(parseInt(req.query.count, 10) || 20, 50);
  const questions = buildExam({ contentByType: getContent(), progress: getProgress(), count });
  res.json({ questions });
});

router.get('/log', (req, res) => {
  res.json(getProgress().examLog.slice().reverse());
});

// Logs a finished exam's results for the Stats page — never touches SRS
// card state. `results`: [{ cardId, type, correct: boolean }, ...]
router.post('/submit', async (req, res) => {
  const { results } = req.body || {};
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'results must be a non-empty array' });
  }

  const byType = {};
  let correct = 0;
  for (const r of results) {
    const bucket = (byType[r.type] ||= { total: 0, correct: 0 });
    bucket.total += 1;
    if (r.correct) {
      bucket.correct += 1;
      correct += 1;
    }
  }

  const progress = getProgress();
  const entry = { date: todayStr(), total: results.length, correct, byType };
  progress.examLog.push(entry);
  if (progress.examLog.length > 200) progress.examLog = progress.examLog.slice(-200);
  await saveProgress();

  res.status(201).json(entry);
});

export default router;
