import { Router } from 'express';
import { appendCard, getContent } from '../lib/content.js';

const router = Router();
const ADDABLE_TYPES = new Set(['vocab', 'kanji', 'grammar']);

// Minimal "add your own card" support — for words/kanji/grammar you hit in
// the wild that aren't in the seeded content yet. Keeps the same shape as
// the seeded content so it flows through SRS/queue/stats identically.
router.post('/', async (req, res) => {
  const { type, ...fields } = req.body || {};
  if (!ADDABLE_TYPES.has(type)) {
    return res.status(400).json({ error: `type must be one of: ${[...ADDABLE_TYPES].join(', ')}` });
  }
  const content = getContent();
  const prefix = type === 'grammar' ? 'gram' : type;
  const id = `${prefix}-custom-${Date.now().toString(36)}`;
  const card = { id, type, level: fields.level || 'custom', ...fields };
  await appendCard(type, card);
  res.status(201).json(card);
});

export default router;
