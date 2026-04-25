// Foley Recorder — popup UI.

const $ = (id) => document.getElementById(id);
const startBtn = $('start');
const stopBtn = $('stop');
const saveForm = $('save-form');
const saveBtn = $('save-btn');
const discardBtn = $('discard');
const saveNameInput = $('save-name');
const existingField = $('existing-field');
const existingSelect = $('existing-select');
const folderRadios = document.querySelectorAll('input[name="folder"]');

const statusEl = $('status');
const statusText = $('status-text');
const stepCountEl = $('step-count');
const startedAtEl = $('started-at');
const hintEl = $('hint');
const cutroomUrlInput = $('cutroom-url');
const saveUrlBtn = $('save-url');
const toastEl = $('toast');

const SETTINGS_KEY = 'foley_recorder_settings';
const DEFAULT_CUTROOM_URL = 'http://localhost:3000';

async function loadSettings() {
  const stored = await chrome.storage.local.get(SETTINGS_KEY);
  return stored[SETTINGS_KEY] ?? { cutroomUrl: DEFAULT_CUTROOM_URL };
}

async function saveSettings(s) {
  await chrome.storage.local.set({ [SETTINGS_KEY]: s });
}

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

function fmtTime(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function showToast(msg, kind = 'info') {
  toastEl.innerHTML = msg;
  toastEl.className = `toast ${kind === 'error' ? 'error' : kind === 'ok' ? 'ok' : ''}`;
  toastEl.hidden = false;
}

function clearToast() {
  toastEl.hidden = true;
  toastEl.textContent = '';
}

function defaultName(state) {
  if (state.startUrl) {
    try {
      const host = new URL(state.startUrl).hostname || 'capture';
      const stamp = new Date(state.startedAt ?? Date.now()).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
      return `${host} · ${stamp}`;
    } catch {
      /* fall through */
    }
  }
  return `Walkthrough · ${new Date().toLocaleString([], { hour: '2-digit', minute: '2-digit' })}`;
}

async function refresh() {
  const state = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
  if (!state) return;
  stepCountEl.textContent = state.stepCount ?? 0;
  startedAtEl.textContent = fmtTime(state.startedAt);

  const hasSteps = (state.stepCount ?? 0) > 0;

  if (state.recording) {
    statusEl.className = 'status recording';
    statusText.textContent = 'Recording…';
    startBtn.hidden = true;
    stopBtn.hidden = false;
    saveForm.hidden = true;
    hintEl.hidden = false;
    hintEl.innerHTML = 'Click around the page. Each click + form field becomes a step. Press <strong>Stop</strong> when done.';
  } else if (hasSteps) {
    statusEl.className = 'status done';
    statusText.textContent = `Captured ${state.stepCount} step${state.stepCount === 1 ? '' : 's'}`;
    startBtn.hidden = true;
    stopBtn.hidden = true;
    saveForm.hidden = false;
    hintEl.hidden = true;

    if (!saveNameInput.value) saveNameInput.value = defaultName(state);
    populateExistingFolders(); // fire and forget; cached after first call
  } else {
    statusEl.className = 'status idle';
    statusText.textContent = 'Ready';
    startBtn.hidden = false;
    startBtn.textContent = 'Start recording';
    stopBtn.hidden = true;
    saveForm.hidden = true;
    hintEl.hidden = false;
    hintEl.innerHTML = 'Press <strong>Start</strong>, then click around the app you want to document.';
  }
}

startBtn.addEventListener('click', async () => {
  clearToast();
  saveNameInput.value = '';
  const tab = await activeTab();
  await chrome.runtime.sendMessage({
    type: 'START_RECORDING',
    startUrl: tab?.url ?? null,
    tabId: tab?.id ?? null,
    windowId: tab?.windowId ?? null,
  });
  // Background broadcasts to the pinned tab — no need to ping here.
  refresh();
});

stopBtn.addEventListener('click', async () => {
  stopBtn.disabled = true;
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_RECORDING' });
    const tab = await activeTab();
    if (tab?.id) {
      chrome.tabs
        .sendMessage(tab.id, { type: 'RECORDING_STATE', recording: false })
        .catch(() => {});
    }
  } finally {
    stopBtn.disabled = false;
    refresh();
  }
});

discardBtn.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'DISCARD' });
  saveNameInput.value = '';
  clearToast();
  refresh();
});

folderRadios.forEach((r) => {
  r.addEventListener('change', () => {
    const useExisting = getFolderChoice() === 'existing';
    existingField.hidden = !useExisting;
    if (useExisting) populateExistingFolders();
  });
});

function getFolderChoice() {
  for (const r of folderRadios) if (r.checked) return r.value;
  return 'new';
}

