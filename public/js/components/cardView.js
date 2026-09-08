// Centralizes how each content type renders as a flashcard front/back and as
// a compact one-line summary, so study.js and browse.js stay in sync.

import { escapeHtml } from '../utils.js';

export function frontHtml(card) {
  switch (card.type) {
    case 'hiragana':
    case 'katakana':
    case 'kanji':
      return `<div class="card-face-char">${escapeHtml(card.char)}</div>`;
    case 'vocab':
      return `<div class="card-face-word">${escapeHtml(card.front)}</div>`;
    case 'grammar':
      return `<div class="card-face-pattern">${escapeHtml(card.pattern)}</div>`;
    case 'sentence':
      return `<div class="card-face-sentence">${escapeHtml(card.jp)}</div>`;
    default:
      return '<div>Unknown card type</div>';
  }
}

export function backHtml(card) {
  switch (card.type) {
    case 'hiragana':
    case 'katakana':
      return `
        <div class="card-face-char small">${escapeHtml(card.char)}</div>
        <div class="card-romaji">${escapeHtml(card.romaji)}</div>
        ${card.note ? `<div class="card-hint">${escapeHtml(card.note)}</div>` : ''}
      `;
    case 'kanji': {
      const onyomi = (card.onyomi || []).join('、') || '—';
      const kunyomi = (card.kunyomi || []).join('、') || '—';
      const examples = (card.examples || [])
        .map(
          (ex) =>
            `<li><span class="ex-word">${escapeHtml(ex.word)}</span> <span class="ex-reading">${escapeHtml(ex.reading)}</span> — ${escapeHtml(ex.meaning)}</li>`
        )
        .join('');
      return `
        <div class="card-face-char small">${escapeHtml(card.char)}</div>
        <div class="kanji-meaning">${escapeHtml(card.meaning)}</div>
        <div class="kanji-readings"><strong>On:</strong> ${escapeHtml(onyomi)} &nbsp;&nbsp; <strong>Kun:</strong> ${escapeHtml(kunyomi)}</div>
        ${examples ? `<ul class="kanji-examples">${examples}</ul>` : ''}
      `;
    }
    case 'vocab':
      return `
        <div class="card-face-word small">${escapeHtml(card.front)}</div>
        <div class="card-reading">${escapeHtml(card.reading)}</div>
        <div class="card-meaning">${escapeHtml(card.meaning)}</div>
        ${card.pos ? `<div class="card-pos">${escapeHtml(card.pos)}</div>` : ''}
      `;
    case 'grammar':
      return `
        <div class="card-meaning">${escapeHtml(card.meaning)}</div>
        <div class="card-explanation">${escapeHtml(card.explanation || '')}</div>
        ${
          card.example
            ? `<div class="card-example">
                 <div class="ex-jp">${escapeHtml(card.example.jp || '')}</div>
                 <div class="ex-reading">${escapeHtml(card.example.reading || '')}</div>
                 <div class="ex-en">${escapeHtml(card.example.en || '')}</div>
               </div>`
            : ''
        }
      `;
    case 'sentence':
      return `
        <div class="card-face-sentence small">${escapeHtml(card.jp)}</div>
        <div class="card-reading">${escapeHtml(card.reading || '')}</div>
        <div class="card-meaning">${escapeHtml(card.en || '')}</div>
      `;
    default:
      return '';
  }
}

export function speakTextFor(card) {
  switch (card.type) {
    case 'hiragana':
    case 'katakana':
    case 'kanji':
      return card.char;
    case 'vocab':
      return card.front;
    case 'grammar':
      return (card.example && card.example.jp) || card.pattern;
    case 'sentence':
      return card.jp;
    default:
      return '';
  }
}

export function summaryHtml(card) {
  switch (card.type) {
    case 'hiragana':
    case 'katakana':
      return `<span class="s-char">${escapeHtml(card.char)}</span><span class="s-sub">${escapeHtml(card.romaji)}</span>`;
    case 'kanji':
      return `<span class="s-char">${escapeHtml(card.char)}</span><span class="s-sub">${escapeHtml(card.meaning)}</span>`;
    case 'vocab':
      return `<span class="s-char">${escapeHtml(card.front)}</span><span class="s-sub">${escapeHtml(card.reading)} · ${escapeHtml(card.meaning)}</span>`;
    case 'grammar':
      return `<span class="s-char">${escapeHtml(card.pattern)}</span><span class="s-sub">${escapeHtml(card.meaning)}</span>`;
    case 'sentence':
      return `<span class="s-char">${escapeHtml(card.jp)}</span><span class="s-sub">${escapeHtml(card.en)}</span>`;
    default:
      return '';
  }
}
