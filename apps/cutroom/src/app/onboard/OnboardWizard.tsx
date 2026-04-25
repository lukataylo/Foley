"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

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
  auth: "Connect GitHub",
  pick: "Pick a repository",
  bootstrap: "Bootstrap walkthrough",
  done: "Open in studio",
};

export function OnboardWizard() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("auth");
  const [repos, setRepos] = useState<Repo[]>([]);
  const [source, setSource] = useState<"github" | "mock" | null>(null);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Repo | null>(null);
  const [devUrl, setDevUrl] = useState("http://localhost:3001");
  const [bootstrapMsg, setBootstrapMsg] = useState("");
  const [bootstrapHref, setBootstrapHref] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const filteredRepos = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return repos;
    return repos.filter(
      (r) =>
        r.full_name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q),
    );
  }, [repos, search]);

  async function continueWithGithub() {
    setError(null);
    setLoadingRepos(true);
    setStep("pick");
    try {
      const res = await fetch("/api/github/repos", { cache: "no-store" });
      const json = await res.json();
      setRepos(json.repos ?? []);
      setSource(json.source ?? "mock");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to fetch repos");
    } finally {
      setLoadingRepos(false);
    }
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
            <ul className="onboard-checks">
              <li>Read access to repo metadata, files, and commits</li>
              <li>No write access — Foley never pushes</li>
              <li>Disconnect any time from the studio settings</li>
            </ul>
            <button className="onboard-btn onboard-btn-primary" onClick={continueWithGithub}>
              <GithubGlyph /> Continue with GitHub
            </button>
            <div className="onboard-fineprint">
              {process.env.NEXT_PUBLIC_GH_LIVE === "1"
                ? "Using your live GitHub account."
                : "No PAT configured — we'll show example repos so you can try the flow."}
            </div>
          </div>
        )}

        {step === "pick" && (
          <div className="onboard-pane">
            <h1>Choose a repository</h1>
            <p className="onboard-sub">
              {source === "github"
                ? "Showing your most recently active repos."
                : "Demo mode — these are example repositories. Add a GITHUB_PAT env var to see your own."}
            </p>
            <label className="onboard-field">
              <span className="onboard-field-label">Dev URL</span>
              <input
                type="url"
                className="onboard-search"
                placeholder="http://localhost:3001"
                value={devUrl}
                onChange={(e) => setDevUrl(e.target.value)}
                spellCheck={false}
              />
              <span className="onboard-field-hint">
                Where the product is running. We&apos;ll fetch its landing page so the
                first-draft narration matches what users actually see.
              </span>
            </label>
            <input
              type="text"
              className="onboard-search"
              placeholder="Search repos…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {loadingRepos ? (
              <div className="onboard-loading">Loading your repositories…</div>
            ) : (
              <ul className="onboard-repo-list">
                {filteredRepos.map((r) => (
                  <li key={r.id}>
                    <button className="onboard-repo-row" onClick={() => pickRepo(r)}>
                      <div className="onboard-repo-row-main">
                        <span className="onboard-repo-name">
                          {r.full_name}
                          {r.private ? <span className="onboard-repo-pill">private</span> : null}
                        </span>
                        <span className="onboard-repo-desc">{r.description ?? "—"}</span>
                      </div>
                      <div className="onboard-repo-row-meta">
                        {r.language ? (
                          <span className="onboard-repo-lang">
                            <span className="onboard-repo-lang-dot" data-lang={r.language} />
                            {r.language}
                          </span>
                        ) : null}
                        <span className="onboard-repo-stars">★ {r.stargazers_count}</span>
                        <span className="onboard-repo-time">{relTime(r.pushed_at)}</span>
                      </div>
                    </button>
                  </li>
                ))}
                {filteredRepos.length === 0 ? (
                  <li className="onboard-empty">No repos match "{search}".</li>
                ) : null}
              </ul>
            )}
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

function GithubGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.4 7.4 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8 8 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const seconds = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
