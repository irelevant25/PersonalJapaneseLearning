// Loads the static content JSON files (hiragana, katakana, kanji, vocab,
// grammar, sentences) into memory once, and normalizes them to a consistent
// shape. Content is treated as read-mostly: it's only mutated when the user
// adds a custom card through the "Add card" feature.

import path from 'path';
import { promises as fs } from 'fs';
import { readJson, writeText } from './jsonStore.js';

const CONTENT_DIR = path.join(process.cwd(), 'server', 'data', 'content');

// Keys here are the canonical singular "type" used everywhere in the app
// (progress.cards, queue items, curriculum weights, etc).
const FILES = {
  hiragana: 'hiragana.json',
  katakana: 'katakana.json',
  kanji: 'kanji.json',
  vocab: 'vocab.json',
  grammar: 'grammar.json',
  sentence: 'sentences.json',
  story: 'stories.json',
};

// Content types that are reviewed through the SRS queue and therefore have
// per-card state in progress.cards. `story` is deliberately excluded: it's
// long-form reading practice, not a spaced-repetition flashcard, so it's
// never introduced via queue.js and has no "known/mature/leech" state.
export const SRS_TRACKED_TYPES = Object.keys(FILES).filter((t) => t !== 'story');

export const CONTENT_TYPES = Object.keys(FILES);

let cache = null;

export async function loadContent() {
  const entries = await Promise.all(
    Object.entries(FILES).map(async ([type, file]) => {
      const raw = await readJson(path.join(CONTENT_DIR, file), []);
      let list = raw.map((item) => ({ ...item, type }));
      if (type === 'grammar') {
        list = list.slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      }
      return [type, list];
    })
  );
  cache = Object.fromEntries(entries);
  return cache;
}

export function getContent() {
  if (!cache) throw new Error('Content not loaded yet — call loadContent() first');
  return cache;
}

export function getAllCards() {
  return Object.values(getContent()).flat();
}

export function findCard(id) {
  return getAllCards().find((c) => c.id === id);
}

export async function appendCard(type, card) {
  if (!FILES[type]) throw new Error(`Unknown content type: ${type}`);
  const content = getContent();
  const filePath = path.join(CONTENT_DIR, FILES[type]);
  await writeText(filePath, appendToArrayText(await fs.readFile(filePath, 'utf8'), card));
  content[type] = [...content[type], card];
  return card;
}

// Adds one entry before the closing `]` of the file's text instead of
// re-serializing the whole array: the content files are hand-formatted (some
// one object per line, some pretty-printed), and a JSON.stringify rewrite
// would reformat every entry and drop the layout.
function appendToArrayText(raw, card) {
  const end = raw.lastIndexOf(']');
  if (end === -1) throw new Error('Content file is not a JSON array');
  const head = raw.slice(0, end).trimEnd();
  const pretty = /\n  \{\r?\n/.test(head);
  const entry = pretty ? JSON.stringify(card, null, 2).replace(/\n/g, '\n  ') : JSON.stringify(card);
  const text = `${head}${head.endsWith('[') ? '' : ','}\n  ${entry}\n]\n`;
  JSON.parse(text); // never write a file the next boot can't read
  return raw.includes('\r\n') ? text.replace(/\r?\n/g, '\r\n') : text;
}
