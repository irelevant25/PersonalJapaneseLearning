import { Router } from 'express';
import { findCard } from '../lib/content.js';
import { getProgress, saveProgress } from '../lib/progress.js';
import { newCardState, gradeCard } from '../lib/srs.js';
import { todayStr } from '../lib/dates.js';

const router = Router();
const VALID_GRADES = new Set(['again', 'hard', 'good', 'easy']);

router.post('/', async (req, res) => {
  const { cardId, grade } = req.body || {};
  if (!cardId || !VALID_GRADES.has(grade)) {
    return res.status(400).json({ error: 'cardId and a valid grade (again|hard|good|easy) are required' });
  }
  const card = findCard(cardId);
  if (!card) {
    return res.status(404).json({ error: `Unknown card: ${cardId}` });
  }

  const progress = getProgress();
  const today = todayStr();
  const wasNew = !progress.cards[cardId];
  const prevState = progress.cards[cardId] || newCardState(today);
  const nextState = gradeCard(prevState, grade, today);
  progress.cards[cardId] = nextState;

  const session =
    progress.sessions[today] || { studied: 0, correct: 0, again: 0, hard: 0, good: 0, easy: 0, newCards: 0 };
  session.studied += 1;
  session[grade] += 1;
  if (grade !== 'again') session.correct += 1;
  if (wasNew) session.newCards += 1;
  progress.sessions[today] = session;

  await saveProgress();
  res.json({ card: { ...card, srs: nextState } });
});

export default router;
