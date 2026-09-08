// Loads the static content JSON files (hiragana, katakana, kanji, vocab,
// grammar, sentences) into memory once, and normalizes them to a consistent
// shape. Content is treated as read-mostly: it's only mutated when the user
// adds a custom card through the "Add card" feature.

import path from 'path';
import { readJson, writeJson } from './jsonStore.js';

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
};

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
  content[type] = [...content[type], card];
  await writeJson(path.join(CONTENT_DIR, FILES[type]), content[type]);
  return card;
}
