// Generates multiple-choice mock-exam questions from cards the learner has
// ALREADY studied (present in progress.cards) — never brand-new material.
// This deliberately needs zero authored quiz content: the prompt/answer for
// a question is just the existing flashcard's own fields, and distractors
// are sampled from the full content pool of the same type. JLPT N4 itself
// is entirely multiple-choice, so this format is closer to the real test
// than a flip-card review, and it's a self-check — it never writes back to
// SRS state, so it can't be confused with a "real" review.

const PROMPT_FIELD = {
  hiragana: (c) => c.char,
  katakana: (c) => c.char,
  kanji: (c) => c.char,
  vocab: (c) => c.front,
  grammar: (c) => c.pattern,
  sentence: (c) => c.jp,
};

const ANSWER_FIELD = {
  hiragana: (c) => c.romaji,
  katakana: (c) => c.romaji,
  kanji: (c) => c.meaning,
  vocab: (c) => c.meaning,
  grammar: (c) => c.meaning,
  sentence: (c) => c.en,
};

export function buildExam({ contentByType, progress, count = 20 }) {
  const pool = [];
  for (const [type, list] of Object.entries(contentByType)) {
    if (!ANSWER_FIELD[type]) continue; // skip types with no exam representation (e.g. story)
    for (const card of list) {
      if (progress.cards[card.id]) pool.push(card);
    }
  }

  const selected = shuffle(pool).slice(0, count);
  return selected
    .map((card) => buildQuestion(card, contentByType[card.type]))
    .filter(Boolean);
}

function buildQuestion(card, sameTypePool) {
  const answer = ANSWER_FIELD[card.type](card);
  const distractors = pickDistractors(sameTypePool, card.id, card.type, answer, 3);
  // Need at least one real distractor for a meaningful multiple-choice question.
  if (distractors.length === 0) return null;

  const choices = shuffle([answer, ...distractors]);
  return {
    cardId: card.id,
    type: card.type,
    prompt: PROMPT_FIELD[card.type](card),
    card,
    choices,
    correctIndex: choices.indexOf(answer),
  };
}

function pickDistractors(pool, excludeId, type, correctAnswer, n) {
  const seen = new Set([correctAnswer]);
  const candidates = shuffle(pool.filter((c) => c.id !== excludeId));
  const result = [];
  for (const c of candidates) {
    const ans = ANSWER_FIELD[type](c);
    if (seen.has(ans)) continue;
    seen.add(ans);
    result.push(ans);
    if (result.length === n) break;
  }
  return result;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
