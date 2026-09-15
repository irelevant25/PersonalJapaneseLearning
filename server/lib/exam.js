// Generates multiple-choice mock-exam questions from cards the learner has
// ALREADY studied (present in progress.cards) — never brand-new material.
// This deliberately needs zero authored quiz content: the prompt/answer for
// a question is just the existing flashcard's own fields, and distractors
// are sampled from the full content pool of the same type. JLPT N4 itself
// is entirely multiple-choice, so this format is closer to the real test
// than a flip-card review, and it's a self-check — it never writes back to
// SRS state, so it can't be confused with a "real" review.
//
// `buildQuestion` is also used by the learning path's drills (lib/path.js).

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

// Reverse questions (meaning -> pick the Japanese). Vocab choices carry
// their reading, so a word whose kanji isn't learned yet is still answerable.
const JAPANESE_CHOICE = {
  ...PROMPT_FIELD,
  vocab: (c) => (c.front === c.reading ? c.front : `${c.front}（${c.reading}）`),
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

export function buildQuestion(card, sameTypePool, { reverse = false } = {}) {
  if (!ANSWER_FIELD[card.type]) return null;
  const promptOf = reverse ? ANSWER_FIELD[card.type] : PROMPT_FIELD[card.type];
  const answerOf = reverse ? JAPANESE_CHOICE[card.type] : ANSWER_FIELD[card.type];
  const prompt = promptOf(card);
  const answer = answerOf(card);
  const distractors = pickDistractors(sameTypePool, card, { promptOf, answerOf, prompt, answer }, 3);
  // Need at least one real distractor for a meaningful multiple-choice question.
  if (distractors.length === 0) return null;

  const choices = shuffle([answer, ...distractors]);
  return {
    cardId: card.id,
    type: card.type,
    reverse,
    prompt,
    card,
    choices,
    correctIndex: choices.indexOf(answer),
  };
}

// Skips candidates that would also be a correct answer (same answer text, or
// the same prompt text — e.g. two words that both mean "hello").
function pickDistractors(pool, card, { promptOf, answerOf, prompt, answer }, n) {
  const seen = new Set([answer]);
  const candidates = shuffle(pool.filter((c) => c.id !== card.id));
  const result = [];
  for (const c of candidates) {
    const ans = answerOf(c);
    if (seen.has(ans) || promptOf(c) === prompt) continue;
    seen.add(ans);
    result.push(ans);
    if (result.length === n) break;
  }
  return result;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
