"use client";

// First-run / settings surface for API keys. Reads /api/keys to find what
// is already configured, lets the user paste new values, validates each
// against the live provider before saving, and writes to .env atomically.

import { useEffect, useState } from "react";

type KeyId =
  | "ANTHROPIC_API_KEY"
  | "ELEVENLABS_API_KEY"
  | "GOOGLE_API_KEY"
  | "GITHUB_TOKEN";

interface KeyMeta {
  label: string;
  required: boolean;
  placeholder: string;
  help: string;
  href: string;
}

const META: Record<KeyId, KeyMeta> = {
  ANTHROPIC_API_KEY: {
    label: "Anthropic API key",
    required: true,
    placeholder: "sk-ant-…",
    help: "Drives the step proposer + PR diff agent.",
    href: "https://console.anthropic.com/settings/keys",
  },
  ELEVENLABS_API_KEY: {
    label: "ElevenLabs API key",
    required: true,
    placeholder: "sk_…",
    help: "Used to synthesize narration. Paste a Creator-tier or higher key.",
    href: "https://elevenlabs.io/app/settings/api-keys",
  },
  GOOGLE_API_KEY: {
    label: "Google API key",
    required: false,
    placeholder: "AIza…",
    help: "Optional — unlocks Nano Banana (Gemini 2.5 Flash Image) for laptop-mockup + stylized-transition clips in the take editor.",
    href: "https://aistudio.google.com/apikey",
  },
  GITHUB_TOKEN: {
    label: "GitHub token",
    required: false,
    placeholder: "ghp_…",
    help: "Optional — only needed for the live PR webhook + onboarding repo list.",
    href: "https://github.com/settings/tokens",
  },
};

interface KeyStatus {
  configured: boolean;
  masked: string;
}

interface TestResult {
  ok: boolean;
  error?: string;
  meta?: Record<string, string>;
}

interface Props {
  /** When provided, the panel hides itself once all required keys are set
   *  AND no draft values are pending. Set false to keep it always visible. */
  collapseWhenReady?: boolean;
  onSaved?: () => void;
}

export function KeysPanel({ collapseWhenReady = true, onSaved }: Props) {
  const [status, setStatus] = useState<Record<KeyId, KeyStatus> | null>(null);
  const [drafts, setDrafts] = useState<Record<KeyId, string>>({
    ANTHROPIC_API_KEY: "",
    ELEVENLABS_API_KEY: "",
    GOOGLE_API_KEY: "",
    GITHUB_TOKEN: "",
  });
  const [results, setResults] = useState<Record<string, TestResult> | null>(null);
  const [busy, setBusy] = useState<"test" | "save" | null>(null);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  async function refresh() {
    const r = await fetch("/api/keys", { cache: "no-store" });
    const j = await r.json();
    setStatus(j.status);
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function runTest() {
    setBusy("test");
    setResults(null);
    setSavedNote(null);
    try {
      const filled: Partial<Record<KeyId, string>> = {};
      (Object.keys(drafts) as KeyId[]).forEach((k) => {
        if (drafts[k]) filled[k] = drafts[k];
      });
      if (Object.keys(filled).length === 0) {
        setResults({});
        return;
      }
      const r = await fetch("/api/keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filled),
      });
      const j = (await r.json()) as { results?: Record<string, TestResult> };
      setResults(j.results ?? {});
    } finally {
      setBusy(null);
    }
  }

  async function saveAll() {
    setBusy("save");
    setSavedNote(null);
    try {
      // 1) Validate first.
      const filled: Partial<Record<KeyId, string>> = {};
      (Object.keys(drafts) as KeyId[]).forEach((k) => {
        if (drafts[k]) filled[k] = drafts[k];
      });
      if (Object.keys(filled).length === 0) return;

      const tr = await fetch("/api/keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filled),
      });
      const tj = (await tr.json()) as {
        ok: boolean;
        results?: Record<string, TestResult>;
      };
      setResults(tj.results ?? {});
      if (!tj.ok) return;

      // 2) Persist.
      const sr = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(filled),
      });
      const sj = (await sr.json()) as { ok: boolean; note?: string };
      if (!sj.ok) {
        setSavedNote("Save failed.");
        return;
      }
      setSavedNote(sj.note ?? "Saved.");
      setDrafts({
        ANTHROPIC_API_KEY: "",
        ELEVENLABS_API_KEY: "",
        GOOGLE_API_KEY: "",
        GITHUB_TOKEN: "",
      });
      await refresh();
      onSaved?.();
    } finally {
      setBusy(null);
    }
  }

  if (!status) return null;

  const required: KeyId[] = (Object.keys(META) as KeyId[]).filter(
    (k) => META[k].required,
  );
  const allRequiredSet = required.every((k) => status[k].configured);
  const hasDrafts = Object.values(drafts).some((v) => v.length > 0);
  if (collapseWhenReady && allRequiredSet && !hasDrafts) {
    return null;
  }

  return (
    <section className="keys-panel" id="keys">
      <header className="keys-panel-head">
        <h2>API keys</h2>
        <p className="keys-panel-sub">
          Foley calls Claude and ElevenLabs directly from your machine.
          Keys are saved to <code>.env</code> at the repo root and never
          sent anywhere else.
        </p>
      </header>

      <div className="keys-rows">
        {(Object.keys(META) as KeyId[]).map((k) => {
          const meta = META[k];
          const s = status[k];
          const draft = drafts[k];
          const result = results?.[k];
          return (
            <div key={k} className="keys-row">
              <div className="keys-row-head">
                <span className="keys-row-label">
                  {meta.label}
                  {meta.required ? <span className="keys-req">required</span> : null}
                </span>
                <span className={`keys-state ${s.configured ? "ok" : "missing"}`}>
                  {s.configured ? `set · ${s.masked}` : "not set"}
                </span>
              </div>
              <input
                type="password"
                className="keys-input"
                placeholder={meta.placeholder}
                value={draft}
                onChange={(e) =>
                  setDrafts((d) => ({ ...d, [k]: e.target.value }))
                }
                spellCheck={false}
                autoComplete="off"
              />
              <div className="keys-row-foot">
                <span className="keys-row-help">
                  {meta.help}{" "}
                  <a href={meta.href} target="_blank" rel="noreferrer">
                    Get one →
                  </a>
                </span>
                {result ? (
                  <span className={`keys-test ${result.ok ? "ok" : "err"}`}>
                    {result.ok
                      ? `✓ valid${result.meta?.login ? ` · ${result.meta.login}` : ""}${result.meta?.tier ? ` · ${result.meta.tier}` : ""}`
                      : `✗ ${result.error}`}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <div className="keys-actions">
        <button
          type="button"
          className="brand-edit-btn"
          onClick={runTest}
          disabled={!hasDrafts || busy !== null}
        >
          {busy === "test" ? "Testing…" : "Test only"}
        </button>
        <button
          type="button"
          className="onboard-btn onboard-btn-primary"
          onClick={saveAll}
          disabled={!hasDrafts || busy !== null}
        >
          {busy === "save" ? "Validating + saving…" : "Validate & save"}
        </button>
      </div>

      {savedNote ? <p className="keys-note">{savedNote}</p> : null}
    </section>
  );
}
