// The learning path (server/data/content/path.json), Duolingo-style:
// sections -> units -> steps. Every unit walks the same ladder — learn the
// new cards, drill them, read sentences that use them, read a short story
// and answer questions — so each unit goes words -> sentences -> story.
//
// Pass rule: a step passes once its best accuracy reaches `passAccuracy`
// (80) and stays passed if a replay scores lower. Steps unlock strictly in
// order, with two exceptions that never block the learner:
//   - a story step whose story isn't written yet ('soon'), and
//   - any unpassed step behind the furthest passed step ('catch-up') — e.g.
//     a story written after the learner already moved past its unit.
//
// Passing a unit's drill for the first time is what puts its cards into SRS
// review (sentences: passing the sentences step). Lesson answers themselves
// never grade SRS cards — routes/review.js stays the only grading path.
// Step results live in progress.path.steps, keyed "unitId/stepId" — so unit
// and step ids must never be renamed.

import path from 'path';
import { readJson } from './jsonStore.js';
import { introduceCard } from './srs.js';
import { ensureSession } from './progress.js';
import { buildQuestion, shuffle } from './exam.js';

const PATH_FILE = path.join(process.cwd(), 'server', 'data', 'content', 'path.json');

export const STEP_TYPES = {
  learn: { title: 'Learn the new cards', short: 'Learn' },
  drill: { title: 'Drill', short: 'Drill' },
  sentences: { title: 'Sentences', short: 'Sentences' },
  story: { title: 'Story', short: 'Story' },
};

export const MIN_STORY_QUESTIONS = 3;
const DRILL_MIN_QUESTIONS = 10;
const SENTENCES_MIN_QUESTIONS = 5;
const DRILL_REVIEW_SHARE = 0.3;
const REVERSE_SHARE = 0.3;
const TEST_OUT_MAX_QUESTIONS = 30;
const TEST_OUT_SPREAD_DAYS = 7;
const KANJI_RE = /[一-龯々]/;

let cache = null;

export async function loadPath() {
  const data = await readJson(PATH_FILE, { passAccuracy: 80, sections: [] });
  let number = 0;
  data.sections.forEach((section, i) => {
    section.number = i + 1;
    for (const unit of section.units) {
      number += 1;
      unit.number = number;
      unit.section = section;
      unit.new ||= [];
      unit.sentences ||= [];
      unit.steps = unitSteps(unit);
    }
  });
  cache = data;
  return cache;
}

export function getPath() {
  if (!cache) throw new Error('Path not loaded yet — call loadPath() first');
  return cache;
}

function unitSteps(unit) {
  const steps = [];
  if (unit.new.length) steps.push({ id: 'learn', type: 'learn' }, { id: 'drill', type: 'drill' });
  if (unit.sentences.length) steps.push({ id: 'sentences', type: 'sentences' });
  if (!unit.noStory) steps.push({ id: 'story', type: 'story' });
  return steps;
}

export function allUnits(pathData) {
  return pathData.sections.flatMap((s) => s.units);
}

export function stepKey(unitId, stepId) {
  return `${unitId}/${stepId}`;
}

const indexCache = new WeakMap();
function cardById(content, id) {
  let index = indexCache.get(content);
  if (!index) {
    index = new Map(Object.values(content).flat().map((c) => [c.id, c]));
    indexCache.set(content, index);
  }
  return index.get(id);
}

function resolve(content, ids) {
  return ids.map((id) => cardById(content, id)).filter(Boolean);
}

function storyFor(content, unit) {
  return unit.story ? (content.story || []).find((s) => s.id === unit.story) || null : null;
}

export function isStoryReady(story) {
  return !!story && Array.isArray(story.questions) && story.questions.length >= MIN_STORY_QUESTIONS;
}

function isAvailable(content, unit, step) {
  return step.type !== 'story' || isStoryReady(storyFor(content, unit));
}

// Returns card -> reading (or null): a vocab word or sentence gets its reading
// shown while it still contains kanji the learner hasn't started reviewing.
export function readingHints(content, cards) {
  const kanjiInReview = new Set((content.kanji || []).filter((k) => cards[k.id]).map((k) => k.char));
  return (card) => {
    const text = card?.type === 'vocab' ? card.front : card?.type === 'sentence' ? card.jp : null;
    if (!text || !card.reading || text === card.reading) return null;
    return [...text].some((ch) => KANJI_RE.test(ch) && !kanjiInReview.has(ch)) ? card.reading : null;
  };
}

function cardLabel(card) {
  return card.char || card.front || card.pattern || card.jp || card.id;
}

