// Validates server/data/content/path.json against the content files:
//   node scripts/check-path.js   (or: npm run check)
// Errors (exit 1): duplicate ids or duplicate words in a content file, missing
// required fields, unknown word/grammar ids in a sentence or story, unknown
// ids in the path, a card in two units, a sentence/story used before its
// words or grammar are taught, broken story questions.
// Warnings: content not placed in any unit, units still waiting for a story.

import { readFileSync } from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'server', 'data', 'content');
const load = (file) => JSON.parse(readFileSync(path.join(DIR, file), 'utf8'));
const FILES = {
  hiragana: 'hiragana.json',
  katakana: 'katakana.json',
  kanji: 'kanji.json',
  vocab: 'vocab.json',
  grammar: 'grammar.json',
  sentence: 'sentences.json',
  story: 'stories.json',
};

const content = Object.fromEntries(Object.entries(FILES).map(([type, file]) => [type, load(file)]));
const typeOf = new Map();
for (const [type, list] of Object.entries(content)) for (const c of list) typeOf.set(c.id, type);
const stories = new Map(content.story.map((s) => [s.id, s]));
const pathData = load('path.json');

const errors = [];
const warnings = [];

// --- content files on their own ---
// type -> required text fields; the first one must be unique within the file.
const REQUIRED = {
  hiragana: ['char', 'romaji'],
  katakana: ['char', 'romaji'],
  kanji: ['char', 'meaning'],
  vocab: ['front', 'reading', 'meaning', 'pos'],
  grammar: ['pattern', 'meaning', 'explanation'],
  sentence: ['jp', 'reading', 'en'],
  story: ['title', 'titleEn'],
};
const seenIds = new Set();
for (const [type, list] of Object.entries(content)) {
  const seenKeys = new Map();
  for (const c of list) {
    if (!c.id) errors.push(`${FILES[type]}: an entry has no id`);
    else if (seenIds.has(c.id)) errors.push(`${FILES[type]}: duplicate id ${c.id}`);
    seenIds.add(c.id);
    // Cards added in the app ("-custom-" ids) only have the fields its form asks for.
    for (const f of c.id?.includes('-custom-') ? [] : REQUIRED[type]) {
      if (typeof c[f] !== 'string' || !c[f].trim()) errors.push(`${c.id}: missing "${f}"`);
    }
    const key = c[REQUIRED[type][0]];
    if (type !== 'story' && seenKeys.has(key)) errors.push(`${c.id}: "${key}" is already in ${seenKeys.get(key)}`);
    seenKeys.set(key, c.id);
  }
}
for (const s of [...content.sentence, ...content.story]) {
  for (const id of s.words || []) if (typeOf.get(id) !== 'vocab') errors.push(`${s.id}: "words" has ${id}, which is not a vocab id`);
  for (const id of s.grammar || []) if (typeOf.get(id) !== 'grammar') errors.push(`${s.id}: "grammar" has ${id}, which is not a grammar id`);
}
for (const s of content.story) {
  if (!Array.isArray(s.lines) || !s.lines.length || s.lines.some((l) => !l.jp || !l.reading || !l.en)) errors.push(`${s.id}: every line needs jp, reading and en`);
}

// --- the path ---
const placed = new Map(); // id -> unit id
const taught = new Set();
const unitIds = new Set();
const usedStories = new Set();
const pendingStories = [];
let unitCount = 0;

for (const section of pathData.sections) {
  for (const unit of section.units) {
    unitCount += 1;
    const where = `${section.id}/${unit.id}`;
    if (unitIds.has(unit.id)) errors.push(`${where}: duplicate unit id`);
    unitIds.add(unit.id);

    for (const id of [...(unit.new || []), ...(unit.sentences || [])]) {
      if (!typeOf.has(id)) errors.push(`${where}: unknown id ${id}`);
      else if (placed.has(id)) errors.push(`${where}: ${id} is already in unit ${placed.get(id)}`);
      placed.set(id, unit.id);
    }
    for (const id of unit.new || []) {
      if (typeOf.get(id) === 'sentence' || typeOf.get(id) === 'story') errors.push(`${where}: ${id} belongs in "sentences"/"story", not "new"`);
      taught.add(id);
    }
    for (const id of unit.sentences || []) {
      const s = content.sentence.find((x) => x.id === id);
      if (!s) continue;
      const missing = [...(s.words || []), ...(s.grammar || [])].filter((w) => !taught.has(w));
      if (missing.length) errors.push(`${where}: sentence ${id} uses ${missing.join(', ')} before it is taught`);
    }

    if (unit.noStory) continue;
    if (!unit.story) {
      pendingStories.push(unit.id);
      continue;
    }
    const story = stories.get(unit.story);
    if (!story) {
      errors.push(`${where}: unknown story ${unit.story}`);
      continue;
    }
    if (usedStories.has(story.id)) errors.push(`${where}: story ${story.id} is used by two units`);
    usedStories.add(story.id);
    const missing = [...(story.words || []), ...(story.grammar || [])].filter((w) => !taught.has(w));
    if (missing.length) errors.push(`${where}: story ${story.id} uses ${missing.join(', ')} before it is taught`);
    const questions = story.questions || [];
    if (questions.length < 3) pendingStories.push(`${unit.id} (${story.id} needs questions)`);
    questions.forEach((q, i) => {
      const ok = q.q && Array.isArray(q.choices) && q.choices.length >= 2 && Number.isInteger(q.answer) && q.answer >= 0 && q.answer < q.choices.length;
      if (!ok) errors.push(`${where}: story ${story.id} question ${i + 1} is malformed`);
    });
  }
}

for (const [type, list] of Object.entries(content)) {
  if (type === 'story') continue;
  const unplaced = list.filter((c) => !placed.has(c.id) && !c.id.includes('-custom-'));
  if (unplaced.length) warnings.push(`${unplaced.length} ${type} not in any unit: ${unplaced.slice(0, 8).map((c) => c.id).join(', ')}${unplaced.length > 8 ? ', …' : ''}`);
}
if (pendingStories.length) warnings.push(`${pendingStories.length} units waiting for a story: ${pendingStories.join(', ')}`);

console.log(`path.json: ${pathData.sections.length} sections, ${unitCount} units, ${placed.size} cards placed`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`ERROR: ${e}`);
if (errors.length) process.exit(1);
console.log('OK');
