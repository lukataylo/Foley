// Foley Recorder — background service worker.
// Owns recording state, takes screenshots, builds the export payload.

const STORAGE_KEY = 'foley_recorder_state';
const CAPTURE_DELAY_MS = 90;       // let post-click DOM settle before screenshotting
const INPUT_FLUSH_TIMEOUT_MS = 800; // matches content.js debounce; safety net here

function freshState() {
  return {
    recording: false,
    startedAt: null,
    startUrl: null,
    tabId: null,    // pinned at START — events from other tabs are ignored
    windowId: null, // used for captureVisibleTab when the user is multi-window
    viewport: null, // {width,height} — captured from first event
    steps: [],
    pendingInput: null, // {selectors,label,role,value,url,timestamp,screenshot}
    lastCaptureAt: 0,
  };
}

async function loadState() {
  const stored = await chrome.storage.session.get(STORAGE_KEY);
  return stored[STORAGE_KEY] ?? freshState();
}

async function saveState(state) {
  await chrome.storage.session.set({ [STORAGE_KEY]: state });
}

// captureVisibleTab is rate-limited (~2/sec). Throttle + retry once on failure.
async function captureScreenshot(windowId, lastCaptureAt) {
  const sinceLast = Date.now() - lastCaptureAt;
  if (sinceLast < 550) {
    await sleep(550 - sinceLast);
  }
  await sleep(CAPTURE_DELAY_MS);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await chrome.tabs.captureVisibleTab(windowId, {
        format: 'png',
      });
    } catch (err) {
      if (attempt === 0) {
        await sleep(400);
        continue;
      }
      console.warn('[foley-recorder] screenshot failed:', err);
      return null;
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pushStepFromInput(state, buf) {
  state.steps.push({
    id: `step_${state.steps.length + 1}`,
    title: buf.title,
    url: buf.url,
    timestamp: buf.timestamp,
    action: {
      kind: 'fill',
      selectors: buf.selectors,
      label: buf.label,
      role: buf.role,
      value: buf.value,
    },
    screenshot: buf.screenshot,
  });
}

async function flushPendingInput(state) {
  if (!state.pendingInput) return;
  pushStepFromInput(state, state.pendingInput);
  state.pendingInput = null;
}

function broadcastState(recording, onlyTabId = null) {
  // When recording is pinned to a specific tab, only that tab needs to know.
  // On stop we tell every tab so any stale REC badge clears.
  if (recording && typeof onlyTabId === 'number') {
    chrome.tabs
      .sendMessage(onlyTabId, { type: 'RECORDING_STATE', recording: true })
      .catch(() => {});
    return;
  }
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (!tab.id) continue;
      chrome.tabs
        .sendMessage(tab.id, { type: 'RECORDING_STATE', recording })
        .catch(() => {}); // tab may not have content script
    }
  });
}

// Serialize state-mutating handlers — chrome.runtime.onMessage delivers events
// concurrently, but our handlers do read-modify-write on chrome.storage.session
// (plus async screenshot capture in between). Without a queue, two clicks
// arriving close together can both load the same state, append their step,
// and one write clobbers the other — losing a step.
let mutationQueue = Promise.resolve();
function queued(fn) {
  const next = mutationQueue.then(fn, fn); // run regardless of prior outcome
  mutationQueue = next.catch(() => {});
  return next;
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === 'IS_RECORDING') {
        const state = await loadState();
        const tabId = sender?.tab?.id;
        // Content scripts ask "should I be active?" — only say yes when
        // recording is pinned to this tab (or unpinned legacy state).
        const onMyTab =
          state.recording &&
          (state.tabId == null || state.tabId === tabId);
        sendResponse({ recording: !!onMyTab });
        return;
      }

      if (msg?.type === 'GET_STATE') {
        const state = await loadState();
        sendResponse({
          recording: state.recording,
          stepCount: state.steps.length,
          startedAt: state.startedAt,
          startUrl: state.startUrl,
          hasPendingInput: !!state.pendingInput,
        });
        return;
      }

      if (msg?.type === 'START_RECORDING') {
        await queued(async () => {
          const state = freshState();
          state.recording = true;
          state.startedAt = Date.now();
          state.startUrl = msg.startUrl ?? null;
          state.tabId = typeof msg.tabId === 'number' ? msg.tabId : null;
          state.windowId = typeof msg.windowId === 'number' ? msg.windowId : null;
          await saveState(state);
          broadcastState(true, state.tabId);
        });
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === 'STOP_RECORDING') {
        const stepCount = await queued(async () => {
          const state = await loadState();
          await flushPendingInput(state);
          state.recording = false;
          await saveState(state);
          broadcastState(false);
          return state.steps.length;
        });
        sendResponse({ ok: true, stepCount });
        return;
      }

      if (msg?.type === 'DISCARD') {
        await queued(async () => {
          await saveState(freshState());
          broadcastState(false);
        });
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === 'EXPORT') {
        const payload = await queued(async () => {
          const state = await loadState();
          await flushPendingInput(state);
          await saveState(state);
          return buildExport(state);
        });
        sendResponse({ ok: true, payload });
        return;
      }

      if (msg?.type === 'EVENT_CAPTURED') {
        const result = await queued(() => handleEventCaptured(msg, sender));
        sendResponse(result);
        return;
      }
    } catch (err) {
      console.error('[foley-recorder] handler error:', err);
      sendResponse({ ok: false, reason: 'error', error: String(err) });
    }
  })();
  return true; // keep sendResponse channel open for async work
});

