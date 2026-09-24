/**
 * The spaced-repetition schedule — WaniKani's, kept exactly.
 *
 * Stage  Name             Next review after
 *   1    Apprentice I      4 h
 *   2    Apprentice II     8 h
 *   3    Apprentice III   23 h   (≈1 day — the hour is shaved off because
 *   4    Apprentice IV    47 h    review times are rounded down to the hour)
 *   5    Guru I          167 h   (≈1 week)
 *   6    Guru II         335 h   (≈2 weeks)
 *   7    Master          719 h   (≈1 month)
 *   8    Enlightened    2879 h   (≈4 months)
 *   9    Burned            —
 *
 * A review with no mistakes moves the item up one stage. With mistakes it drops
 *   ceil(mistakes / 2) × (2 if it was Guru or above, else 1)
 * stages, never below Apprentice I.
 *
 * What is deliberately NOT WaniKani here: nothing is locked behind time. Lessons
 * are unlimited, and practice (see practice()) never touches the schedule, so
 * drilling as often as you like cannot knock an item off its intervals.
 */

const HOUR = 3600 * 1000;

const STAGES = [
  { n: 0, name: 'Lesson', group: 'lesson', hours: null },
  { n: 1, name: 'Apprentice I', group: 'apprentice', hours: 4 },
  { n: 2, name: 'Apprentice II', group: 'apprentice', hours: 8 },
  { n: 3, name: 'Apprentice III', group: 'apprentice', hours: 23 },
  { n: 4, name: 'Apprentice IV', group: 'apprentice', hours: 47 },
  { n: 5, name: 'Guru I', group: 'guru', hours: 167 },
  { n: 6, name: 'Guru II', group: 'guru', hours: 335 },
  { n: 7, name: 'Master', group: 'master', hours: 719 },
  { n: 8, name: 'Enlightened', group: 'enlightened', hours: 2879 },
  { n: 9, name: 'Burned', group: 'burned', hours: null },
];

const GROUPS = [
  { id: 'apprentice', name: 'Apprentice', stages: [1, 2, 3, 4] },
  { id: 'guru', name: 'Guru', stages: [5, 6] },
  { id: 'master', name: 'Master', stages: [7] },
  { id: 'enlightened', name: 'Enlightened', stages: [8] },
  { id: 'burned', name: 'Burned', stages: [9] },
];

/** Round down to the start of the local hour, as WaniKani does. */
function floorHour(t) {
  const d = new Date(t);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function nextReviewAt(stage, now) {
  const s = STAGES[stage];
  return s && s.hours ? floorHour(now + s.hours * HOUR) : null;
}

/** A fresh per-item record. Items with no record at all have never been touched. */
function blank() {
  return {
    stage: 0,
    learnedAt: null,
    nextReview: null,
    lastReviewAt: null,
    burnedAt: null,
    reviews: { meaning: { correct: 0, incorrect: 0 }, reading: { correct: 0, incorrect: 0 } },
    streak: { meaning: 0, reading: 0 },
    practice: { correct: 0, incorrect: 0, last: null },
    lastWrongAt: null,
    notes: { meaning: '', reading: '' },
    synonyms: [],
    extraReadings: [],
  };
}

/** Lesson finished (its quiz passed): the item enters the schedule at Apprentice I. */
function learn(state, now) {
  const s = { ...blank(), ...state };
  s.stage = 1;
  s.learnedAt = now;
  s.nextReview = nextReviewAt(1, now);
  return s;
}

/**
 * A scheduled review. `meaningWrong` / `readingWrong` are how many wrong answers
 * the item collected in the session before both halves were answered right.
 */
function review(state, { meaningWrong = 0, readingWrong = 0 }, now) {
  const s = JSON.parse(JSON.stringify({ ...blank(), ...state }));
  const from = s.stage;
  const wrong = meaningWrong + readingWrong;

  let to;
  if (wrong === 0) {
    to = Math.min(9, from + 1);
  } else {
    const adjust = Math.ceil(wrong / 2);
    const factor = from >= 5 ? 2 : 1;
    to = Math.max(1, from - adjust * factor);
  }

  s.stage = to;
  s.lastReviewAt = now;
  s.nextReview = nextReviewAt(to, now);
  if (to === 9) s.burnedAt = now;

  for (const [part, n] of [['meaning', meaningWrong], ['reading', readingWrong]]) {
    // Each half counts once as right (it was eventually answered) and once per miss.
    s.reviews[part].correct += 1;
    s.reviews[part].incorrect += n;
    s.streak[part] = n ? 0 : s.streak[part] + 1;
  }
  if (wrong) s.lastWrongAt = now;

  return { state: s, from, to };
}

/**
 * Practice: recorded for the item's statistics (and the "weakest" / "recent
 * mistakes" practice sets), but the SRS stage and schedule are left alone.
 */
function practice(state, { firstTryCorrect, wrong = 0 }, now) {
  const s = JSON.parse(JSON.stringify({ ...blank(), ...state }));
  if (firstTryCorrect) s.practice.correct += 1;
  else s.practice.incorrect += 1;
  s.practice.last = now;
  if (wrong) s.lastWrongAt = now;
  return s;
}

const isLearned = (s) => !!s && s.stage >= 1;
const isDue = (s, now) => !!s && s.stage >= 1 && s.stage <= 8 && s.nextReview != null && s.nextReview <= now;

module.exports = {
  HOUR,
  STAGES,
  GROUPS,
  floorHour,
  nextReviewAt,
  blank,
  learn,
  review,
  practice,
  isLearned,
  isDue,
};
