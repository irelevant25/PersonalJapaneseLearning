import express from 'express';
import path from 'path';
import { loadContent, getContent } from './lib/content.js';
import { loadProgress, getProgress, saveProgress } from './lib/progress.js';
import { runAdaptiveEngine } from './lib/adaptive.js';

import contentRoutes from './routes/content.js';
import queueRoutes from './routes/queue.js';
import reviewRoutes from './routes/review.js';
import statsRoutes from './routes/stats.js';
import settingsRoutes from './routes/settings.js';
import curriculumRoutes from './routes/curriculum.js';
import notesRoutes from './routes/notes.js';
import exportRoutes from './routes/export.js';
import cardsRoutes from './routes/cards.js';
import adaptiveLogRoutes from './routes/adaptiveLog.js';
import examRoutes from './routes/exam.js';
import storiesRoutes from './routes/stories.js';
import pathRoutes from './routes/path.js';
import { loadPath } from './lib/path.js';

export async function createApp() {
  await loadContent();
  await loadProgress();
  await loadPath();

  const app = express();
  app.use(express.json());
  app.use(express.static(path.join(process.cwd(), 'public')));

  // Lazily re-run the adaptive engine at most once per calendar day, on the
  // first API call of that day — robust whether the server is restarted
  // daily or left running for weeks.
  app.use('/api', async (req, res, next) => {
    try {
      // Save whenever it ran (not only on a change), so lastAdaptiveRun
      // survives a restart and the engine really runs once per day.
      const progress = getProgress();
      const lastRun = progress.lastAdaptiveRun;
      runAdaptiveEngine(progress, getContent());
      if (progress.lastAdaptiveRun !== lastRun) await saveProgress();
      next();
    } catch (err) {
      next(err);
    }
  });

  app.use('/api/content', contentRoutes);
  app.use('/api/queue', queueRoutes);
  app.use('/api/review', reviewRoutes);
  app.use('/api/stats', statsRoutes);
  app.use('/api/settings', settingsRoutes);
  app.use('/api/curriculum', curriculumRoutes);
  app.use('/api/notes', notesRoutes);
  app.use('/api/export', exportRoutes);
  app.use('/api/cards', cardsRoutes);
  app.use('/api/adaptive-log', adaptiveLogRoutes);
  app.use('/api/exam', examRoutes);
  app.use('/api/stories', storiesRoutes);
  app.use('/api/path', pathRoutes);

  app.get('/api/health', (req, res) => {
    const content = getContent();
    const counts = Object.fromEntries(Object.entries(content).map(([k, v]) => [k, v.length]));
    res.json({ ok: true, counts });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
