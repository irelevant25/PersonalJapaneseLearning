import { Router } from 'express';
import { getProgress } from '../lib/progress.js';

const router = Router();

router.get('/', (req, res) => {
  res.json(getProgress().adaptiveLog.slice().reverse());
});

export default router;
