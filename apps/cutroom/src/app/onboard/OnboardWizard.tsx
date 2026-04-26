"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeysPanel } from "@/components/KeysPanel";

interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  private: boolean;
  owner_avatar: string | null;
  default_branch: string;
}

type Step = "auth" | "pick" | "bootstrap" | "done";

const STEP_LABELS: Record<Step, string> = {
  auth: "API keys",
  pick: "Paste a repo",
  bootstrap: "Bootstrap walkthrough",
  done: "Open in studio",
};

interface KeyStatus {
  configured: boolean;
  masked: string;
}

type ResolveState =
  | { state: "idle" }
  | { state: "resolving" }
  | { state: "ok"; repo: Repo; warning: string | null }
  | { state: "err"; message: string };

export function OnboardWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("auth");
  const [repoUrl, setRepoUrl] = useState("");
  const [resolve, setResolve] = useState<ResolveState>({ state: "idle" });
  const [picked, setPicked] = useState<Repo | null>(null);
  const [devUrl, setDevUrl] = useState("http://localhost:3001");
  const [devUrlTest, setDevUrlTest] = useState<
    | null
    | { state: "testing" }
    | { state: "ok"; title: string | null }
    | { state: "err"; message: string }
  >(null);
  const [bootstrapMsg, setBootstrapMsg] = useState("");
  const [bootstrapHref, setBootstrapHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [keysReady, setKeysReady] = useState<boolean | null>(null);

  // Poll the keys status so we can gate "Continue" behind a configured
  // .env. Refresh when KeysPanel reports a save so the gate releases
  // immediately.
  async function refreshKeys() {
    try {
      const r = await fetch("/api/keys", { cache: "no-store" });
      const j = (await r.json()) as {
        status?: Record<string, KeyStatus>;
      };
      const status = j.status ?? {};
      const a = status.ANTHROPIC_API_KEY?.configured ?? false;
      const e = status.ELEVENLABS_API_KEY?.configured ?? false;
      setKeysReady(a && e);
    } catch {
      setKeysReady(false);
    }
  }
  useEffect(() => {
    void refreshKeys();
  }, []);

  async function testDevUrl() {
    setDevUrlTest({ state: "testing" });
    try {
      const r = await fetch(
        `/api/preflight/dev-url?url=${encodeURIComponent(devUrl)}`,
      );
      const j = (await r.json()) as
        | { ok: true; title: string | null }
        | { ok: false; error: string };
      if (j.ok) setDevUrlTest({ state: "ok", title: j.title });
      else setDevUrlTest({ state: "err", message: j.error });
    } catch (e) {
      setDevUrlTest({
        state: "err",
        message: e instanceof Error ? e.message : "network error",
      });
    }
  }

  // Debounce the URL → resolve call so typing doesn't fire 30 requests.
  const resolveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  async function resolveRepo(url: string) {
    const trimmed = url.trim();
    if (!trimmed) {
      setResolve({ state: "idle" });
      return;
    }
    setResolve({ state: "resolving" });
    try {
      const r = await fetch(
        `/api/github/resolve?url=${encodeURIComponent(trimmed)}`,
        { cache: "no-store" },
      );
      const j = (await r.json()) as
        | { ok: true; repo: Repo; fallback?: boolean; warning?: string }
        | { ok: false; error: string };
      if (!j.ok) {
        setResolve({ state: "err", message: j.error });
        return;
      }
      setResolve({
        state: "ok",
        repo: j.repo,
        warning: j.warning ?? null,
      });
    } catch (e) {
      setResolve({
        state: "err",
        message: e instanceof Error ? e.message : "network error",
      });
    }
  }

  function onRepoUrlChange(value: string) {
    setRepoUrl(value);
    if (resolveTimer.current) clearTimeout(resolveTimer.current);
    if (!value.trim()) {
      setResolve({ state: "idle" });
      return;
    }
    resolveTimer.current = setTimeout(() => {
      void resolveRepo(value);
    }, 350);
  }

  async function pickRepo(repo: Repo) {
    setPicked(repo);
    setStep("bootstrap");
    setError(null);

    // Phase 1 — disk scaffold (always succeeds, fast).
    setBootstrapMsg("Cloning repo metadata…");
    let bootstrapJson: { id: string; href: string; display_name: string };
    try {
      const res = await fetch("/api/onboard/bootstrap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          full_name: repo.full_name,
          default_branch: repo.default_branch,
          description: repo.description,
          dev_url: devUrl,
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(`Bootstrap failed: ${text}`);
        return;
      }
      bootstrapJson = (await res.json()) as {
        id: string;
        href: string;
        display_name: string;
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bootstrap error");
      return;
    }

    // Phase 2 — Claude drafts the steps. Slow (≈20–40s) because the model
    // is using adaptive thinking with effort=high and we fetch the dev URL's
    // HTML for grounding. We show staged status so the wait reads as
    // intentional rather than hung.
    const stages = [
      "Fetching landing page…",
      "Reading page structure…",
      "Drafting your first walkthrough…",
      "Writing steps to disk…",
    ];
    let stageIdx = 0;
    setBootstrapMsg(stages[0]);
    const stageTimer = setInterval(() => {
      stageIdx = Math.min(stageIdx + 1, stages.length - 1);
      setBootstrapMsg(stages[stageIdx]);
    }, 5000);

    try {
      const res = await fetch("/api/onboard/propose-steps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkthrough_id: bootstrapJson.id,
          dev_url: devUrl,
          description: repo.description ?? "",
        }),
      });
      clearInterval(stageTimer);
      if (!res.ok) {
        // The scaffold is on disk either way — let the user open the studio
        // and surface the most useful error we can.
        const json = (await res.json().catch(() => ({}))) as {
          message?: string;
          missing_keys?: string[];
          detail?: string;
        };
        const friendly =
          json.message ??
          (json.detail
            ? `Auto-draft failed: ${json.detail.slice(0, 200)}.`
            : "Auto-draft failed.");
        setError(`${friendly} The scaffold is saved — open the studio to edit.`);
        setBootstrapMsg(`Walkthrough "${bootstrapJson.display_name}" is ready.`);
        setBootstrapHref(bootstrapJson.href);
        setStep("done");
        return;
      }
    } catch (e) {
      clearInterval(stageTimer);
      setError(
        `Auto-draft errored: ${e instanceof Error ? e.message : "unknown"}. The scaffold is saved — open the studio to continue manually.`,
      );
      setBootstrapMsg(`Walkthrough "${bootstrapJson.display_name}" is ready.`);
      setBootstrapHref(bootstrapJson.href);
      setStep("done");
      return;
    }

    setBootstrapMsg(`Walkthrough "${bootstrapJson.display_name}" is ready.`);
    setBootstrapHref(bootstrapJson.href);
    setStep("done");
    setTimeout(() => router.push(bootstrapJson.href), 1400);
  }

  return (
    <main className="onboard">
      <header className="welcome-topbar">
        <Link href="/welcome" className="welcome-brand" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="welcome-brand-name">← Foley</span>
        </Link>
      </header>

      <div className="onboard-card">
        <ol className="onboard-stepper">
          {(Object.keys(STEP_LABELS) as Step[]).map((s, i) => {
            const order: Step[] = ["auth", "pick", "bootstrap", "done"];
            const cur = order.indexOf(step);
            const me = order.indexOf(s);
            const status = me < cur ? "done" : me === cur ? "active" : "pending";
            return (
              <li key={s} className={`onboard-step status-${status}`}>
                <span className="onboard-step-dot">{status === "done" ? "✓" : i + 1}</span>
                <span className="onboard-step-label">{STEP_LABELS[s]}</span>
              </li>
            );
          })}
        </ol>

        {step === "auth" && (
          <div className="onboard-pane">
            <h1>Connect your GitHub account</h1>
            <p className="onboard-sub">
              Foley reads your repository's structure to draft the first walkthrough,
              then watches `main` for changes and retakes only what's affected.
            </p>

            {keysReady === false ? (
              <div className="onboard-keys-block">
                <p className="onboard-keys-warning">
                  Foley needs Anthropic + ElevenLabs API keys before it can
                  draft any steps. Paste them once and we'll write them to{" "}
                  <code>.env</code> for you.
                </p>
                <KeysPanel onSaved={refreshKeys} />
              </div>
            ) : null}

            <ul className="onboard-checks">
              <li>Foley reads public repos directly — no GitHub auth required</li>
              <li>For private repos, set <code>GITHUB_TOKEN</code> in <code>.env</code></li>
              <li>Foley never pushes</li>
            </ul>
            <button
              className="onboard-btn onboard-btn-primary"
              onClick={() => {
                setError(null);
                setStep("pick");
              }}
              disabled={keysReady === false}
              title={
                keysReady === false
                  ? "Add API keys above first"
                  : undefined
              }
            >
              Continue →
            </button>
            <div className="onboard-fineprint">
              {keysReady === false
                ? "API keys missing — fill in the form above to continue."
                : "Next: paste any GitHub repo URL."}
            </div>
          </div>
        )}

        {step === "pick" && (
          <div className="onboard-pane">
            <h1>Paste a GitHub repo</h1>
            <p className="onboard-sub">
              Any URL works — <code>https://github.com/owner/repo</code>,
              the SSH clone URL, even <code>owner/repo</code> on its own.
              Foley resolves it via the public GitHub API.
            </p>

            <label className="onboard-field">
              <span className="onboard-field-label">Repository URL</span>
              <div className="onboard-devurl-row">
                <input
                  type="text"
                  className="onboard-search"
                  placeholder="https://github.com/lukataylo/Foley"
                  value={repoUrl}
                  onChange={(e) => onRepoUrlChange(e.target.value)}
                  onBlur={() => {
                    if (resolveTimer.current) clearTimeout(resolveTimer.current);
                    if (repoUrl.trim()) void resolveRepo(repoUrl);
                  }}
                  spellCheck={false}
                  autoFocus
                />
                <button
                  type="button"
                  className="brand-edit-btn"
                  onClick={() => {
                    if (resolveTimer.current) clearTimeout(resolveTimer.current);
                    void resolveRepo(repoUrl);
                  }}
                  disabled={!repoUrl.trim() || resolve.state === "resolving"}
                >
                  {resolve.state === "resolving" ? "…" : "Resolve"}
                </button>
              </div>
              {resolve.state === "ok" ? (
                <div className="onboard-resolved-card">
                  <div className="onboard-resolved-head">
                    <span className="onboard-resolved-name">
                      {resolve.repo.full_name}
                      {resolve.repo.private ? (
                        <span className="onboard-repo-pill">private</span>
                      ) : null}
                    </span>
                    <span className="onboard-resolved-meta">
                      {resolve.repo.default_branch}
                      {resolve.repo.language ? ` · ${resolve.repo.language}` : ""}
                      {resolve.repo.stargazers_count > 0
                        ? ` · ★ ${resolve.repo.stargazers_count}`
                        : ""}
                    </span>
                  </div>
                  {resolve.repo.description ? (
                    <p className="onboard-resolved-desc">
                      {resolve.repo.description}
                    </p>
                  ) : null}
                  {resolve.warning ? (
                    <p className="onboard-field-hint onboard-field-err">
                      ⚠ {resolve.warning}
                    </p>
                  ) : null}
                </div>
              ) : resolve.state === "err" ? (
                <span className="onboard-field-hint onboard-field-err">
                  ✗ {resolve.message}
                </span>
              ) : resolve.state === "resolving" ? (
                <span className="onboard-field-hint">Looking up on GitHub…</span>
              ) : (
                <span className="onboard-field-hint">
                  Public repos resolve without auth. Set{" "}
                  <code>GITHUB_TOKEN</code> in <code>.env</code> for private repos
                  + a higher API rate limit.
                </span>
              )}
            </label>

            <label className="onboard-field">
              <span className="onboard-field-label">Dev URL</span>
              <div className="onboard-devurl-row">
                <input
                  type="url"
                  className="onboard-search"
                  placeholder="http://localhost:3001"
                  value={devUrl}
                  onChange={(e) => {
                    setDevUrl(e.target.value);
                    setDevUrlTest(null);
                  }}
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="brand-edit-btn"
                  onClick={testDevUrl}
                  disabled={!devUrl || devUrlTest?.state === "testing"}
                >
                  {devUrlTest?.state === "testing" ? "Checking…" : "Test"}
                </button>
              </div>
              {devUrlTest?.state === "ok" ? (
                <span className="onboard-field-hint onboard-field-ok">
                  ✓ Reachable
                  {devUrlTest.title ? ` · "${devUrlTest.title}"` : ""}
                </span>
              ) : devUrlTest?.state === "err" ? (
                <span className="onboard-field-hint onboard-field-err">
                  ✗ {devUrlTest.message}. Foley can still draft a generic
                  walkthrough, but grounding will be weaker.
                </span>
              ) : (
                <span className="onboard-field-hint">
                  Where the product is running. We&apos;ll fetch its landing
                  page so the first-draft narration matches what users
                  actually see.
                </span>
              )}
            </label>

            <button
              type="button"
              className="onboard-btn onboard-btn-primary"
              onClick={() => {
                if (resolve.state === "ok") void pickRepo(resolve.repo);
              }}
              disabled={resolve.state !== "ok"}
            >
              Continue → Bootstrap walkthrough
            </button>
          </div>
        )}

        {step === "bootstrap" && picked && (
          <div className="onboard-pane onboard-pane-center">
            <BootstrapAnim />
            <h1>Bootstrapping {picked.full_name}</h1>
            <p className="onboard-sub onboard-sub-mono">{bootstrapMsg || "Starting…"}</p>
            <p className="onboard-fineprint">
              Foley is creating a starter walkthrough. You'll be able to retake any
              scene, swap voices, and add transitions in the studio.
            </p>
          </div>
        )}

        {step === "done" && bootstrapHref && (
          <div className="onboard-pane onboard-pane-center">
            <div className="onboard-success-mark">✓</div>
            <h1>Walkthrough ready.</h1>
            <p className="onboard-sub">{bootstrapMsg}</p>
            <Link href={bootstrapHref} className="onboard-btn onboard-btn-primary">
              Open in studio →
            </Link>
          </div>
        )}

        {error && <div className="onboard-error">{error}</div>}
      </div>
    </main>
  );
}

function BootstrapAnim() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 220);
    return () => clearInterval(id);
  }, []);
  const bars = 18;
  return (
    <div className="onboard-bootstrap-anim" aria-hidden="true">
      {Array.from({ length: bars }).map((_, i) => {
        const h = 14 + Math.abs(Math.sin((tick + i * 0.6) * 0.6)) * 36;
        return <span key={i} style={{ height: `${h}px` }} />;
      })}
    </div>
  );
}

