import { api } from '../api.js';
import { escapeHtml, labelForType } from '../utils.js';
import { barChart } from '../components/charts.js';

export async function renderDashboard(root, navigate) {
  const [stats, adaptiveLog] = await Promise.all([api.getStats(), api.getAdaptiveLog()]);
  const recentAdaptive = adaptiveLog.slice(0, 3);

  root.innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <h2>Ready to study?</h2>
        <p class="hero-sub">${stats.dueToday} review${stats.dueToday === 1 ? '' : 's'} due today &middot; Week ${stats.curriculumPhase.weekNum}, ${escapeHtml(stats.curriculumPhase.name)}</p>
        <button class="btn-primary btn-large" id="start-study">Start studying</button>
      </div>
      <div class="hero-stats">
        <div class="stat-tile"><div class="stat-value">${stats.streak}</div><div class="stat-label">day streak</div></div>
        <div class="stat-tile"><div class="stat-value">${stats.daysToExam ?? '—'}</div><div class="stat-label">days to exam</div></div>
        <div class="stat-tile"><div class="stat-value">${stats.accuracy.last7 ?? '—'}${stats.accuracy.last7 !== null ? '%' : ''}</div><div class="stat-label">7-day accuracy</div></div>
      </div>
    </section>

    <section class="panel">
      <h3>Progress by category</h3>
      <div class="category-grid">
        ${Object.entries(stats.byType)
          .map(([type, s]) => categoryBar(type, s))
          .join('')}
      </div>
    </section>

    <section class="panel-row">
      <div class="panel">
        <h3>Next 7 days</h3>
        ${barChart({ data: stats.forecast.map((f) => ({ label: f.date.slice(5), value: f.due })) })}
      </div>
      <div class="panel">
        <h3>Curriculum</h3>
        <p class="phase-name">${escapeHtml(stats.curriculumPhase.name)} — week ${stats.curriculumPhase.weekNum}</p>
        <p class="phase-notes">${escapeHtml(stats.curriculumPhase.notes)}</p>
      </div>
    </section>

    ${
      recentAdaptive.length
        ? `<section class="panel">
            <h3>Recent adaptive changes</h3>
            <ul class="adaptive-list">
              ${recentAdaptive
                .map(
                  (a) =>
                    `<li><span class="log-date">${escapeHtml(a.date)}</span> <strong>${escapeHtml(a.change)}</strong><br><span class="muted">${escapeHtml(a.reason)}</span></li>`
                )
                .join('')}
            </ul>
          </section>`
        : ''
    }
  `;

  root.querySelector('#start-study').addEventListener('click', () => navigate('study'));
}

function categoryBar(type, s) {
  const pct = s.total ? Math.round((s.known / s.total) * 100) : 0;
  return `
    <div class="category-item">
      <div class="category-head"><span>${labelForType(type)}</span><span>${s.known}/${s.total}</span></div>
      <div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>
    </div>
  `;
}