let foldersCacheUrl = null;
async function populateExistingFolders(force = false) {
  const settings = await loadSettings();
  const cutroomUrl = (settings.cutroomUrl || DEFAULT_CUTROOM_URL).replace(/\/$/, '');
  if (!force && foldersCacheUrl === cutroomUrl && existingSelect.dataset.loaded === '1') return;
  foldersCacheUrl = cutroomUrl;
  existingSelect.dataset.loaded = '0';
  existingSelect.innerHTML = '<option value="">Loading…</option>';
  try {
    const r = await fetch(`${cutroomUrl}/api/walkthroughs`);
    const data = await r.json();
    if (!data?.ok || !Array.isArray(data.walkthroughs)) {
      throw new Error(data?.error || 'bad response');
    }
    if (data.walkthroughs.length === 0) {
      existingSelect.innerHTML = '<option value="">No folders yet — pick "New folder"</option>';
      existingSelect.disabled = true;
      return;
    }
    existingSelect.disabled = false;
    existingSelect.innerHTML = data.walkthroughs
      .map(
        (w) =>
          `<option value="${escapeAttr(w.id)}">${escapeText(w.display_name)} · ${w.step_count} step${w.step_count === 1 ? '' : 's'}</option>`,
      )
      .join('');
    existingSelect.dataset.loaded = '1';
  } catch (err) {
    existingSelect.innerHTML = `<option value="">Couldn't reach cutroom (${escapeText(err.message || err)})</option>`;
    existingSelect.disabled = true;
  }
}

function escapeText(s) {
  return String(s).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
}
function escapeAttr(s) {
  return String(s).replace(/["<>&]/g, (c) => ({ '"': '&quot;', '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c]);
}

saveForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveBtn.disabled = true;
  const name = saveNameInput.value.trim();
  if (!name) {
    showToast('Give the recording a name.', 'error');
    saveBtn.disabled = false;
    return;
  }
  const choice = getFolderChoice();
  let targetId = null;
  if (choice === 'existing') {
    targetId = existingSelect.value;
    if (!targetId) {
      showToast('Pick an existing folder, or switch to "New folder".', 'error');
      saveBtn.disabled = false;
      return;
    }
  }

  showToast('Sending to cutroom…');
  try {
    const exp = await chrome.runtime.sendMessage({ type: 'EXPORT' });
    if (!exp?.payload) {
      showToast('No payload returned.', 'error');
      return;
    }
    const payload = {
      ...exp.payload,
      display_name: name,
      ...(targetId ? { target_id: targetId } : {}),
    };

    const settings = await loadSettings();
    const cutroomUrl = (settings.cutroomUrl || DEFAULT_CUTROOM_URL).replace(/\/$/, '');
    const result = await postToCutroom(cutroomUrl, payload);

    if (result.ok) {
      const fullUrl = `${cutroomUrl}${result.url}`;
      const verb = result.mode === 'append' ? 'Appended to' : 'Created';
      showToast(`${verb} <strong>${escapeText(name)}</strong>.`, 'ok');
      chrome.tabs.create({ url: fullUrl });
      // Wipe the captured payload so a re-open of the popup is clean.
      await chrome.runtime.sendMessage({ type: 'DISCARD' });
      saveNameInput.value = '';
      refresh();
    } else {
      showToast(`Cutroom error (${result.reason}). Falling back to JSON download.`, 'error');
      downloadJson(payload);
    }
  } finally {
    saveBtn.disabled = false;
  }
});

saveUrlBtn.addEventListener('click', async () => {
  const v = (cutroomUrlInput.value || '').trim() || DEFAULT_CUTROOM_URL;
  try {
    new URL(v);
  } catch {
    showToast('That doesn\'t look like a valid URL.', 'error');
    return;
  }
  await saveSettings({ cutroomUrl: v });
  foldersCacheUrl = null;
  showToast('Saved.', 'ok');
});

async function postToCutroom(baseUrl, payload) {
  const endpoint = `${baseUrl}/api/walkthroughs/import`;
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      return { ok: false, reason: `HTTP ${resp.status}`, detail: text };
    }
    const data = await resp.json();
    if (!data?.ok || !data?.url) return { ok: false, reason: 'bad response' };
    return { ok: true, id: data.id, url: data.url, mode: data.mode };
  } catch (err) {
    return { ok: false, reason: err?.message || 'network error' };
  }
}

function downloadJson(payload) {
  const json = JSON.stringify(payload, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().replace(/[:.]/g, '-').replace(/Z$/, '');
  chrome.downloads.download(
    { url, filename: `foley-walkthrough-${ts}.json`, saveAs: true },
    () => setTimeout(() => URL.revokeObjectURL(url), 60_000),
  );
}

(async function init() {
  const settings = await loadSettings();
  cutroomUrlInput.value = settings.cutroomUrl || DEFAULT_CUTROOM_URL;
  refresh();
})();
