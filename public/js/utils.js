export function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

export function statusLabel(srs) {
  if (!srs) return 'New';
  if (srs.isLeech) return 'Leech';
  if (srs.box >= 2 && srs.interval >= 21) return 'Mature';
  if (srs.box >= 2) return 'Known';
  return 'Learning';
}

export function statusClass(srs) {
  return `status-${statusLabel(srs).toLowerCase()}`;
}

export function labelForType(type) {
  return (
    {
      hiragana: 'Hiragana',
      katakana: 'Katakana',
      kanji: 'Kanji',
      vocab: 'Vocabulary',
      grammar: 'Grammar',
      sentence: 'Sentences',
    }[type] || type
  );
}
