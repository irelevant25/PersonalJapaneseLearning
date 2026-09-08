// The curriculum is a phase plan (server/data/content/curriculum.json) whose
// phases are proportions (`fraction`, summing to 1.0) of the total time
// between `startDate` and the user's current exam date — NOT fixed calendar
// weeks. That matters: if the user moves their exam date closer or further
// away in Settings, every phase boundary rescales automatically so "Exam
// Prep" (no new cards, pure review) always lands in the final stretch
// before test day, however long or short that stretch turns out to be.
// Each phase says which content categories are unlocked for NEW cards and in
// what proportion. It does not gate review of cards already introduced.

import { diffDays, todayStr } from './dates.js';

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
