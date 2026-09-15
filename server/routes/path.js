import { Router } from 'express';
import path from 'path';
import { getContent } from '../lib/content.js';
import { getProgress, saveProgress } from '../lib/progress.js';
import { readJson } from '../lib/jsonStore.js';
import { getPathPace } from '../lib/curriculum.js';
import { todayStr } from '../lib/dates.js';
import { isDue } from '../lib/srs.js';
import {
  getPath,
  computePathState,
  findUnitState,
  buildStepPayload,
  recordStepResult,
  buildTestOut,
  applyTestOut,
} from '../lib/path.js';

const router = Router();
const CURRICULUM_PATH = path.join(process.cwd(), 'server', 'data', 'content', 'curriculum.json');
const PLAYABLE = new Set(['open', 'catch-up', 'passed']);
const LOCKED_MESSAGE = 'This step is locked. Finish the earlier steps first.';

function todayInfo(progress, today) {
  return {
    newCardsToday: progress.sessions[today]?.newCards || 0,
    dailyNewCards: progress.settings.newCardsPerDay,
    dueToday: Object.values(progress.cards).filter((s) => isDue(s, today)).length,
    kanaGateActive: progress.settings.kanaGateActive,
  };
}

router.get('/', async (req, res) => {
  const progress = getProgress();
  const today = todayStr();
  const state = computePathState(getPath(), getContent(), progress);
  const curriculum = await readJson(CURRICULUM_PATH, null);
  res.json({
    ...state,
    pace: {
      ...getPathPace(curriculum, progress.settings.examDate, state.unitsTotal, today),
      ...todayInfo(progress, today),
    },
  });
});

router.get('/step/:unitId/:stepId', (req, res) => {
  const { unitId, stepId } = req.params;
  const progress = getProgress();
  const unitState = findUnitState(computePathState(getPath(), getContent(), progress), unitId);
  const stepState = unitState?.steps.find((s) => s.id === stepId);
  if (!stepState) return res.status(404).json({ error: 'Unknown unit or step' });
  if (!PLAYABLE.has(stepState.status)) return res.status(409).json({ error: LOCKED_MESSAGE });

  const payload = buildStepPayload(getPath(), getContent(), progress, unitId, stepId);
  res.json({
    ...payload,
    unit: { ...payload.unit, steps: unitState.steps },
    status: stepState.status,
    today: todayInfo(progress, todayStr()),
  });
});

router.post('/step/:unitId/:stepId', async (req, res) => {
  const { unitId, stepId } = req.params;
  const pathData = getPath();
  const progress = getProgress();
  const stepState = findUnitState(computePathState(pathData, getContent(), progress), unitId)?.steps.find((s) => s.id === stepId);
  if (!stepState) return res.status(404).json({ error: 'Unknown unit or step' });
  if (!PLAYABLE.has(stepState.status)) return res.status(409).json({ error: LOCKED_MESSAGE });

  // The learn step has nothing to grade: finishing it is the pass.
  const accuracy = stepId === 'learn' ? 100 : scoreFrom(req.body);
  if (accuracy === null) return res.status(400).json({ error: 'correct and total (total > 0) are required' });

  const result = recordStepResult(pathData, progress, unitId, stepId, accuracy, todayStr());
  await saveProgress();
  const after = computePathState(pathData, getContent(), progress);
  res.json({ ...result, accuracy, passAccuracy: pathData.passAccuracy, next: after.next });
});

router.get('/test-out/:unitId', (req, res) => {
  const data = buildTestOut(getPath(), getContent(), getProgress(), req.params.unitId);
  if (!data) return res.status(409).json({ error: 'Nothing to test out of here: this unit is already done.' });
  res.json({ ...data, passAccuracy: getPath().passAccuracy });
});

router.post('/test-out/:unitId', async (req, res) => {
  const accuracy = scoreFrom(req.body);
  if (accuracy === null) return res.status(400).json({ error: 'correct and total (total > 0) are required' });
  const pathData = getPath();
  const progress = getProgress();
  const result = applyTestOut(pathData, getContent(), progress, req.params.unitId, accuracy, todayStr());
  if (!result) return res.status(409).json({ error: 'Nothing to test out of here: this unit is already done.' });
  await saveProgress();
  const after = computePathState(pathData, getContent(), progress);
  res.json({ ...result, accuracy, passAccuracy: pathData.passAccuracy, next: after.next });
});

function scoreFrom(body) {
  const correct = Number(body?.correct);
  const total = Number(body?.total);
  if (!Number.isInteger(correct) || !Number.isInteger(total) || total <= 0 || correct < 0 || correct > total) return null;
  return Math.round((correct / total) * 100);
}

export default router;
