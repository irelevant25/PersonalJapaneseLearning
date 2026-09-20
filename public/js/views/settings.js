import { api } from '../api.js';
import { escapeHtml } from '../utils.js';
import { setTtsEnabled } from '../components/tts.js';

export async function renderSettings(root) {
  const settings = await api.getSettings();

  root.innerHTML = `
    <section class="panel">
      <h3>Study settings</h3>
      <form id="settings-form" class="settings-form">
        <label>Target exam date
          <input type="date" name="examDate" value="${escapeHtml(settings.examDate || '')}" required />
        </label>
        <label>New cards per day <span class="muted">(a soft daily pace for the learning path — the adaptive engine adjusts it daily, override any time)</span>
          <input type="number" name="newCardsPerDay" min="0" max="60" value="${settings.newCardsPerDay}" />
        </label>
        <label>Max reviews per day <span class="muted">(the Reviews tab stops after this many in one day)</span>
          <input type="number" name="maxReviewsPerDay" min="10" max="500" value="${settings.maxReviewsPerDay}" />
        </label>
        <label>Leech threshold <span class="muted">(failures before a card is flagged)</span>
          <input type="number" name="leechThreshold" min="2" max="10" value="${settings.leechThreshold}" />
        </label>
        <label class="checkbox-label">
          <input type="checkbox" name="ttsEnabled" ${settings.ttsEnabled ? 'checked' : ''} />
          Enable listening (text-to-speech) buttons
        </label>
        <button type="submit" class="btn-primary">Save settings</button>
        <span id="save-status" class="muted"></span>
      </form>
    </section>

    <section class="panel">
      <h3>Your data</h3>
      <p class="muted">Everything is stored locally in <code>server/data/user/progress.json</code> — nothing leaves your machine. To fully reset progress, close the app and delete that file; it will be recreated fresh next time you start the server.</p>
      <a class="btn-secondary" href="/api/export" download>Download backup (JSON)</a>
    </section>
  `;

  root.querySelector('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const patch = {
      examDate: form.examDate.value,
      newCardsPerDay: Number(form.newCardsPerDay.value),
      maxReviewsPerDay: Number(form.maxReviewsPerDay.value),
      leechThreshold: Number(form.leechThreshold.value),
      ttsEnabled: form.ttsEnabled.checked,
    };
    const status = root.querySelector('#save-status');
    status.textContent = 'Saving…';
    try {
      const saved = await api.updateSettings(patch);
      setTtsEnabled(saved.ttsEnabled);
      status.textContent = 'Saved.';
    } catch (err) {
      status.textContent = `Failed: ${err.message}`;
    }
  });
}
