import { Router } from 'express';
import path from 'path';

const router = Router();

router.get('/', (req, res) => {
  const filePath = path.join(process.cwd(), 'server', 'data', 'user', 'progress.json');
  const stamp = new Date().toISOString().slice(0, 10);
  res.download(filePath, `japanese-n4-progress-${stamp}.json`);
});

export default router;
