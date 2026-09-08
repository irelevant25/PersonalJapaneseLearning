import { api } from '../api.js';
import { escapeHtml, statusLabel, statusClass, labelForType } from '../utils.js';
import { summaryHtml, backHtml, speakTextFor } from '../components/cardView.js';
import { speak } from '../components/tts.js';

const TYPES = ['hiragana', 'katakana', 'kanji', 'vocab', 'grammar', 'sentence'];
const ADDABLE_TYPES = new Set(['vocab', 'kanji', 'grammar']);

export async function renderBrowse(root) {
  let activeType = 'vocab';
  let query = '';
  let items = [];

  root.innerHTML = `
    <div class="browse-tabs">
      ${TYPES.map((t) => `<button class="tab-btn" data-type="${t}">${labelForType(t)}</button>`).join('')}
    </div>
    <div class="browse-toolbar">
      <input type="search" id="browse-search" placeholder="Search this list…" class="search-input" />
      <button class="btn-secondary" id="toggle-add">+ Add card</button>
    </div>
    <div class="add-card-form" id="add-card-form" hidden></div>
    <div class="browse-body">
      <div class="browse-list" id="browse-list"></div>
      <div class="browse-detail" id="browse-detail" hidden></div>
    </div>
  `;

  const tabs = root.querySelectorAll('.tab-btn');
  const listEl = root.querySelector('#browse-list');
  const detailEl = root.querySelector('#browse-detail');
  const searchEl = root.querySelector('#browse-search');
  const addFormEl = root.querySelector('#add-card-form');
  const toggleAddBtn = root.querySelector('#toggle-add');

  async function loadType(type) {
    activeType = type;
    detailEl.hidden = true;
    tabs.forEach((b) => b.classList.toggle('active', b.dataset.type === type));
    toggleAddBtn.hidden = !ADDABLE_TYPES.has(type);
    addFormEl.hidden = true;
    items = await api.getContent(type);
    renderList();
  }

  function renderList() {
    const q = query.trim().toLowerCase();
    const filtered = q ? items.filter((c) => JSON.stringify(c).toLowerCase().includes(q)) : items;
    listEl.innerHTML =
      filtered
        .slice(0, 400)
        .map(
          (c) => `
      <button class="browse-item ${statusClass(c.srs)}" data-id="${escapeHtml(c.id)}">
        <span class="browse-item-main">${summaryHtml(c)}</span>
        <span class="status-badge">${statusLabel(c.srs)}</span>
      </button>`
        )
        .join('') || `<p class="muted">No cards match "${escapeHtml(query)}".</p>`;

    listEl.querySelectorAll('.browse-item').forEach((btn) => {
      btn.addEventListener('click', () => showDetail(btn.dataset.id));
    });
  }

  function showDetail(id) {
    const card = items.find((c) => c.id === id);
    if (!card) return;
    detailEl.hidden = false;
    detailEl.innerHTML = `
      <div class="detail-head">
        <button class="btn-secondary" id="close-detail">&larr; Back</button>
        <span class="status-badge">${statusLabel(card.srs)}</span>
      </div>
      <div class="detail-body">${backHtml(card)}</div>
      <button class="btn-icon" id="detail-listen" title="Listen">&#128266;</button>
      <div class="detail-srs">${srsSummary(card.srs)}</div>
      <label class="note-label">Personal note / mnemonic
        <textarea id="note-text" rows="3" placeholder="e.g. a memory trick, a sentence you saw it in…">${escapeHtml(card.note || '')}</textarea>
      </label>
      <button class="btn-secondary" id="save-note">Save note</button>
      <span id="note-status" class="muted"></span>
    `;
    detailEl.querySelector('#close-detail').addEventListener('click', () => {
      detailEl.hidden = true;
    });
    detailEl.querySelector('#detail-listen').addEventListener('click', () => {
      speak(speakTextFor(card));
    });
    detailEl.querySelector('#save-note').addEventListener('click', async () => {
      const status = detailEl.querySelector('#note-status');
      const text = detailEl.querySelector('#note-text').value;
      status.textContent = 'Saving…';
      try {
        await api.saveNote(card.id, text);
        card.note = text;
        status.textContent = 'Saved.';
      } catch (err) {
        status.textContent = `Failed: ${err.message}`;
      }
    });
  }

  tabs.forEach((btn) => btn.addEventListener('click', () => loadType(btn.dataset.type)));
  searchEl.addEventListener('input', (e) => {
    query = e.target.value;
    renderList();
  });
  toggleAddBtn.addEventListener('click', () => {
    addFormEl.hidden = !addFormEl.hidden;
    if (!addFormEl.hidden) {
      addFormEl.innerHTML = addCardFormHtml(activeType);
      wireAddForm();
    }
  });

  function wireAddForm() {
    const form = addFormEl.querySelector('form');
    if (!form) return;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const status = addFormEl.querySelector('.form-status');
      status.textContent = 'Saving…';
      try {
        const card = buildCardFromForm(activeType, new FormData(form));
        await api.addCard(card);
        status.textContent = 'Added.';
        form.reset();
        items = await api.getContent(activeType);
        renderList();
      } catch (err) {
        status.textContent = `Failed: ${err.message}`;
      }
    });
  }

  await loadType(activeType);
}

