"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export interface ClientAction {
  kind: string;
  selector: string | null;
  url: string | null;
  value: string | null;
  ms: number | null;
}

export interface ClientStep {
  id: string;
  title: string;
  narration: string;
  duration_ms: number;
  url: string | null;
  interaction: { kind: string; selector: string | null; value: string | null } | null;
  actions: ClientAction[];
  screenshotUrl: string;
}

interface Props {
  walkthroughId: string;
  initialDisplayName: string;
  devUrl: string;
  initialSteps: ClientStep[];
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface RenderStatus {
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at?: string;
  total_steps: number;
  step_ids: string[];
  current_phase: "ingest" | "master" | "done";
  skip_narration: boolean;
  error?: string;
}

interface RenderPoll {
  status: RenderStatus | null;
  completed_clips?: number;
  has_master?: boolean;
  master_url?: string | null;
  log_tail?: string | null;
}

export function EditorClient({ walkthroughId, initialDisplayName, devUrl, initialSteps }: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [titleStatus, setTitleStatus] = useState<SaveStatus>("idle");
  const [steps, setSteps] = useState<ClientStep[]>(initialSteps);
  const [stepStatus, setStepStatus] = useState<Record<string, SaveStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const [render, setRender] = useState<RenderPoll | null>(null);
  const [skipNarration, setSkipNarration] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mirror of the server's view of each step, keyed by step id. Updated only
  // after a successful save. Used to skip no-op PATCHes on blur.
  const persistedRef = useRef<Map<string, { title: string; narration: string; duration_ms: number }>>(
    new Map(
      initialSteps.map((s) => [
        s.id,
        { title: s.title, narration: s.narration, duration_ms: s.duration_ms },
      ]),
    ),
  );

  const totalSeconds = steps.reduce((n, s) => n + s.duration_ms, 0) / 1000;

  const fetchRenderStatus = useCallback(async (): Promise<RenderPoll | null> => {
    try {
      const r = await fetch(`/api/walkthroughs/${walkthroughId}/render`, { cache: "no-store" });
      if (!r.ok) return null;
      const data = (await r.json()) as { ok: boolean } & RenderPoll;
      if (!data.ok) return null;
      return data;
    } catch {
      return null;
    }
  }, [walkthroughId]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  const schedulePoll = useCallback(
    (delay = 2000) => {
      stopPolling();
      pollTimer.current = setTimeout(async () => {
        const next = await fetchRenderStatus();
        if (next) {
          setRender(next);
          if (next.status?.status === "running") {
            schedulePoll(2000);
          }
        }
      }, delay);
    },
    [fetchRenderStatus, stopPolling],
  );

  // Surface any in-flight render on mount.
  useEffect(() => {
    let cancelled = false;
    fetchRenderStatus().then((s) => {
      if (cancelled) return;
      if (s) {
        setRender(s);
        if (s.status?.status === "running") schedulePoll(2000);
      }
    });
    return () => {
      cancelled = true;
      stopPolling();
    };
  }, [fetchRenderStatus, schedulePoll, stopPolling]);

  const startRender = useCallback(async () => {
    setRenderError(null);
    try {
      const r = await fetch(`/api/walkthroughs/${walkthroughId}/render`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skip_narration: skipNarration }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setRenderError(data?.error ?? `HTTP ${r.status}`);
        return;
      }
      setRender({ status: data.status });
      schedulePoll(2000);
    } catch (err) {
      setRenderError((err as Error)?.message ?? "network error");
    }
  }, [walkthroughId, skipNarration, schedulePoll]);

  const saveTitle = useCallback(async () => {
    const value = displayName.trim();
    if (!value || value === initialDisplayName) return;
    setTitleStatus("saving");
    try {
      const r = await fetch(`/api/walkthroughs/${walkthroughId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ display_name: value }),
      });
      if (!r.ok) throw new Error(await r.text());
      setTitleStatus("saved");
      router.refresh();
      setTimeout(() => setTitleStatus("idle"), 1500);
    } catch (err) {
      console.error(err);
      setTitleStatus("error");
    }
  }, [displayName, initialDisplayName, walkthroughId, router]);

  const updateStepLocal = useCallback((id: string, patch: Partial<ClientStep>) => {
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }, []);

  const persistStep = useCallback(
    async (id: string, patch: { title?: string; narration?: string; duration_ms?: number }) => {
      // Skip the round trip if nothing actually changed since the last save.
      const last = persistedRef.current.get(id);
      const realPatch: typeof patch = {};
      if (patch.title !== undefined && patch.title !== last?.title) realPatch.title = patch.title;
      if (patch.narration !== undefined && patch.narration !== last?.narration)
        realPatch.narration = patch.narration;
      if (patch.duration_ms !== undefined && patch.duration_ms !== last?.duration_ms)
        realPatch.duration_ms = patch.duration_ms;
      if (Object.keys(realPatch).length === 0) return;

      setStepStatus((s) => ({ ...s, [id]: "saving" }));
      try {
        const r = await fetch(
          `/api/walkthroughs/${walkthroughId}/steps/${encodeURIComponent(id)}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(realPatch),
          },
        );
        if (!r.ok) throw new Error(await r.text());
        if (last) {
          persistedRef.current.set(id, { ...last, ...realPatch });
        }
        setStepStatus((s) => ({ ...s, [id]: "saved" }));
        setTimeout(() => setStepStatus((s) => ({ ...s, [id]: "idle" })), 1200);
      } catch (err) {
        console.error(err);
        setStepStatus((s) => ({ ...s, [id]: "error" }));
      }
    },
    [walkthroughId],
  );

