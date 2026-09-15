const BASE = '/api';

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body && body.error) message = body.error;
    } catch {
      /* response wasn't JSON — keep default message */
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

const enc = encodeURIComponent;

export const api = {
  getContent: (type) => request(`/content/${enc(type)}`),
  getQueue: (limit = 20) => request(`/queue?limit=${enc(limit)}`),
  submitReview: (cardId, grade) =>
    request('/review', { method: 'POST', body: JSON.stringify({ cardId, grade }) }),
  getStats: () => request('/stats'),
  getSettings: () => request('/settings'),
  updateSettings: (patch) => request('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  getCurriculum: () => request('/curriculum'),
  saveNote: (cardId, note) =>
    request(`/notes/${enc(cardId)}`, { method: 'PUT', body: JSON.stringify({ note }) }),
  getAdaptiveLog: () => request('/adaptive-log'),
  addCard: (card) => request('/cards', { method: 'POST', body: JSON.stringify(card) }),
  getStories: () => request('/stories'),
  getExam: (count = 20) => request(`/exam?count=${enc(count)}`),
  submitExam: (results) => request('/exam/submit', { method: 'POST', body: JSON.stringify({ results }) }),
  getExamLog: () => request('/exam/log'),
  getPath: () => request('/path'),
  getPathStep: (unitId, stepId) => request(`/path/step/${enc(unitId)}/${enc(stepId)}`),
  submitPathStep: (unitId, stepId, score = {}) =>
    request(`/path/step/${enc(unitId)}/${enc(stepId)}`, { method: 'POST', body: JSON.stringify(score) }),
  getTestOut: (unitId) => request(`/path/test-out/${enc(unitId)}`),
  submitTestOut: (unitId, score) =>
    request(`/path/test-out/${enc(unitId)}`, { method: 'POST', body: JSON.stringify(score) }),
};
