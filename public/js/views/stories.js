import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { speak } from '../components/tts.js';

// Stories are reading practice, not SRS flashcards — no grading, no daily
// queue. The list is never locked, just annotated with how much of each
// story's vocabulary you already know, so you can choose freely.
export async function renderStories(root) {
  const stories = await api.getStories();
  let showReading = true;
  let showEn = false;

  function renderList() {
    if (stories.length === 0) {
      root.innerHTML = `<section class="panel empty-state"><h2>No stories yet</h2><p>Check back after the content set grows.</p></section>`;
      return;
    }
    root.innerHTML = `
      <div class="story-list">
        ${stories
          .map(
            (s, i) => `
          <button class="browse-item story-item ${s.readiness.ready ? 'status-known' : 'status-learning'}" data-index="${i}">
            <span class="browse-item-main">
              <span class="s-char">${escapeHtml(s.title)}</span>
              <span class="s-sub">${escapeHtml(s.titleEn)} &middot; ${s.lines.length} lines &middot; ${escapeHtml(s.level)}</span>
            </span>
            <span class="status-badge">${s.readiness.ready ? 'Ready' : `${s.readiness.known}/${s.readiness.total} words known`}</span>
          </button>`
          )
          .join('')}
      </div>
    `;
    root.querySelectorAll('.story-item').forEach((btn) => {
      btn.addEventListener('click', () => renderReader(stories[Number(btn.dataset.index)]));
    });
  }

  function renderReader(story) {
    root.innerHTML = `
      <div class="reader-toolbar">
        <button class="btn-secondary" id="back-to-list">&larr; All stories</button>
        <label class="checkbox-label"><input type="checkbox" id="toggle-reading" ${showReading ? 'checked' : ''}/> Show reading</label>
        <label class="checkbox-label"><input type="checkbox" id="toggle-en" ${showEn ? 'checked' : ''}/> Show translation</label>
        <button class="btn-icon" id="listen-all" title="Listen to whole story">&#128266;</button>
      </div>
      <section class="panel story-reader">
        <h2 class="story-title">${escapeHtml(story.title)}</h2>
        <p class="muted">${escapeHtml(story.titleReading)} &middot; ${escapeHtml(story.titleEn)}</p>
        <ol class="story-lines">
          ${story.lines
            .map(
              (l, i) => `
            <li>
              <div class="story-line-jp">${escapeHtml(l.jp)} <button class="btn-icon btn-icon-inline" data-line="${i}" title="Listen">&#128266;</button></div>
              <div class="story-line-reading" ${showReading ? '' : 'hidden'}>${escapeHtml(l.reading)}</div>
              <div class="story-line-en" ${showEn ? '' : 'hidden'}>${escapeHtml(l.en)}</div>
            </li>`
            )
            .join('')}
        </ol>
      </section>
    `;

    root.querySelector('#back-to-list').addEventListener('click', renderList);
    root.querySelector('#toggle-reading').addEventListener('change', (e) => {
      showReading = e.target.checked;
      root.querySelectorAll('.story-line-reading').forEach((el) => (el.hidden = !showReading));
    });
    root.querySelector('#toggle-en').addEventListener('change', (e) => {
      showEn = e.target.checked;
      root.querySelectorAll('.story-line-en').forEach((el) => (el.hidden = !showEn));
    });
    root.querySelector('#listen-all').addEventListener('click', () => {
      speak(story.lines.map((l) => l.jp).join(' '));
    });
    root.querySelectorAll('[data-line]').forEach((btn) => {
      btn.addEventListener('click', () => speak(story.lines[Number(btn.dataset.line)].jp));
    });
  }

  renderList();
}