  const deleteStep = useCallback(
    async (id: string) => {
      if (!confirm("Delete this step? This removes it from the walkthrough YAML.")) return;
      setBusy(id);
      try {
        const r = await fetch(
          `/api/walkthroughs/${walkthroughId}/steps/${encodeURIComponent(id)}`,
          { method: "DELETE" },
        );
        if (!r.ok) throw new Error(await r.text());
        setSteps((prev) => prev.filter((s) => s.id !== id));
        persistedRef.current.delete(id);
        router.refresh();
      } catch (err) {
        console.error(err);
        alert("Failed to delete step.");
      } finally {
        setBusy(null);
      }
    },
    [walkthroughId, router],
  );

  return (
    <div className="editor-grid">
      {/* Title + summary card */}
      <section className="editor-title-card">
        <p className="detail-eyebrow">Walkthrough name</p>
        <input
          className="editor-title-input"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          onBlur={saveTitle}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          placeholder="Name this walkthrough"
        />
        <div className="editor-title-meta">
          <span>{steps.length} steps</span>
          <span aria-hidden>·</span>
          <span>{totalSeconds.toFixed(1)}s total</span>
          {devUrl ? (
            <>
              <span aria-hidden>·</span>
              <span className="mono">{devUrl}</span>
            </>
          ) : null}
          <span className={`editor-save-pill ${titleStatus}`}>
            {titleStatus === "saving"
              ? "Saving…"
              : titleStatus === "saved"
                ? "Saved"
                : titleStatus === "error"
                  ? "Save failed"
                  : "Auto-saves on blur"}
          </span>
        </div>
      </section>

      <RenderPanel
        render={render}
        skipNarration={skipNarration}
        setSkipNarration={setSkipNarration}
        onRender={startRender}
        error={renderError}
        totalSteps={steps.length}
        walkthroughId={walkthroughId}
      />

      {/* Steps list */}
      <section className="editor-steps">
        {steps.length === 0 ? (
          <div className="editor-empty">
            No steps in this walkthrough yet. Re-record from the Foley Recorder
            extension to populate it.
          </div>
        ) : (
          steps.map((s, i) => (
            <StepCard
              key={s.id}
              index={i}
              step={s}
              status={stepStatus[s.id] ?? "idle"}
              busy={busy === s.id}
              onChange={(patch) => updateStepLocal(s.id, patch)}
              onCommit={(patch) => persistStep(s.id, patch)}
              onDelete={() => deleteStep(s.id)}
            />
          ))
        )}
      </section>
    </div>
  );
}

interface StepCardProps {
  index: number;
  step: ClientStep;
  status: SaveStatus;
  busy: boolean;
  onChange: (patch: Partial<ClientStep>) => void;
  onCommit: (patch: { title?: string; narration?: string; duration_ms?: number }) => void;
  onDelete: () => void;
}

function StepCard({ index, step, status, busy, onChange, onCommit, onDelete }: StepCardProps) {
  return (
    <article className={`editor-step ${busy ? "is-busy" : ""}`}>
      <aside className="step-thumb">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={step.screenshotUrl}
          alt={`Screenshot for step ${index + 1}`}
          loading="lazy"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="step-thumb-num">{String(index + 1).padStart(2, "0")}</div>
      </aside>

      <div className="step-body">
        <div className="step-row">
          <input
            className="step-title-input"
            value={step.title}
            onChange={(e) => onChange({ title: e.target.value })}
            onBlur={(e) => onCommit({ title: e.target.value.trim() })}
            placeholder="Step title"
          />
          <span className={`editor-save-pill compact ${status}`}>
            {status === "saving"
              ? "Saving…"
              : status === "saved"
                ? "Saved"
                : status === "error"
                  ? "Failed"
                  : ""}
          </span>
        </div>

        <ActionBreakdown step={step} />

        <details className="step-narration">
          <summary>Narration</summary>
          <textarea
            value={step.narration}
            onChange={(e) => onChange({ narration: e.target.value })}
            onBlur={(e) => onCommit({ narration: e.target.value.trim() })}
            rows={3}
            placeholder="What this step says (used by the narrator)"
          />
        </details>

        <div className="step-controls">
          <label className="step-duration">
            <span>Duration</span>
            <input
              type="number"
              min={500}
              max={20000}
              step={100}
              value={step.duration_ms}
              onChange={(e) => onChange({ duration_ms: Number(e.target.value) })}
              onBlur={(e) =>
                onCommit({ duration_ms: clampDuration(Number(e.target.value)) })
              }
            />
            <span className="suffix">ms</span>
          </label>
          <button
            type="button"
            className="step-delete"
            onClick={onDelete}
            disabled={busy}
          >
            Delete step
          </button>
        </div>
      </div>
    </article>
  );
}

