import { api } from '../api.js';
import { escapeHtml, labelForType, paceSummary } from '../utils.js';
import { barChart } from '../components/charts.js';

export async function renderDashboard(root, navigate) {
  const [stats, adaptiveLog, path] = await Promise.all([api.getStats(), api.getAdaptiveLog(), api.getPath()]);
  const recentAdaptive = adaptiveLog.slice(0, 3);
  const next = path.next;
  const pathPct = path.unitsTotal ? Math.round((path.unitsDone / path.unitsTotal) * 100) : 0;

  root.innerHTML = `
    <section class="hero">
      <div class="hero-main">
        <h2>Ready to study?</h2>
        <p class="hero-sub">${stats.dueToday} review${stats.dueToday === 1 ? '' : 's'} due today &middot; ${
          next ? `next: Unit ${next.unitNumber}, ${escapeHtml(next.stepTitle)}` : 'learning path up to date'
        }</p>
        <div class="hero-actions">
          ${next ? '<button class="btn-primary btn-large" id="continue-path">Continue learning</button>' : ''}
          <button class="${next ? 'btn-secondary' : 'btn-primary'} btn-large" id="start-reviews">Reviews${stats.dueToday ? ` (${stats.dueToday})` : ''}</button>
        </div>
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
        <h3>Learning path</h3>
        <div class="category-head"><span>Units done</span><span>${path.unitsDone}/${path.unitsTotal}</span></div>
        <div class="bar"><div class="bar-fill" style="width:${pathPct}%"></div></div>
        <p class="phase-notes">${escapeHtml(paceSummary(path.pace, path.unitsDone, path.unitsTotal))}</p>
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

  root.querySelector('#continue-path')?.addEventListener('click', () => navigate('lesson', next.unitId, next.stepId));
  root.querySelector('#start-reviews').addEventListener('click', () => navigate('study'));
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
