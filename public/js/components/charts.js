import { escapeHtml } from '../utils.js';

// Minimal dependency-free inline SVG bar chart. Good enough for a handful
// of data points (accuracy trend, 7-day due forecast) without pulling in a
// charting library for a local single-user app.
export function barChart({ data, width = 320, height = 90, max, barColor = 'var(--accent)' }) {
  if (!data || data.length === 0) return '<p class="muted">Not enough data yet.</p>';
  const m = max ?? Math.max(1, ...data.map((d) => d.value));
  const barWidth = width / data.length;
  const labelSpace = 16;
  const bars = data
    .map((d, i) => {
      const h = m === 0 ? 0 : (d.value / m) * (height - labelSpace - 4);
      const x = i * barWidth + barWidth * 0.15;
      const y = height - h - labelSpace;
      const w = barWidth * 0.7;
      return `
        <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2" fill="${barColor}"></rect>
        <text x="${(x + w / 2).toFixed(1)}" y="${height - 3}" text-anchor="middle" class="chart-label">${escapeHtml(String(d.label))}</text>
        <text x="${(x + w / 2).toFixed(1)}" y="${Math.max(10, y - 3).toFixed(1)}" text-anchor="middle" class="chart-value">${escapeHtml(String(d.value))}</text>
      `;
    })
    .join('');
  return `<svg viewBox="0 0 ${width} ${height}" class="chart" role="img" aria-label="chart">${bars}</svg>`;
}