async function handleEventCaptured(msg, sender) {
  const state = await loadState();
  if (!state.recording) {
    return { ok: false, reason: 'not_recording' };
  }

  // Recording is pinned to the tab where Start was clicked. Ignore stray
  // events from other tabs that happen to have the content script attached.
  const senderTabId = sender?.tab?.id;
  if (state.tabId != null && state.tabId !== senderTabId) {
    return { ok: false, reason: 'wrong_tab' };
  }

  const windowId = sender?.tab?.windowId;
  if (typeof windowId !== 'number') {
    return { ok: false, reason: 'no_window' };
  }

  const ev = msg.event;
  if (!state.viewport && ev.viewport) {
    state.viewport = ev.viewport;
  }

  // Buffer input events: collapse repeated typing into one "fill" step.
  if (ev.kind === 'input') {
    if (
      state.pendingInput &&
      state.pendingInput.selectors.primary !== ev.selectors.primary
    ) {
      await flushPendingInput(state);
    }

    let screenshot = state.pendingInput?.screenshot ?? null;
    if (!screenshot) {
      screenshot = await captureScreenshot(windowId, state.lastCaptureAt);
      state.lastCaptureAt = Date.now();
    }

    state.pendingInput = {
      selectors: ev.selectors,
      label: ev.label,
      role: ev.role,
      value: ev.value,
      title: ev.title,
      url: ev.url,
      timestamp: ev.timestamp,
      screenshot,
    };
    await saveState(state);
    return { ok: true, stepCount: state.steps.length };
  }

  // Any non-input event commits a pending input first.
  await flushPendingInput(state);

  const screenshot = await captureScreenshot(windowId, state.lastCaptureAt);
  state.lastCaptureAt = Date.now();

  state.steps.push({
    id: `step_${state.steps.length + 1}`,
    title: ev.title,
    url: ev.url,
    timestamp: ev.timestamp,
    action: {
      kind: ev.kind,
      selectors: ev.selectors,
      label: ev.label,
      role: ev.role,
    },
    screenshot,
  });
  await saveState(state);
  return { ok: true, stepCount: state.steps.length };
}

// Re-broadcast recording state when the pinned tab finishes loading, so a
// freshly-injected content script after navigation resumes capture without
// the user having to poll.
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (info.status !== 'complete') return;
  const state = await loadState();
  if (!state.recording) return;
  if (state.tabId != null && state.tabId !== tabId) return;
  chrome.tabs
    .sendMessage(tabId, { type: 'RECORDING_STATE', recording: true })
    .catch(() => {});
});

// If the pinned tab is closed mid-recording, treat that as a stop so we don't
// leave the badge running silently and so the popup state stays consistent.
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await queued(async () => {
    const state = await loadState();
    if (!state.recording || state.tabId !== tabId) return;
    await flushPendingInput(state);
    state.recording = false;
    await saveState(state);
    // No broadcast needed — the tab is gone.
  });
});

// ---- Export builder -------------------------------------------------------

function buildExport(state) {
  const endedAt = Date.now();
  return {
    version: 1,
    captured_at: state.startedAt ? new Date(state.startedAt).toISOString() : null,
    ended_at: new Date(endedAt).toISOString(),
    duration_ms: state.startedAt ? endedAt - state.startedAt : 0,
    start_url: state.startUrl,
    viewport: state.viewport,
    steps: state.steps,
    yaml_preview: stepsToYaml(state.steps, state.startUrl),
  };
}

function yamlString(s) {
  return JSON.stringify(s ?? '');
}

function stripOrigin(url, startUrl) {
  if (!url) return '/';
  try {
    const u = new URL(url);
    if (startUrl) {
      const base = new URL(startUrl);
      if (u.origin === base.origin) return u.pathname + u.search + u.hash;
    }
    return url;
  } catch {
    return url;
  }
}

function stepsToYaml(steps, startUrl) {
  const lines = [];
  lines.push('# Captured by Foley Recorder');
  lines.push('version: 1');
  if (startUrl) lines.push(`start_url: ${yamlString(startUrl)}`);
  lines.push('');
  lines.push('steps:');

  let lastUrl = null;
  for (const s of steps) {
    lines.push('');
    lines.push(`  - id: ${s.id}`);
    lines.push(`    title: ${yamlString(s.title)}`);
    lines.push(`    narration: ${yamlString(s.title)}`);
    lines.push(`    duration_ms: 4000`);
    lines.push(`    actions:`);

    const path = stripOrigin(s.url, startUrl);
    if (path !== lastUrl) {
      lines.push(`      - { kind: goto, url: ${yamlString(path)} }`);
      lines.push(`      - { kind: wait, ms: 800 }`);
      lastUrl = path;
    }

    const sel = s.action?.selectors?.primary;
    if (s.action?.kind === 'click' && sel) {
      lines.push(`      - { kind: click, selector: ${yamlString(sel)} }`);
    } else if (s.action?.kind === 'fill' && sel) {
      lines.push(
        `      - { kind: fill, selector: ${yamlString(sel)}, value: ${yamlString(s.action.value ?? '')} }`,
      );
    } else if (s.action?.kind === 'hover' && sel) {
      lines.push(`      - { kind: hover, selector: ${yamlString(sel)} }`);
    }
    lines.push(`      - { kind: wait, ms: 1500 }`);
  }
  return lines.join('\n');
}
