import { renderDashboard } from './views/dashboard.js';
import { renderPath } from './views/path.js';
import { renderLesson, renderTestOut } from './views/lesson.js';
import { renderStudy } from './views/study.js';
import { renderStories } from './views/stories.js';
import { renderExam } from './views/exam.js';
import { renderBrowse } from './views/browse.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
import { escapeHtml } from './utils.js';
import { api } from './api.js';
import { setTtsEnabled } from './components/tts.js';

const routes = {
  dashboard: renderDashboard,
  learn: renderPath,
  lesson: renderLesson,
  'test-out': renderTestOut,
  study: renderStudy,
  stories: renderStories,
  exam: renderExam,
  browse: renderBrowse,
  stats: renderStats,
  settings: renderSettings,
};

// Views without their own nav button highlight this one instead.
const NAV_FOR = { lesson: 'learn', 'test-out': 'learn' };

const root = document.getElementById('view-root');
const navButtons = document.querySelectorAll('nav [data-view]');

let currentCleanup = null;
let navigationId = 0;

// Hash format: #view or #view/param/param, e.g. #lesson/hira-1/drill.
// Views get the params as their third argument.
async function navigate(view, ...params) {
  if (!routes[view]) {
    view = 'dashboard';
    params = [];
  }

  if (currentCleanup) {
    try {
      currentCleanup();
    } catch {
      /* ignore cleanup errors from a discarded view */
    }
    currentCleanup = null;
  }

  const navView = NAV_FOR[view] || view;
  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === navView));
  history.replaceState(null, '', `#${[view, ...params].map(encodeURIComponent).join('/')}`);
  // Each navigation renders into its own container. If the user clicks another
  // tab while this view is still loading, the late view draws into a detached
  // element (not over the new page) and its cleanup runs right away.
  const id = ++navigationId;
  const container = document.createElement('div');
  container.className = 'app-view';
  container.innerHTML = '<div class="loading">Loading…</div>';
  root.replaceChildren(container);
  window.scrollTo(0, 0);

  try {
    const cleanup = await routes[view](container, navigate, params);
    if (typeof cleanup !== 'function') return;
    if (id === navigationId) currentCleanup = cleanup;
    else cleanup();
  } catch (err) {
    console.error(err);
    container.innerHTML =`<div class="error-box">Something went wrong loading this page: ${escapeHtml(err.message)}</div>`;
  }
}

function navigateFromHash() {
  const [view, ...params] = location.hash.slice(1).split('/').map(decodeURIComponent);
  navigate(view || 'dashboard', ...params);
}

navButtons.forEach((b) => b.addEventListener('click', () => navigate(b.dataset.view)));
window.addEventListener('hashchange', navigateFromHash);

api.getSettings().then((s) => setTtsEnabled(s.ttsEnabled)).catch(() => {});
navigateFromHash();
