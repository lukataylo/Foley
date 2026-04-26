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
  /** Step-level capture failure from the last ingest run, if any. */
  captureError?: string | null;
  /** Per-action warnings from the last ingest run (selector miss, etc.). */
  captureWarnings?: Array<{ index: number; kind: string; message: string }>;
}

interface Props {
  walkthroughId: string;
  initialDisplayName: string;
  devUrl: string;
  initialSteps: ClientStep[];
  /** Set when the server-side YAML load found a problem we couldn't recover
   *  from cleanly. The editor stays visible with a banner. */
  loadError?: string | null;
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

export function EditorClient({
  walkthroughId,
  initialDisplayName,
  devUrl,
  initialSteps,
  loadError = null,
}: Props) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [titleStatus, setTitleStatus] = useState<SaveStatus>("idle");
  const [steps, setSteps] = useState<ClientStep[]>(initialSteps);
  const [stepStatus, setStepStatus] = useState<Record<string, SaveStatus>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const [render, setRender] = useState<RenderPoll | null>(null);
  const [skipNarration, setSkipNarration] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [addStepError, setAddStepError] = useState<string | null>(null);
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
        // Prefer the friendly `message` (412 missing key, 422 yaml invalid)
        // over the raw `error` code.
        setRenderError(data?.message ?? data?.error ?? `HTTP ${r.status}`);
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

  const retakeStep = useCallback(
    async (stepId: string) => {
      setBusy(stepId);
      try {
        const r = await fetch(
          `/api/walkthroughs/${walkthroughId}/steps/${stepId}/retake`,
          { method: "POST" },
        );
        const data = await r.json();
        if (!r.ok || !data.ok) {
          alert(data?.message ?? `Retake failed (HTTP ${r.status})`);
          return;
        }
        // Cache-bust the thumbnail and pull fresh meta (action_warnings,
        // error) from the server.
        setSteps((prev) =>
          prev.map((s) =>
            s.id === stepId
              ? {
                  ...s,
                  screenshotUrl: `${s.screenshotUrl.split("?")[0]}?v=${Date.now()}`,
                }
              : s,
          ),
        );
        router.refresh();
      } catch (err) {
        alert(err instanceof Error ? err.message : "Retake errored.");
      } finally {
        setBusy(null);
      }
    },
    [walkthroughId, router],
  );

