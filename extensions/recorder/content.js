// Foley Recorder — content script.
// Listens for clicks + form input on the page and forwards structured events
// to the background service worker.

(() => {
  if (window.__foleyRecorderInjected) return;
  window.__foleyRecorderInjected = true;

  let recording = false;
  let inputTimer = null;
  let inputElement = null;

  // ---- Bootstrap ----------------------------------------------------------

  // Ask the background whether we should already be recording (handles SPA
  // navigations and tabs that load while a session is in progress).
  chrome.runtime.sendMessage({ type: 'IS_RECORDING' }, (resp) => {
    if (chrome.runtime.lastError) return;
    if (resp?.recording) setRecording(true);
  });

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg?.type === 'RECORDING_STATE') setRecording(!!msg.recording);
  });

  function setRecording(next) {
    if (next === recording) return;
    recording = next;
    if (recording) {
      attach();
      showBadge();
    } else {
      flushInput();
      detach();
      hideBadge();
    }
  }

  // ---- Event listeners ----------------------------------------------------

  function attach() {
    document.addEventListener('click', onClick, true);
    document.addEventListener('input', onInput, true);
    document.addEventListener('change', onChange, true);
    document.addEventListener('blur', onBlur, true);
  }

  function detach() {
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('input', onInput, true);
    document.removeEventListener('change', onChange, true);
    document.removeEventListener('blur', onBlur, true);
  }

  function fromBadge(el) {
    return !!el?.closest?.('#foley-recorder-badge');
  }

  function onClick(e) {
    if (!recording) return;
    if (e.button !== 0) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return; // user is doing browser stuff
    const raw = e.target;
    if (!(raw instanceof Element)) return;
    if (fromBadge(raw)) return;

    // If the user typed into a field then clicked elsewhere within the input
    // debounce window, the buffered input must be sent BEFORE the click so the
    // background sees them in the right order.
    if (inputElement) flushInput();

    const target = meaningfulTarget(raw);
    const selectors = buildSelectors(target);
    const label = elementLabel(target);
    const role = roleOf(target);

    send({
      kind: 'click',
      selectors,
      label,
      role,
      title: describeClick(target, label, role),
      url: location.href,
      viewport: viewportSize(),
      timestamp: Date.now(),
    });
  }

  function viewportSize() {
    return {
      width: window.innerWidth || document.documentElement.clientWidth || 1440,
      height: window.innerHeight || document.documentElement.clientHeight || 900,
    };
  }

  function onInput(e) {
    if (!recording) return;
    const el = e.target;
    if (!isFormField(el)) return;
    if (fromBadge(el)) return;

    if (inputElement && inputElement !== el) flushInput();
    inputElement = el;
    if (inputTimer) clearTimeout(inputTimer);
    inputTimer = setTimeout(flushInput, 800);
  }

  function onChange(e) {
    if (!recording) return;
    const el = e.target;
    if (!isFormField(el)) return;
    // Native change on checkbox/radio/select fires on commit — flush eagerly.
    if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT') {
      inputElement = el;
      flushInput();
    }
  }

  function onBlur(e) {
    if (!recording) return;
    if (e.target === inputElement) flushInput();
  }

  function flushInput() {
    if (!inputElement) return;
    const el = inputElement;
    inputElement = null;
    if (inputTimer) {
      clearTimeout(inputTimer);
      inputTimer = null;
    }

    const isPassword = el.type === 'password';
    const rawValue = el.type === 'checkbox' || el.type === 'radio'
      ? (el.checked ? 'checked' : 'unchecked')
      : (el.value ?? '');
    const value = isPassword ? '••••••' : String(rawValue);

    const selectors = buildSelectors(el);
    const label = elementLabel(el);
    const role = roleOf(el);

    send({
      kind: 'input',
      selectors,
      label,
      role,
      value,
      title: describeInput(label, role, value, isPassword),
      url: location.href,
      viewport: viewportSize(),
      timestamp: Date.now(),
    });
  }

  function send(event) {
    try {
      chrome.runtime.sendMessage({ type: 'EVENT_CAPTURED', event }, () => {
        // swallow errors (e.g. background restart) — best effort
        void chrome.runtime.lastError;
      });
    } catch (err) {
      // extension context invalidated (reload) — give up quietly
    }
  }

  // ---- Target picking -----------------------------------------------------

  function meaningfulTarget(el) {
    // Climb to the nearest semantically meaningful ancestor so clicks on
    // <span> inside a <button> attribute to the button.
    return (
      el.closest(
        'button, a, [role="button"], [role="link"], [role="menuitem"], [role="tab"], [role="option"], input, select, textarea, label, [data-testid], [data-test], [data-cy], [aria-label]',
      ) || el
    );
  }

  function isFormField(el) {
    if (!(el instanceof Element)) return false;
    const tag = el.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  }

  // ---- Selector synthesis -------------------------------------------------

  function buildSelectors(el) {
    const candidates = [];
    const dataAttrs = ['data-testid', 'data-test', 'data-test-id', 'data-cy', 'data-qa'];
    for (const attr of dataAttrs) {
      const v = el.getAttribute?.(attr);
      if (v) candidates.push(`[${attr}="${cssEscape(v)}"]`);
    }
    if (el.id && !looksAutoGenerated(el.id)) {
      candidates.push(`#${cssEscape(el.id)}`);
    }
    const aria = el.getAttribute?.('aria-label');
    if (aria) candidates.push(`[aria-label="${cssEscape(aria)}"]`);

    const name = el.getAttribute?.('name');
    if (name) {
      const tag = el.tagName.toLowerCase();
      candidates.push(`${tag}[name="${cssEscape(name)}"]`);
    }

    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    if (href && href.length < 80) {
      candidates.push(`a[href="${cssEscape(href)}"]`);
    }

    // Path fallback always last.
    candidates.push(cssPath(el));

    // Pick the first selector that uniquely resolves to this element.
    let primary = candidates[candidates.length - 1];
    for (const sel of candidates) {
      try {
        const matches = document.querySelectorAll(sel);
        if (matches.length === 1 && matches[0] === el) {
          primary = sel;
          break;
        }
      } catch {
        // invalid selector — skip
      }
    }
    return { primary, candidates };
  }

  function cssEscape(s) {
    if (window.CSS && CSS.escape) return CSS.escape(String(s));
    return String(s).replace(/["\\\n\r\t]/g, '\\$&');
  }

  function looksAutoGenerated(token) {
    if (!token) return false;
    if (/^:r/.test(token)) return true; // React useId
    if (/^[a-z]+-?\d{4,}$/i.test(token)) return true; // ember1234, mui-12345
    if (/^[0-9a-f]{8,}$/i.test(token)) return true; // hash-like
    if (/__[a-zA-Z0-9]+/.test(token)) return true; // CSS module hash suffixes
    return false;
  }

  function cssPath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur.nodeType === 1 && parts.length < 6) {
      let part = cur.tagName.toLowerCase();
      if (cur.id && !looksAutoGenerated(cur.id)) {
        parts.unshift(`#${cssEscape(cur.id)}`);
        break;
      }
      const classes = cur.classList ? [...cur.classList].filter((c) => !looksAutoGenerated(c)) : [];
      if (classes.length) part += '.' + classes.slice(0, 2).map(cssEscape).join('.');
      const parent = cur.parentElement;
      if (parent) {
        const sibs = [...parent.children].filter((c) => c.tagName === cur.tagName);
        if (sibs.length > 1) {
          part += `:nth-of-type(${sibs.indexOf(cur) + 1})`;
        }
      }
      parts.unshift(part);
      cur = cur.parentElement;
      if (cur && cur.tagName === 'BODY') {
        parts.unshift('body');
        break;
      }
    }
    return parts.join(' > ');
  }

  // ---- Labels & roles -----------------------------------------------------

  function roleOf(el) {
    const explicit = el.getAttribute?.('role');
    if (explicit) return explicit;
    const tag = el.tagName?.toLowerCase();
    if (tag === 'a' && el.getAttribute('href')) return 'link';
    if (tag === 'button') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'input') {
      const t = (el.type || '').toLowerCase();
      if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'range') return 'slider';
      return 'textbox';
    }
    return tag || 'element';
  }

  function elementLabel(el) {
    const aria = el.getAttribute?.('aria-label');
    if (aria) return clean(aria);

    const labelledBy = el.getAttribute?.('aria-labelledby');
    if (labelledBy) {
      const ref = document.getElementById(labelledBy);
      if (ref?.textContent) return clean(ref.textContent);
    }

    const text = (el.innerText || el.textContent || '').trim();
    if (text && text.length <= 80) return clean(text);

    const placeholder = el.getAttribute?.('placeholder');
    if (placeholder) return clean(placeholder);

    const title = el.getAttribute?.('title');
    if (title) return clean(title);

    if (el.id) {
      const lbl = document.querySelector(`label[for="${cssEscape(el.id)}"]`);
      if (lbl?.textContent) return clean(lbl.textContent);
    }
    const parentLabel = el.closest?.('label');
    if (parentLabel?.textContent) return clean(parentLabel.textContent);

    const value = el.value;
    if (value && typeof value === 'string' && value.length < 40) return clean(value);

    return null;
  }

  function clean(s) {
    return String(s).replace(/\s+/g, ' ').trim();
  }

  function nounFor(role) {
    switch (role) {
      case 'button': return 'button';
      case 'link': return 'link';
      case 'checkbox': return 'checkbox';
      case 'radio': return 'option';
      case 'combobox': return 'dropdown';
      case 'textbox': return 'field';
      case 'slider': return 'slider';
      case 'tab': return 'tab';
      case 'menuitem': return 'menu item';
      default: return role;
    }
  }

  function describeClick(el, label, role) {
    const noun = nounFor(role);
    if (label) return `Click the "${label}" ${noun}`;
    return `Click ${article(noun)} ${noun}`;
  }

  function describeInput(label, role, value, isPassword) {
    const target = label ? `the "${label}" ${nounFor(role)}` : nounFor(role);
    if (isPassword) return `Enter password into ${target}`;
    if (value === 'checked' || value === 'unchecked') {
      return `${value === 'checked' ? 'Check' : 'Uncheck'} ${target}`;
    }
    if (value && value.length <= 60) return `Type "${value}" into ${target}`;
    return `Type into ${target}`;
  }

  function article(noun) {
    return /^[aeiou]/i.test(noun) ? 'an' : 'a';
  }

  // ---- Recording badge ----------------------------------------------------

  function showBadge() {
    if (document.getElementById('foley-recorder-badge')) return;
    const badge = document.createElement('div');
    badge.id = 'foley-recorder-badge';
    badge.setAttribute('aria-hidden', 'true');
    badge.style.cssText = [
      'position:fixed', 'bottom:16px', 'right:16px', 'z-index:2147483647',
      'background:#ef4444', 'color:white',
      'padding:8px 14px', 'border-radius:999px',
      'font:600 12px/1 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'letter-spacing:0.04em',
      'box-shadow:0 6px 20px rgba(239,68,68,0.35),0 1px 2px rgba(0,0,0,0.2)',
      'display:flex', 'gap:8px', 'align-items:center',
      'pointer-events:none', 'user-select:none',
    ].join(';');
    const dot = document.createElement('span');
    dot.style.cssText = 'width:8px;height:8px;border-radius:50%;background:white;display:inline-block;animation:foley-rec-pulse 1.4s ease-in-out infinite';
    const txt = document.createElement('span');
    txt.textContent = 'REC';
    badge.appendChild(dot);
    badge.appendChild(txt);

    const style = document.createElement('style');
    style.id = 'foley-recorder-style';
    style.textContent = '@keyframes foley-rec-pulse{0%,100%{opacity:1}50%{opacity:0.25}}';
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(badge);
  }

  function hideBadge() {
    document.getElementById('foley-recorder-badge')?.remove();
    document.getElementById('foley-recorder-style')?.remove();
  }
})();
