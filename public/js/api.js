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

export const api = {
  getContent: (type) => request(`/content/${encodeURIComponent(type)}`),
  getQueue: (limit = 20, { extra = false } = {}) =>
    request(`/queue?limit=${encodeURIComponent(limit)}${extra ? '&extra=1' : ''}`),
  submitReview: (cardId, grade) =>
    request('/review', { method: 'POST', body: JSON.stringify({ cardId, grade }) }),
  getStats: () => request('/stats'),
  getSettings: () => request('/settings'),
  updateSettings: (patch) => request('/settings', { method: 'PUT', body: JSON.stringify(patch) }),
  getCurriculum: () => request('/curriculum'),
  saveNote: (cardId, note) =>
    request(`/notes/${encodeURIComponent(cardId)}`, { method: 'PUT', body: JSON.stringify({ note }) }),
  getAdaptiveLog: () => request('/adaptive-log'),
  addCard: (card) => request('/cards', { method: 'POST', body: JSON.stringify(card) }),
};
