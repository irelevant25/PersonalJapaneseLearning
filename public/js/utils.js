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

// One plain sentence about learning-path pace, from GET /api/path's `pace`.
export function paceSummary(pace, unitsDone, unitsTotal) {
  const left = unitsTotal - unitsDone;
  if (left <= 0) return 'The learning path is finished. Keep your reviews going every day.';
  if (pace.inExamPrep) return `It's exam prep time, and ${left} unit${left === 1 ? ' is' : 's are'} left. Finish them if you can, but daily reviews come first.`;
  const diff = unitsDone - pace.expectedUnitsDone;
  const plural = (n) => `${n} unit${n === 1 ? '' : 's'}`;
  if (diff === 0) return `On track. The plan is to finish the path by ${pace.pathDeadline}.`;
  if (diff > 0) return `${plural(diff)} ahead of the plan (finish the path by ${pace.pathDeadline}).`;
  return `${plural(-diff)} behind the plan. The path should be finished by ${pace.pathDeadline}, so try to do a little more each day.`;
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
