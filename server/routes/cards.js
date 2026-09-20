import { Router } from 'express';
import { appendCard, getContent } from '../lib/content.js';
import { getProgress, saveProgress, ensureSession } from '../lib/progress.js';
import { introduceCard } from '../lib/srs.js';
import { todayStr } from '../lib/dates.js';

const router = Router();

// type -> the text fields a card can't work without (and the one that must be unique).
const REQUIRED = {
  vocab: ['front', 'reading', 'meaning'],
  kanji: ['char', 'meaning'],
  grammar: ['pattern', 'meaning'],
};

// Minimal "add your own card" support — for words/kanji/grammar you hit in
// the wild that aren't in the seeded content yet. Custom cards are not part
// of the learning path, so they go straight into SRS review (due tomorrow,
// same as a card introduced by a path drill) — otherwise nothing would ever
// show them again.
router.post('/', async (req, res) => {
  const { type, id: _ignoredId, ...fields } = req.body || {};
  const required = REQUIRED[type];
  if (!required) {
    return res.status(400).json({ error: `type must be one of: ${Object.keys(REQUIRED).join(', ')}` });
  }
  const missing = required.filter((f) => typeof fields[f] !== 'string' || !fields[f].trim());
  if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(', ')}` });

  const existing = getContent()[type];
  const uniqueField = required[0];
  if (existing.some((c) => c[uniqueField] === fields[uniqueField].trim())) {
    return res.status(409).json({ error: `"${fields[uniqueField].trim()}" is already in the list.` });
  }

  const prefix = type === 'grammar' ? 'gram' : type;
  const id = `${prefix}-custom-${Date.now().toString(36)}`;
  const card = { id, type, level: 'custom', ...fields };
  for (const f of required) card[f] = card[f].trim();
  if (type === 'grammar') card.order = Math.max(0, ...existing.map((c) => c.order ?? 0)) + 1;
  await appendCard(type, card);

  const progress = getProgress();
  const today = todayStr();
  progress.cards[id] = introduceCard(today);
  ensureSession(progress, today).newCards += 1;
  await saveProgress();

  res.status(201).json(card);
});

export default router;
