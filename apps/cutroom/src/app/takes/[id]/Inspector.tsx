"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Take } from "@/lib/types";
import type { TrackEntry } from "./EditorShell";

interface Props {
  take: Take;
  step: TrackEntry | null;
  stepIndex: number;
  totalSteps: number;
  onPrev: () => void;
  onNext: () => void;
  takeId: string;
  onDirectorActionStart: () => void;
  onDirectorActionEnd: () => void;
}

export function Inspector({
  take,
  step,
  stepIndex,
  totalSteps,
  onPrev,
  onNext,
  takeId,
  onDirectorActionStart,
  onDirectorActionEnd,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [draftNarration, setDraftNarration] = useState<string | null>(null);

  if (!step) {
    return (
      <aside className="inspector">
        <p style={{ color: "var(--muted)" }}>Pick a step to inspect.</p>
      </aside>
    );
  }

  async function call(action: "retake" | "renarrate", body?: Record<string, unknown>) {
    if (!step) return;
    setBusy(action);
    onDirectorActionStart();
    try {
      await fetch(`/api/director/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ take_id: takeId, step_id: step.id, ...body }),
      });
      router.refresh();
    } finally {
      setBusy(null);
      onDirectorActionEnd();
    }
  }

  const status = step.diff_status;

  return (
    <aside className="inspector">
      {take.director_note ? (
        <div className="director-note">
          <div className="label">Director's note</div>
          <div className="body">{take.director_note}</div>
        </div>
      ) : null}

      <div className="step-pill">
        Step {String(stepIndex + 1).padStart(2, "0")} / {String(totalSteps).padStart(2, "0")}
      </div>
      <h3 className="step-title-big" style={{ margin: 0 }}>{step.title}</h3>
      <div className={`step-status-pill pill pill-${status}`}>{status}</div>

      {step.diff_reason ? (
        <p style={{ color: "var(--muted)", margin: "8px 0 16px", fontSize: 12.5, lineHeight: 1.55 }}>
          {step.diff_reason}
        </p>
      ) : null}

      <div className="group-label" style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--muted)", marginBottom: 8 }}>
        Narration
      </div>

      {draftNarration === null ? (
        <div className="narration-box">{step.narration}</div>
      ) : (
        <textarea
          value={draftNarration}
          onChange={(e) => setDraftNarration(e.target.value)}
          rows={4}
          style={{
            width: "100%",
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            padding: "10px 12px",
            font: "inherit",
            fontSize: 13,
            color: "var(--fg)",
            resize: "vertical",
            marginBottom: 14,
          }}
        />
      )}

      <div className="step-actions">
        <button
          className="btn-secondary"
          onClick={() => call("retake")}
          disabled={busy !== null}
          type="button"
        >
          {busy === "retake" ? "Retaking…" : "▶  Retake step"}
        </button>
        <button
          className="btn-secondary"
          onClick={() => call("renarrate")}
          disabled={busy !== null}
          type="button"
        >
          {busy === "renarrate" ? "Re-narrating…" : "♪  Re-narrate"}
        </button>
        {draftNarration === null ? (
          <button
            className="btn-secondary"
            onClick={() => setDraftNarration(step.narration)}
            type="button"
          >
            ✎  Edit narration text
          </button>
        ) : (
          <>
            <button
              className="btn-primary"
              onClick={async () => {
                if (!step) return;
                setBusy("save");
                try {
                  await fetch(`/api/director/renarrate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      take_id: takeId,
                      step_id: step.id,
                      narration: draftNarration,
                    }),
                  });
                  setDraftNarration(null);
                  router.refresh();
                } finally {
                  setBusy(null);
                }
              }}
              disabled={busy !== null}
              type="button"
            >
              {busy === "save" ? "Saving…" : "Save & re-narrate"}
            </button>
            <button
              className="btn-secondary"
              onClick={() => setDraftNarration(null)}
              type="button"
            >
              Cancel
            </button>
          </>
        )}
      </div>

      <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <button className="btn-secondary" type="button" onClick={onPrev} disabled={stepIndex <= 0}>← Prev</button>
        <span style={{ fontSize: 12, color: "var(--muted)", fontFamily: "ui-monospace, monospace" }}>
          {step.duration_ms / 1000}s
          {step.segment_sha256 ? <> · {step.segment_sha256.slice(0, 8)}…</> : null}
        </span>
        <button className="btn-secondary" type="button" onClick={onNext} disabled={stepIndex >= totalSteps - 1}>Next →</button>
      </div>
    </aside>
  );
}
