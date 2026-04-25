"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TrackEntry } from "./EditorShell";

interface Props {
  tracks: TrackEntry[];
  stepStartsMs: number[];
  totalDuration: number;
  currentTime: number;
  isPlaying: boolean;
  zoom: number;          // px per second
  speed: number;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  onSeek: (s: number) => void;
  onTogglePlay: () => void;
  onJump: (dir: -1 | 1) => void;
  onZoom: (n: number) => void;
}

export function Timeline(p: Props) {
  const lanesRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const totalWidth = p.totalDuration * p.zoom;

  // Ruler ticks every 5 seconds.
  const ticks = useMemo(() => {
    const arr: number[] = [];
    const step = 5;
    for (let s = 0; s <= p.totalDuration + 0.001; s += step) arr.push(s);
    return arr;
  }, [p.totalDuration]);

  // Convert a global clientX into a timeline second, clamped.
  // The track grid puts a 92px label column before the lanes, so subtract it.
  const LABEL_GUTTER = 92;
  function xToSeconds(clientX: number): number {
    if (!lanesRef.current) return 0;
    const rect = lanesRef.current.getBoundingClientRect();
    const x = clientX - rect.left + lanesRef.current.scrollLeft - LABEL_GUTTER;
    return Math.max(0, Math.min(p.totalDuration, x / p.zoom));
  }

  function startScrub(e: React.PointerEvent) {
    // Don't initiate scrub when the user clicked an interactive child (a step
    // block button). Those have their own onClick handlers.
    if ((e.target as HTMLElement).closest(".lane-block")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setScrubbing(true);
    p.onSeek(xToSeconds(e.clientX));
  }

  // Track pointer-move globally while scrubbing. Using window listeners keeps
  // the scrub alive even if the cursor leaves the lane.
  useEffect(() => {
    if (!scrubbing) return;
    function onMove(e: PointerEvent) {
      p.onSeek(xToSeconds(e.clientX));
    }
    function onUp() {
      setScrubbing(false);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [scrubbing, p.zoom, p.totalDuration]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard scrub: ←/→ for ±1s, shift+←/→ for ±5s, space to toggle play.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        p.onSeek(Math.max(0, p.currentTime - (e.shiftKey ? 5 : 1)));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        p.onSeek(Math.min(p.totalDuration, p.currentTime + (e.shiftKey ? 5 : 1)));
      } else if (e.key === " ") {
        e.preventDefault();
        p.onTogglePlay();
      } else if (e.key === "j" || e.key === "J") {
        p.onJump(-1);
      } else if (e.key === "l" || e.key === "L") {
        p.onJump(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.currentTime, p.totalDuration]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll the timeline to keep the playhead in view.
  useEffect(() => {
    const el = lanesRef.current;
    if (!el) return;
    const x = p.currentTime * p.zoom;
    const left = el.scrollLeft;
    const right = left + el.clientWidth;
    if (x < left + 60) el.scrollTo({ left: Math.max(0, x - 60), behavior: "smooth" });
    else if (x > right - 60) el.scrollTo({ left: x - el.clientWidth + 60, behavior: "smooth" });
  }, [p.currentTime, p.zoom]);

  return (
    <section className="timeline">
      <div className="timeline-bar">
        <div className="controls">
          <button className="ctrl-icon" onClick={() => p.onJump(-1)} title="Previous step (J)">⏮</button>
          <button className="play" onClick={p.onTogglePlay} title="Play / pause (Space)">
            {p.isPlaying ? "❚❚" : "▶"}
          </button>
          <button className="ctrl-icon" onClick={() => p.onJump(1)} title="Next step (L)">⏭</button>
          <span className="speed">{p.speed.toFixed(1)}x</span>
          <span className="timestamp">
            {fmt(p.currentTime)} / {fmt(p.totalDuration)}
          </span>
        </div>
        <div className="zoom">
          <button className="ctrl-icon" onClick={() => p.onZoom(p.zoom - 8)} title="Zoom out">－</button>
          <input
            type="range"
            min={12} max={120} step={2} value={p.zoom}
            onChange={(e) => p.onZoom(Number(e.target.value))}
            style={{ width: 120 }}
            aria-label="zoom"
          />
          <button className="ctrl-icon" onClick={() => p.onZoom(p.zoom + 8)} title="Zoom in">＋</button>
        </div>
      </div>

      <div
        className={`timeline-tracks ${scrubbing ? "scrubbing" : ""}`}
        ref={lanesRef}
      >
        <div
          className="timeline-scaler"
          style={{ width: totalWidth + 92, /* label gutter */ minWidth: "100%" }}
        >
          {/* ruler — clicking/dragging here scrubs */}
          <div
            className="ruler"
            style={{ marginLeft: 92, position: "relative", cursor: "ew-resize" }}
            onPointerDown={startScrub}
          >
            {ticks.map((t) => (
              <div key={t} className="tick" style={{ left: t * p.zoom }}>
                <span className="lbl">{fmt(t)}</span>
              </div>
            ))}
          </div>

          <div className="tracks" onPointerDown={startScrub}>
            {/* Steps lane */}
            <Track label="Steps" glyph="⊞">
              <div className="lane">
                {p.tracks.map((t, i) => (
                  <button
                    key={t.id}
                    type="button"
                    className={`lane-block ${t.diff_status} ${p.selectedStepId === t.id ? "selected" : ""}`}
                    style={{
                      left: (p.stepStartsMs[i] / 1000) * p.zoom,
                      width: (t.duration_ms / 1000) * p.zoom - 2,
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      p.onSelectStep(t.id);
                    }}
                  >
                    {t.title}
                    {t.diff_status === "changed" || t.diff_status === "added" ? (
                      <span className="star">★</span>
                    ) : null}
                  </button>
                ))}
                <Playhead time={p.currentTime} zoom={p.zoom} />
              </div>
            </Track>

            {/* Video lane */}
            <Track label="Video" glyph="●">
              <div className="lane">
                {p.tracks.map((t, i) => {
                  const w = (t.duration_ms / 1000) * p.zoom - 2;
                  const thumbCount = Math.max(1, Math.floor(w / 56));
                  return (
                    <div
                      key={t.id}
                      className="video-thumbs"
                      style={{
                        left: (p.stepStartsMs[i] / 1000) * p.zoom,
                        width: w,
                      }}
                    >
                      {Array.from({ length: thumbCount }).map((_, j) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={j} src={t.frame_url} alt="" draggable={false} />
                      ))}
                    </div>
                  );
                })}
                <Playhead time={p.currentTime} zoom={p.zoom} />
              </div>
            </Track>

            {/* Narration waveform lane */}
            <Track label="Narration" glyph="♪">
              <div className="lane">
                {p.tracks.map((t, i) => {
                  const w = (t.duration_ms / 1000) * p.zoom - 2;
                  return (
                    <div
                      key={t.id}
                      className="waveform"
                      style={{
                        left: (p.stepStartsMs[i] / 1000) * p.zoom,
                        width: w,
                      }}
                    >
                      {(t.waveform?.peaks ?? []).map((peak, idx) => (
                        <span
                          key={idx}
                          className="bar"
                          style={{ height: `${Math.max(2, peak * 100)}%` }}
                        />
                      ))}
                    </div>
                  );
                })}
                <Playhead time={p.currentTime} zoom={p.zoom} />
              </div>
            </Track>

            {/* Diff lane — the unique Foley track */}
            <Track label="Diff" glyph="✱">
              <div className="lane">
                {p.tracks.map((t, i) => (
                  <div
                    key={t.id}
                    className={`diff-stripe ${t.diff_status}`}
                    style={{
                      left: (p.stepStartsMs[i] / 1000) * p.zoom,
                      width: (t.duration_ms / 1000) * p.zoom - 2,
                    }}
                  />
                ))}
                <Playhead time={p.currentTime} zoom={p.zoom} />
              </div>
            </Track>
          </div>
        </div>
      </div>
    </section>
  );
}

function Track({ label, glyph, children }: { label: string; glyph: string; children: React.ReactNode }) {
  return (
    <div className="track">
      <div className="label">
        <span style={{ marginRight: 4 }}>{glyph}</span>
        {label}
      </div>
      {children}
    </div>
  );
}

function Playhead({ time, zoom }: { time: number; zoom: number }) {
  return <div className="playhead" style={{ left: time * zoom }} />;
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(1, "0")}:${String(sec).padStart(2, "0")}`;
}
