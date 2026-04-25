"use client";

// Click-to-scrub transcript panel. Drops below a <video> and listens to its
// timeupdate events; clicking a cue sets currentTime so the video jumps to
// that step. Highlights the active cue while playing.

import { useEffect, useRef, useState } from "react";

interface Cue {
  step_id: string;
  start_ms: number;
  end_ms: number;
  title: string;
  narration: string;
}

interface Props {
  walkthroughId: string;
  /** Ref to the <video> we're scrubbing. */
  videoRef: React.RefObject<HTMLVideoElement>;
}

function formatTs(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function TranscriptPanel({ walkthroughId, videoRef }: Props) {
  const [cues, setCues] = useState<Cue[] | null>(null);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const cueRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/walkthroughs/${walkthroughId}/transcript`)
      .then((r) => r.json())
      .then((data: { ok: boolean; cues?: Cue[] }) => {
        if (cancelled) return;
        if (data.ok && data.cues) setCues(data.cues);
      })
      .catch(() => {
        // Silent — transcript panel just doesn't render.
      });
    return () => {
      cancelled = true;
    };
  }, [walkthroughId]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !cues) return;
    const onTime = () => {
      const ms = v.currentTime * 1000;
      let idx: number | null = null;
      for (let i = 0; i < cues.length; i++) {
        if (ms >= cues[i].start_ms && ms < cues[i].end_ms) {
          idx = i;
          break;
        }
      }
      // If we're between cues, snap to whichever one most recently ended.
      if (idx === null) {
        for (let i = cues.length - 1; i >= 0; i--) {
          if (ms >= cues[i].start_ms) {
            idx = i;
            break;
          }
        }
      }
      setActiveIdx(idx);
    };
    onTime();
    v.addEventListener("timeupdate", onTime);
    return () => v.removeEventListener("timeupdate", onTime);
  }, [cues, videoRef]);

  // Scroll the active row into view when it changes.
  useEffect(() => {
    if (activeIdx == null) return;
    const node = cueRefs.current[activeIdx];
    node?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  if (!cues || cues.length === 0) return null;

  return (
    <div className="transcript-panel" aria-label="Transcript">
      <div className="transcript-panel-head">
        <span className="transcript-panel-label">Transcript</span>
        <span className="transcript-panel-hint">click a step to jump</span>
      </div>
      <ol className="transcript-list">
        {cues.map((cue, i) => (
          <li
            key={cue.step_id}
            ref={(el) => {
              cueRefs.current[i] = el;
            }}
            className={`transcript-row ${i === activeIdx ? "is-active" : ""}`}
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              v.currentTime = cue.start_ms / 1000;
              if (v.paused) void v.play().catch(() => {});
            }}
          >
            <span className="transcript-ts">{formatTs(cue.start_ms)}</span>
            <span className="transcript-body">
              <span className="transcript-title">{cue.title}</span>
              <span className="transcript-narration">{cue.narration}</span>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