function srsSummary(srs) {
  if (!srs) return 'Not studied yet.';
  return `Box ${srs.box} &middot; interval ${srs.interval}d &middot; due ${escapeHtml(srs.due)} &middot; seen ${srs.history.length}x &middot; ${srs.lapses} lapse${srs.lapses === 1 ? '' : 's'}`;
}

function addCardFormHtml(type) {
  if (type === 'vocab') {
    return `<form class="inline-form">
      <input name="front" placeholder="Word (front)" required />
      <input name="reading" placeholder="Reading (hiragana)" required />
      <input name="meaning" placeholder="Meaning" required />
      <input name="pos" placeholder="Part of speech (e.g. noun)" />
      <input name="tags" placeholder="Tags, comma separated" />
      <button type="submit" class="btn-primary">Add word</button>
      <span class="form-status muted"></span>
    </form>`;
  }
  if (type === 'kanji') {
    return `<form class="inline-form">
      <input name="char" placeholder="Kanji character" required maxlength="1" />
      <input name="onyomi" placeholder="On'yomi, comma separated (katakana)" />
      <input name="kunyomi" placeholder="Kun'yomi, comma separated (hiragana)" />
      <input name="meaning" placeholder="Meaning" required />
      <input name="exampleWord" placeholder="Example word" />
      <input name="exampleReading" placeholder="Example reading" />
      <input name="exampleMeaning" placeholder="Example meaning" />
      <button type="submit" class="btn-primary">Add kanji</button>
      <span class="form-status muted"></span>
    </form>`;
  }
  return `<form class="inline-form">
    <input name="pattern" placeholder="Grammar pattern" required />
    <input name="meaning" placeholder="Meaning" required />
    <input name="explanation" placeholder="Short explanation" required />
    <input name="exampleJp" placeholder="Example sentence (Japanese)" />
    <input name="exampleReading" placeholder="Example reading" />
    <input name="exampleEn" placeholder="Example translation" />
    <button type="submit" class="btn-primary">Add grammar point</button>
    <span class="form-status muted"></span>
  </form>`;
}

function buildCardFromForm(type, fd) {
  const get = (k) => (fd.get(k) || '').toString().trim();
  const list = (k) =>
    get(k)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

  if (type === 'vocab') {
    return {
      type,
      front: get('front'),
      reading: get('reading'),
      meaning: get('meaning'),
      pos: get('pos') || 'noun',
      tags: list('tags'),
    };
  }
  if (type === 'kanji') {
    const examples = get('exampleWord')
      ? [{ word: get('exampleWord'), reading: get('exampleReading'), meaning: get('exampleMeaning') }]
      : [];
    return {
      type,
      char: get('char'),
      onyomi: list('onyomi'),
      kunyomi: list('kunyomi'),
      meaning: get('meaning'),
      examples,
    };
  }
  return {
    type,
    pattern: get('pattern'),
    meaning: get('meaning'),
    explanation: get('explanation'),
    example: { jp: get('exampleJp'), reading: get('exampleReading'), en: get('exampleEn') },
  };
}