export function computePathState(pathData, content, progress) {
  const records = progress.path?.steps || {};
  const flat = [];
  for (const unit of allUnits(pathData)) {
    for (const step of unit.steps) flat.push({ unit, step, key: stepKey(unit.id, step.id) });
  }

  let furthest = -1;
  flat.forEach((e, i) => {
    if (records[e.key]?.passedAt) furthest = i;
  });

  const statusByKey = new Map();
  let blocked = false;
  let next = null;
  flat.forEach((e, i) => {
    let status;
    if (records[e.key]?.passedAt) status = 'passed';
    else if (!isAvailable(content, e.unit, e.step)) status = 'soon';
    else if (blocked) status = 'locked';
    else if (i < furthest) status = 'catch-up';
    else {
      status = 'open';
      blocked = true;
      next = e;
    }
    statusByKey.set(e.key, status);
  });

  let unitsDone = 0;
  const sections = pathData.sections.map((section) => ({
    id: section.id,
    number: section.number,
    title: section.title,
    description: section.description,
    units: section.units.map((unit) => {
      const steps = unit.steps.map((step) => {
        const key = stepKey(unit.id, step.id);
        const record = records[key];
        return {
          id: step.id,
          type: step.type,
          title: STEP_TYPES[step.type].title,
          short: STEP_TYPES[step.type].short,
          status: statusByKey.get(key),
          bestAccuracy: record?.bestAccuracy ?? null,
          attempts: record?.attempts ?? 0,
          testedOut: !!record?.testedOut,
        };
      });
      const statuses = steps.map((s) => s.status);
      const status = statuses.includes('open')
        ? 'current'
        : statuses.every((s) => s === 'passed' || s === 'soon' || s === 'catch-up')
          ? 'done'
          : 'locked';
      if (status === 'done') unitsDone += 1;
      return {
        id: unit.id,
        number: unit.number,
        title: unit.title,
        status,
        hasCatchUp: statuses.includes('catch-up'),
        newCount: unit.new.length,
        sentenceCount: unit.sentences.length,
        preview: resolve(content, unit.new.slice(0, 10)).map(cardLabel),
        steps,
      };
    }),
  }));

  return {
    passAccuracy: pathData.passAccuracy,
    sections,
    unitsDone,
    unitsTotal: allUnits(pathData).length,
    next: next && {
      unitId: next.unit.id,
      stepId: next.step.id,
      unitNumber: next.unit.number,
      unitTitle: next.unit.title,
      sectionTitle: next.unit.section.title,
      stepTitle: STEP_TYPES[next.step.type].title,
      newCount: next.unit.new.length,
    },
  };
}

export function findUnitState(state, unitId) {
  for (const section of state.sections) {
    const unit = section.units.find((u) => u.id === unitId);
    if (unit) return unit;
  }
  return null;
}

function locate(pathData, unitId, stepId) {
  const units = allUnits(pathData);
  const index = units.findIndex((u) => u.id === unitId);
  const unit = units[index];
  const step = unit?.steps.find((s) => s.id === stepId);
  return step ? { units, index, unit, step } : null;
}

// Distractor pools come from what the path has taught up to this unit, so a
// kana drill doesn't offer characters the learner has never seen. Falls back
// to the full content pool while the learned pool is too small.
function learnedPools(content, unitsUpTo) {
  const byType = {};
  for (const card of resolve(content, unitsUpTo.flatMap((u) => [...u.new, ...u.sentences]))) {
    (byType[card.type] ||= []).push(card);
  }
  return (type) => (byType[type]?.length >= 4 ? byType[type] : content[type] || []);
}

function questionFor(card, poolFor, hintFor, allowReverse) {
  const reverse = allowReverse && Math.random() < REVERSE_SHARE;
  const q = buildQuestion(card, poolFor(card.type), { reverse });
  return q && { ...q, hint: reverse ? null : hintFor(card) };
}

function unitInfo(unit) {
  return {
    id: unit.id,
    number: unit.number,
    title: unit.title,
    sectionTitle: unit.section.title,
    steps: unit.steps.map((s) => ({ id: s.id, type: s.type, short: STEP_TYPES[s.type].short })),
  };
}

export function buildStepPayload(pathData, content, progress, unitId, stepId) {
  const found = locate(pathData, unitId, stepId);
  if (!found) return null;
  const { units, index, unit, step } = found;
  const hintFor = readingHints(content, progress.cards);
  const poolFor = learnedPools(content, units.slice(0, index + 1));
  const base = { unit: unitInfo(unit), step: { id: step.id, type: step.type, title: STEP_TYPES[step.type].title } };

  switch (step.type) {
    case 'learn':
      return {
        ...base,
        cards: resolve(content, unit.new).map((card) => ({ card, hint: hintFor(card), inReview: !!progress.cards[card.id] })),
      };
    case 'drill':
    case 'sentences': {
      // Every card of the unit once, plus earlier path cards of the same kind
      // that the scheduler wants soonest (overdue first), so older material
      // keeps coming back and a unit with one sentence still gets a real round.
      const field = step.type === 'drill' ? 'new' : 'sentences';
      const minQuestions = step.type === 'drill' ? DRILL_MIN_QUESTIONS : SENTENCES_MIN_QUESTIONS;
      const fresh = resolve(content, unit[field]);
      const earlier = resolve(content, units.slice(0, index).flatMap((u) => u[field]))
        .filter((c) => progress.cards[c.id])
        .sort((a, b) => progress.cards[a.id].due.localeCompare(progress.cards[b.id].due));
      const reviewCount = Math.max(Math.round(fresh.length * DRILL_REVIEW_SHARE), minQuestions - fresh.length);
      const cards = shuffle([...fresh, ...earlier.slice(0, reviewCount)]);
      return { ...base, questions: cards.map((c) => questionFor(c, poolFor, hintFor, true)).filter(Boolean) };
    }
    case 'story': {
      const story = storyFor(content, unit);
      if (!isStoryReady(story)) return { ...base, story: null, questions: [] };
      return {
        ...base,
        story: { id: story.id, title: story.title, titleReading: story.titleReading, titleEn: story.titleEn, lines: story.lines },
        questions: story.questions.map((q) => {
          const order = shuffle(q.choices.map((_, i) => i));
          return {
            prompt: q.q,
            promptReading: q.qReading || null,
            choices: order.map((i) => q.choices[i]),
            correctIndex: order.indexOf(q.answer),
          };
        }),
      };
    }
    default:
      return null;
  }
}

