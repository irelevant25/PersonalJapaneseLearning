import { api } from '../api.js';
import { escapeHtml, paceSummary } from '../utils.js';

// The learning path ("Learn" tab): a Continue button for the next step, soft
// pacing notices, and every section -> unit -> step chip. Unlocking and the
// pass rule live in server/lib/path.js; this view only renders statuses.
export async function renderPath(root, navigate) {
  const data = await api.getPath();
  // Open the section holding the current unit, plus any with optional catch-up steps.
  const isOpen = (s) => s.units.some((u) => u.status === 'current' || u.hasCatchUp);

  root.innerHTML = `
    ${continueHtml(data)}
    ${noticesHtml(data)}
    ${data.sections.map((s) => sectionHtml(s, isOpen(s))).join('')}
  `;

  root.querySelectorAll('[data-step]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const [unitId, stepId] = btn.dataset.step.split('/');
      navigate('lesson', unitId, stepId);
    });
  });
  root.querySelectorAll('[data-test-out]').forEach((btn) => {
    btn.addEventListener('click', () => navigate('test-out', btn.dataset.testOut));
  });
  root.querySelectorAll('[data-go]').forEach((btn) => btn.addEventListener('click', () => navigate(btn.dataset.go)));
}

function continueHtml({ next, unitsDone, unitsTotal, pace }) {
  const tiles = `
    <div class="hero-stats">
      <div class="stat-tile"><div class="stat-value">${unitsDone}/${unitsTotal}</div><div class="stat-label">units done</div></div>
      <div class="stat-tile"><div class="stat-value">${pace.newCardsToday}/${pace.dailyNewCards}</div><div class="stat-label">new cards today</div></div>
    </div>`;
  if (!next) {
    return `
      <section class="hero">
        <div class="hero-main">
          <h2>Everything available is done 🎉</h2>
          <p class="hero-sub">Some stories are still being written. Keep up your daily reviews.</p>
        </div>
        ${tiles}
      </section>`;
  }
  const started = unitsDone > 0 || next.stepId !== 'learn' || next.unitNumber > 1;
  return `
    <section class="hero">
      <div class="hero-main">
        <p class="hero-sub">${started ? 'Continue where you left off' : 'Start here'} · ${escapeHtml(next.sectionTitle)}</p>
        <h2>Unit ${next.unitNumber} · ${escapeHtml(next.unitTitle)}</h2>
        <p class="hero-sub">${escapeHtml(next.stepTitle)}</p>
        <button class="btn-primary btn-large" data-step="${escapeHtml(`${next.unitId}/${next.stepId}`)}">${started ? 'Continue' : 'Start learning'}</button>
      </div>
      ${tiles}
    </section>`;
}

function noticesHtml({ pace, unitsDone, unitsTotal }) {
  const notices = [];
  if (pace.kanaGateActive) {
    notices.push(`
      <div class="notice notice-warn">
        <span>Your kana accuracy dropped below 80%. Please review kana before you start a new unit.</span>
        <button class="btn-secondary" data-go="study">Do reviews</button>
      </div>`);
  }
  if (pace.dueToday > 0) {
    notices.push(`
      <div class="notice">
        <span><strong>${pace.dueToday}</strong> review${pace.dueToday === 1 ? ' is' : 's are'} due. Doing them first helps new cards stick.</span>
        <button class="btn-secondary" data-go="study">Do reviews</button>
      </div>`);
  }
  notices.push(`<div class="notice notice-muted"><span>${escapeHtml(paceSummary(pace, unitsDone, unitsTotal))}</span></div>`);
  return notices.join('');
}

function sectionHtml(section, open) {
  const done = section.units.filter((u) => u.status === 'done').length;
  return `
    <details class="panel path-section" ${open ? 'open' : ''}>
      <summary>
        <span class="section-number">${section.number}</span>
        <span class="section-title"><strong>${escapeHtml(section.title)}</strong><span class="muted">${escapeHtml(section.description)}</span></span>
        <span class="status-badge">${done}/${section.units.length}</span>
      </summary>
      <ol class="unit-list">${section.units.map(unitHtml).join('')}</ol>
    </details>`;
}

const PLAYABLE = new Set(['open', 'catch-up', 'passed']);

function chipHtml(unit, step) {
  let label = step.short;
  let title = step.title;
  if (step.status === 'passed') {
    label = `✓ ${step.short}${step.testedOut || step.type === 'learn' || step.bestAccuracy === null ? '' : ` ${step.bestAccuracy}%`}`;
    if (step.testedOut) title = 'Tested out';
  } else if (step.status === 'open') {
    label = `▶ ${step.short}`;
  } else if (step.status === 'catch-up') {
    label = `↺ ${step.short}`;
    title = 'Added after you passed this unit. It does not block you, but it is worth doing.';
  } else if (step.status === 'soon') {
    label = `${step.short} · soon`;
    title = 'Not written yet. It does not block you.';
  }
  const playable = PLAYABLE.has(step.status);
  return `<button class="step-chip chip-${step.status}" ${playable ? `data-step="${escapeHtml(`${unit.id}/${step.id}`)}"` : 'disabled'} title="${escapeHtml(title)}">${escapeHtml(label)}</button>`;
}

function unitHtml(unit) {
  const more = unit.newCount > unit.preview.length ? ' …' : '';
  const details = [
    unit.newCount ? `${unit.newCount} new: ${unit.preview.join(' ')}${more}` : '',
    unit.sentenceCount ? `${unit.sentenceCount} sentence${unit.sentenceCount === 1 ? '' : 's'}` : '',
  ].filter(Boolean).join(' · ');
  return `
    <li class="unit-row is-${unit.status}">
      <div class="unit-head">
        <span class="unit-badge">${unit.status === 'done' ? '✓' : unit.number}</span>
        <div class="unit-text">
          <strong>Unit ${unit.number} · ${escapeHtml(unit.title)}</strong>
          <span class="muted unit-preview">${escapeHtml(details)}</span>
        </div>
        ${unit.status === 'done' ? '' : `<button class="btn-link" data-test-out="${escapeHtml(unit.id)}" title="Already know this? Skip ahead with a short test.">Test out</button>`}
      </div>
      <div class="step-chips">${unit.steps.map((s) => chipHtml(unit, s)).join('')}</div>
    </li>`;
}
