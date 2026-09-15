// The curriculum is a time plan (server/data/content/curriculum.json) whose
// phases are proportions (`fraction`, summing to 1.0) of the total time
// between `startDate` and the user's current exam date — NOT fixed calendar
// weeks. That matters: if the user moves their exam date closer or further
// away in Settings, every phase boundary rescales automatically so "Exam
// Prep" (the phase flagged `examPrep`) always lands in the final stretch
// before test day, however long or short that stretch turns out to be.
// New material comes only from the learning path (lib/path.js); the phases
// set how fast the path should go, they don't pick cards.

import { addDays, diffDays, todayStr } from './dates.js';

export function getPhase(curriculum, examDate, today = todayStr()) {
  const totalDays = Math.max(1, diffDays(examDate, curriculum.startDate));
  const daysElapsed = Math.max(0, diffDays(today, curriculum.startDate));
  const fractionElapsed = daysElapsed / totalDays;
  const weekNum = Math.floor(daysElapsed / 7) + 1;

  let cumulative = 0;
  for (let i = 0; i < curriculum.phases.length; i++) {
    cumulative += curriculum.phases[i].fraction;
    if (fractionElapsed < cumulative || i === curriculum.phases.length - 1) {
      return { ...curriculum.phases[i], weekNum };
    }
  }
  // Unreachable given phases is non-empty, but keeps the return type honest.
  return { ...curriculum.phases[curriculum.phases.length - 1], weekNum };
}

// Where the learner "should" be on the learning path today: the path is
// paced to be finished when the exam-prep phase starts, so that stretch is
// pure review. A soft guide shown in the UI, never a lock.
export function getPathPace(curriculum, examDate, unitsTotal, today = todayStr()) {
  const totalDays = Math.max(1, diffDays(examDate, curriculum.startDate));
  const daysElapsed = Math.max(0, diffDays(today, curriculum.startDate));
  const prepIndex = curriculum.phases.findIndex((p) => p.examPrep);
  const learningFraction =
    prepIndex === -1 ? 1 : curriculum.phases.slice(0, prepIndex).reduce((sum, p) => sum + p.fraction, 0);
  const learningDays = Math.max(1, Math.floor(totalDays * learningFraction));
  return {
    expectedUnitsDone: Math.min(unitsTotal, Math.ceil((daysElapsed / learningDays) * unitsTotal)),
    pathDeadline: addDays(curriculum.startDate, learningDays),
    inExamPrep: daysElapsed >= learningDays,
  };
}
