import { api } from '../api.js';
import { escapeHtml, labelForType } from '../utils.js';
import { barChart } from '../components/charts.js';
import { summaryHtml } from '../components/cardView.js';

export async function renderStats(root) {
  const [stats, log, examLog] = await Promise.all([api.getStats(), api.getAdaptiveLog(), api.getExamLog()]);
  const leechCards = await resolveCardsByIds(stats.leechCards);

  const accData = [
    { label: 'Today', value: stats.accuracy.today ?? 0 },
    { label: '3d', value: stats.accuracy.last3 ?? 0 },
    { label: '7d', value: stats.accuracy.last7 ?? 0 },
    { label: '30d', value: stats.accuracy.last30 ?? 0 },
  ];

  root.innerHTML = `
    <section class="panel">
      <h3>Accuracy (%)</h3>
      ${barChart({ data: accData, max: 100 })}
    </section>

    <section class="panel">
      <h3>Mastery by category</h3>
      <div class="table-scroll">
        <table class="stats-table">
          <thead><tr><th>Category</th><th>New</th><th>Learning</th><th>Known</th><th>Mature</th><th>Leech</th><th>Total</th></tr></thead>
          <tbody>
            ${Object.entries(stats.byType)
              .map(
                ([type, s]) => `
              <tr>
                <td>${labelForType(type)}</td>
                <td>${s.new}</td><td>${s.learning}</td><td>${s.known}</td><td>${s.mature}</td>
                <td>${s.leech > 0 ? `<span class="leech-count">${s.leech}</span>` : '0'}</td>
                <td>${s.total}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>

    <section class="panel">
      <h3>Due forecast (7 days)</h3>
      ${barChart({ data: stats.forecast.map((f) => ({ label: f.date.slice(5), value: f.due })) })}
    </section>

    ${
      leechCards.length
        ? `<section class="panel">
            <h3>Leeches (${leechCards.length})</h3>
            <p class="muted">These have been forgotten ${escapeHtml(String(stats.settings.leechThreshold))}+ times. Open one in Browse and add a personal mnemonic to help it stick.</p>
            <div class="browse-list">
              ${leechCards.map((c) => `<div class="browse-item leech-item"><span class="browse-item-main">${summaryHtml(c)}</span></div>`).join('')}
            </div>
          </section>`
        : ''
    }

    <section class="panel">
      <h3>Mock exam history</h3>
      ${
        examLog.length
          ? `<ul class="adaptive-list">
              ${examLog
                .slice(0, 10)
                .map((e) => {
                  const pct = e.total ? Math.round((e.correct / e.total) * 100) : 0;
                  return `<li><span class="log-date">${escapeHtml(e.date)}</span> <strong>${pct}% (${e.correct}/${e.total})</strong></li>`;
                })
                .join('')}
            </ul>`
          : '<p class="muted">No exams taken yet — try one from the Exam tab.</p>'
      }
    </section>

    <section class="panel">
      <h3>Adaptive engine log</h3>
      ${
        log.length
          ? `<ul class="adaptive-list">
              ${log
                .map(
                  (a) =>
                    `<li><span class="log-date">${escapeHtml(a.date)}</span> <strong>${escapeHtml(a.change)}</strong><br><span class="muted">${escapeHtml(a.reason)}</span></li>`
                )
                .join('')}
            </ul>`
          : '<p class="muted">No adjustments yet — check back after a few days of study.</p>'
      }
    </section>
  `;
}

function typeForId(id) {
  if (id.startsWith('hira-')) return 'hiragana';
  if (id.startsWith('kata-')) return 'katakana';
  if (id.startsWith('kanji-')) return 'kanji';
  if (id.startsWith('vocab-')) return 'vocab';
  if (id.startsWith('gram-')) return 'grammar';
  if (id.startsWith('sent-')) return 'sentence';
  return null;
}

async function resolveCardsByIds(ids) {
  if (!ids || ids.length === 0) return [];
  const byType = {};
  for (const id of ids) {
    const t = typeForId(id);
    if (!t) continue;
    (byType[t] ||= []).push(id);
  }
  const results = [];
  for (const [type, typeIds] of Object.entries(byType)) {
    const content = await api.getContent(type);
    const idSet = new Set(typeIds);
    for (const c of content) if (idSet.has(c.id)) results.push(c);
  }
  return results;
}