function introduceCards(progress, ids, today, spreadDays = 1) {
  let count = 0;
  for (const id of ids) {
    if (progress.cards[id]) continue;
    progress.cards[id] = introduceCard(today, 1 + (count % spreadDays));
    count += 1;
  }
  ensureSession(progress, today).newCards += count;
  return count;
}

export function recordStepResult(pathData, progress, unitId, stepId, accuracy, today) {
  const found = locate(pathData, unitId, stepId);
  if (!found) return null;
  const { unit, step } = found;
  const key = stepKey(unit.id, step.id);
  const prev = progress.path.steps[key];
  const now = new Date().toISOString();
  const passedNow = accuracy >= pathData.passAccuracy;
  const firstPass = passedNow && !prev?.passedAt;

  progress.path.steps[key] = {
    attempts: (prev?.attempts ?? 0) + 1,
    lastAccuracy: accuracy,
    bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
    passedAt: prev?.passedAt ?? (passedNow ? now : null),
    testedOut: prev?.testedOut ?? false,
    updatedAt: now,
  };
  ensureSession(progress, today).lessons += 1;

  let introduced = 0;
  if (firstPass && step.type === 'drill') introduced = introduceCards(progress, unit.new, today);
  if (firstPass && step.type === 'sentences') introduced = introduceCards(progress, unit.sentences, today);
  return { record: progress.path.steps[key], passedNow, firstPass, introduced };
}

// Test-out covers every unit from the first unfinished one up to the chosen
// unit; passing marks all of them passed and puts their cards into review.
function testOutRange(pathData, content, progress, unitId) {
  const state = computePathState(pathData, content, progress);
  const statuses = state.sections.flatMap((s) => s.units);
  const start = statuses.findIndex((u) => u.status !== 'done');
  const end = statuses.findIndex((u) => u.id === unitId);
  if (start === -1 || end === -1 || end < start) return null;
  return allUnits(pathData).slice(start, end + 1);
}

export function buildTestOut(pathData, content, progress, unitId) {
  const range = testOutRange(pathData, content, progress, unitId);
  if (!range) return null;
  const units = allUnits(pathData);
  const poolFor = learnedPools(content, units.slice(0, units.indexOf(range[range.length - 1]) + 1));
  const hintFor = readingHints(content, progress.cards);

  // Round-robin across units so every unit in the range is represented.
  const perUnit = range.map((u) => shuffle(resolve(content, [...u.new, ...u.sentences])));
  const picked = [];
  while (picked.length < TEST_OUT_MAX_QUESTIONS && perUnit.some((list) => list.length)) {
    for (const list of perUnit) {
      if (list.length && picked.length < TEST_OUT_MAX_QUESTIONS) picked.push(list.pop());
    }
  }
  return {
    units: range.map((u) => ({ id: u.id, number: u.number, title: u.title })),
    questions: shuffle(picked).map((c) => questionFor(c, poolFor, hintFor, true)).filter(Boolean),
  };
}

export function applyTestOut(pathData, content, progress, unitId, accuracy, today) {
  const range = testOutRange(pathData, content, progress, unitId);
  if (!range) return null;
  ensureSession(progress, today).lessons += 1;
  if (accuracy < pathData.passAccuracy) return { passed: false, unitsPassed: 0, introduced: 0 };

  const now = new Date().toISOString();
  for (const unit of range) {
    for (const step of unit.steps) {
      const key = stepKey(unit.id, step.id);
      const prev = progress.path.steps[key];
      if (prev?.passedAt || !isAvailable(content, unit, step)) continue;
      progress.path.steps[key] = {
        attempts: prev?.attempts ?? 0,
        lastAccuracy: prev?.lastAccuracy ?? null,
        bestAccuracy: prev?.bestAccuracy ?? null,
        passedAt: now,
        testedOut: true,
        updatedAt: now,
      };
    }
  }
  const ids = range.flatMap((u) => [...u.new, ...u.sentences]);
  const introduced = introduceCards(progress, ids, today, TEST_OUT_SPREAD_DAYS);
  return { passed: true, unitsPassed: range.length, introduced };
}