  const persistOrder = useCallback(
    async (orderedIds: string[]) => {
      try {
        const r = await fetch(`/api/walkthroughs/${walkthroughId}/steps/reorder`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: orderedIds }),
        });
        if (!r.ok) {
          const data = await r.json().catch(() => ({}));
          console.error("reorder failed", data);
          // Roll the UI back to whatever the server thinks is canonical.
          router.refresh();
        }
      } catch (err) {
        console.error("reorder network error", err);
        router.refresh();
      }
    },
    [walkthroughId, router],
  );

  const handleDrop = useCallback(
    (overId: string) => {
      if (!dragId || dragId === overId) {
        setDragId(null);
        setDragOverId(null);
        return;
      }
      setSteps((prev) => {
        const fromIdx = prev.findIndex((s) => s.id === dragId);
        const toIdx = prev.findIndex((s) => s.id === overId);
        if (fromIdx < 0 || toIdx < 0) return prev;
        const next = prev.slice();
        const [moved] = next.splice(fromIdx, 1);
        next.splice(toIdx, 0, moved);
        // Fire-and-forget the server write; we already moved the UI optimistically.
        void persistOrder(next.map((s) => s.id));
        return next;
      });
      setDragId(null);
      setDragOverId(null);
    },
    [dragId, persistOrder],
  );

  const addStep = useCallback(async () => {
    setAddStepError(null);
    setBusy("__add__");
    try {
      const r = await fetch(`/api/walkthroughs/${walkthroughId}/steps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        setAddStepError(data?.message ?? `HTTP ${r.status}`);
        return;
      }
      // Server-side render of the editor reads meta.json + computed step
      // shape; easier to refetch than to mirror the projection client-side.
      router.refresh();
    } catch (err) {
      setAddStepError(err instanceof Error ? err.message : "network error");
    } finally {
      setBusy(null);
    }
  }, [walkthroughId, router]);

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
      {loadError ? (
        <div className="editor-load-error" role="alert">
          <strong>walkthrough.yaml has a problem:</strong>{" "}
          <span>{loadError}</span>{" "}
          <span className="editor-load-error-hint">
            Fix it in your editor and reload — the steps below may be incomplete.
          </span>
        </div>
      ) : null}
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
            No steps yet. Click <strong>+ Add step</strong> below, or run{" "}
            <code>director propose-steps {walkthroughId}</code> to draft from
            the dev URL.
          </div>
        ) : (
          steps.map((s, i) => (
            <StepCard
              key={s.id}
              index={i}
              step={s}
              status={stepStatus[s.id] ?? "idle"}
              busy={busy === s.id}
              isDragging={dragId === s.id}
              isDragTarget={dragOverId === s.id && dragId !== null && dragId !== s.id}
              onDragStart={() => setDragId(s.id)}
              onDragEnd={() => {
                setDragId(null);
                setDragOverId(null);
              }}
              onDragEnter={() => {
                if (dragId && dragId !== s.id) setDragOverId(s.id);
              }}
              onDrop={() => handleDrop(s.id)}
              onChange={(patch) => updateStepLocal(s.id, patch)}
              onCommit={(patch) => persistStep(s.id, patch)}
              onDelete={() => deleteStep(s.id)}
              onRetake={() => retakeStep(s.id)}
            />
          ))
        )}

        <div className="editor-add-step-row">
          <button
            type="button"
            className="editor-add-step"
            disabled={!!busy}
            onClick={addStep}
          >
            + Add step
          </button>
          {addStepError ? (
            <span className="editor-add-step-error">{addStepError}</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

interface StepCardProps {
  index: number;
  step: ClientStep;
  status: SaveStatus;
  busy: boolean;
  isDragging: boolean;
  isDragTarget: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onChange: (patch: Partial<ClientStep>) => void;
  onCommit: (patch: { title?: string; narration?: string; duration_ms?: number }) => void;
  onDelete: () => void;
  onRetake: () => void;
}

function StepCard({
  index,
  step,
  status,
  busy,
  isDragging,
  isDragTarget,
  onDragStart,
  onDragEnd,
  onDragEnter,
  onDrop,
  onChange,
  onCommit,
  onDelete,
  onRetake,
}: StepCardProps) {
  const hasCaptureError = !!step.captureError;
  const hasCaptureWarnings = (step.captureWarnings?.length ?? 0) > 0;
  return (
    <article
      className={`editor-step ${busy ? "is-busy" : ""} ${
        hasCaptureError ? "has-capture-error" : hasCaptureWarnings ? "has-capture-warning" : ""
      } ${isDragging ? "is-dragging" : ""} ${isDragTarget ? "is-drag-target" : ""}`}
      onDragOver={(e) => {
        if (isDragging || isDragTarget) {
          e.preventDefault();
          // dropEffect must be set every onDragOver for the drop to fire.
          e.dataTransfer.dropEffect = "move";
        }
      }}
      onDragEnter={onDragEnter}
      onDrop={(e) => {
        e.preventDefault();
        onDrop();
      }}
    >
      <button
        type="button"
        className="step-drag-handle"
        title="Drag to reorder"
        draggable
        onDragStart={(e) => {
          e.dataTransfer.effectAllowed = "move";
          // Required for Firefox to actually start the drag.
          e.dataTransfer.setData("text/plain", step.id);
          onDragStart();
        }}
        onDragEnd={onDragEnd}
        aria-label={`Reorder step ${index + 1}`}
      >
        ⋮⋮
      </button>
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
        {hasCaptureError ? <div className="step-thumb-dot is-error" title={step.captureError ?? ""} /> : null}
        {!hasCaptureError && hasCaptureWarnings ? (
          <div
            className="step-thumb-dot is-warning"
            title={`${step.captureWarnings?.length} action(s) failed during the last capture — Retake to fix`}
          />
        ) : null}
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

        {hasCaptureError ? (
          <div className="step-capture-banner is-error">
            ⚠ Last capture failed: {step.captureError}
          </div>
        ) : hasCaptureWarnings ? (
          <div className="step-capture-banner is-warning">
            ⚠ {step.captureWarnings!.length} action(s) failed:{" "}
            {step.captureWarnings!.map((w) => `${w.kind}${w.message ? ` (${w.message.slice(0, 60)})` : ""}`).join(", ")}
          </div>
        ) : null}

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
            className="step-retake"
            onClick={onRetake}
            disabled={busy}
            title="Re-run this step's Playwright capture and narration"
          >
            {busy ? "Retaking…" : "Retake"}
          </button>
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

      {error ? (
        <div className="render-error">
          {error}
          {/* The 412 missing-key path always mentions /welcome#keys in its
              message — turn that bare URL into a real link so the user can
              click it instead of hunting through the topbar. */}
          {error.includes("/welcome#keys") ? (
            <>
              {" "}
              <a href="/welcome#keys">→ Open keys settings</a>
            </>
          ) : null}
        </div>
      ) : null}
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
