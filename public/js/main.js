import { renderDashboard } from './views/dashboard.js';
import { renderStudy } from './views/study.js';
import { renderStories } from './views/stories.js';
import { renderExam } from './views/exam.js';
import { renderBrowse } from './views/browse.js';
import { renderStats } from './views/stats.js';
import { renderSettings } from './views/settings.js';
import { escapeHtml } from './utils.js';

const routes = {
  dashboard: renderDashboard,
  study: renderStudy,
  stories: renderStories,
  exam: renderExam,
  browse: renderBrowse,
  stats: renderStats,
  settings: renderSettings,
};

const root = document.getElementById('view-root');
const navButtons = document.querySelectorAll('nav [data-view]');

let currentCleanup = null;

async function navigate(view) {
  if (!routes[view]) view = 'dashboard';

  if (currentCleanup) {
    try {
      currentCleanup();
    } catch {
      /* ignore cleanup errors from a discarded view */
    }
    currentCleanup = null;
  }

  navButtons.forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  history.replaceState(null, '', `#${view}`);
  root.innerHTML = '<div class="loading">Loading…</div>';

  try {
    const cleanup = await routes[view](root, navigate);
    if (typeof cleanup === 'function') currentCleanup = cleanup;
  } catch (err) {
    console.error(err);
    root.innerHTML = `<div class="error-box">Something went wrong loading this page: ${escapeHtml(err.message)}</div>`;
  }
}

navButtons.forEach((b) => b.addEventListener('click', () => navigate(b.dataset.view)));
window.addEventListener('hashchange', () => navigate(location.hash.slice(1)));

navigate(location.hash.slice(1) || 'dashboard');