interface RenderPanelProps {
  render: RenderPoll | null;
  skipNarration: boolean;
  setSkipNarration: (v: boolean) => void;
  onRender: () => void;
  error: string | null;
  totalSteps: number;
  walkthroughId: string;
}

function RenderPanel({
  render,
  skipNarration,
  setSkipNarration,
  onRender,
  error,
  totalSteps,
  walkthroughId,
}: RenderPanelProps) {
  const status = render?.status;
  const isRunning = status?.status === "running";
  const isCompleted = status?.status === "completed" && render?.has_master;
  const isFailed = status?.status === "failed";

  const completedClips = render?.completed_clips ?? 0;
  const total = status?.total_steps ?? totalSteps;
  const percent = total > 0 ? Math.min(100, Math.round((completedClips / total) * 100)) : 0;

  let phaseLabel = "";
  if (isRunning) {
    phaseLabel =
      status?.current_phase === "master"
        ? "Composing master.mp4…"
        : `Capturing step ${Math.min(completedClips + 1, total)} of ${total}…`;
  } else if (isCompleted) {
    phaseLabel = "Render complete";
  } else if (isFailed) {
    phaseLabel = "Render failed";
  } else if (status) {
    phaseLabel = status.current_phase;
  }

  // Bust the video element's cache when a new render finishes.
  const masterSrc =
    isCompleted && render?.master_url
      ? `${render.master_url}?t=${encodeURIComponent(status?.finished_at ?? "")}`
      : null;

  return (
    <section className="render-panel">
      <div className="render-panel-head">
        <div>
          <p className="detail-eyebrow">Video</p>
          <h2 className="render-panel-title">
            {isCompleted ? "Master video" : "Render video"}
          </h2>
          <p className="render-panel-sub">
            {isCompleted
              ? "Re-render after editing steps to refresh the master."
              : "Replays each step against the recorded site, narrates, and assembles the master."}
          </p>
        </div>
        <div className="render-panel-actions">
          <label className="render-toggle">
            <input
              type="checkbox"
              checked={skipNarration}
              onChange={(e) => setSkipNarration(e.target.checked)}
              disabled={isRunning}
            />
            <span>Skip narration</span>
          </label>
          <button
            type="button"
            className="btn-primary"
            onClick={onRender}
            disabled={isRunning || totalSteps === 0}
          >
            {isRunning
              ? "Rendering…"
              : isCompleted
                ? "Re-render"
                : "Render video"}
          </button>
        </div>
      </div>

      {isRunning ? (
        <div className="render-progress">
          <div className="render-progress-bar">
            <div className="render-progress-fill" style={{ width: `${percent}%` }} />
          </div>
          <div className="render-progress-meta">
            <span>{phaseLabel}</span>
            <span>
              {completedClips}/{total} clips
            </span>
          </div>
        </div>
      ) : null}

      {error ? <div className="render-error">Couldn&apos;t start render: {error}</div> : null}
      {isFailed ? (
        <details className="render-error" open>
          <summary>Render failed — last log lines</summary>
          <pre>{status?.error || render?.log_tail || "No log available."}</pre>
        </details>
      ) : null}

      {masterSrc ? (
        <div className="render-player">
          <video controls preload="metadata" src={masterSrc} />
          <div className="render-player-meta">
            <a href={masterSrc} download={`${walkthroughId}.mp4`} className="btn-secondary">
              Download mp4
            </a>
            <a href={`/walkthroughs/${walkthroughId}`} className="btn-secondary">
              Open walkthrough page
            </a>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function clampDuration(n: number): number {
  if (!Number.isFinite(n) || n < 500) return 500;
  if (n > 20000) return 20000;
  return Math.round(n / 100) * 100;
}

function ActionBreakdown({ step }: { step: ClientStep }) {
  return (
    <div className="step-actions">
      {step.url ? (
        <div className="step-action">
          <span className="kind kind-goto">goto</span>
          <span className="mono action-value">{step.url}</span>
        </div>
      ) : null}
      {step.interaction ? (
        <div className="step-action">
          <span className={`kind kind-${step.interaction.kind}`}>
            {step.interaction.kind}
          </span>
          {step.interaction.selector ? (
            <span className="mono action-value">{step.interaction.selector}</span>
          ) : null}
          {step.interaction.value ? (
            <span className="action-extra">
              <span className="muted">value</span>
              <span className="mono">{step.interaction.value}</span>
            </span>
          ) : null}
        </div>
      ) : null}
      <details className="step-action-raw">
        <summary>All actions ({step.actions.length})</summary>
        <ul>
          {step.actions.map((a, i) => (
            <li key={i}>
              <span className={`kind kind-${a.kind}`}>{a.kind}</span>
              {a.selector ? <span className="mono">{a.selector}</span> : null}
              {a.url ? <span className="mono">{a.url}</span> : null}
              {a.value ? (
                <span>
                  <span className="muted">=</span> <span className="mono">{a.value}</span>
                </span>
              ) : null}
              {a.ms ? <span className="muted">{a.ms}ms</span> : null}
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
