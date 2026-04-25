"use client";

import { useMemo, useRef } from "react";
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
  const laneRef = useRef<HTMLDivElement>(null);
  const totalWidth = p.totalDuration * p.zoom;

  // Ruler ticks every 5 seconds.
  const ticks = useMemo(() => {
    const arr: number[] = [];
    const step = 5;
    for (let s = 0; s <= p.totalDuration + 0.001; s += step) arr.push(s);
    return arr;
  }, [p.totalDuration]);

  function onLaneClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!laneRef.current) return;
    const rect = laneRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left + laneRef.current.scrollLeft;
    p.onSeek(x / p.zoom);
  }

  return (
    <section className="timeline">
      <div className="timeline-bar">
        <div className="controls">
          <button className="ctrl-icon" onClick={() => p.onJump(-1)} title="Previous step">⏮</button>
          <button className="play" onClick={p.onTogglePlay} title="Play / pause">
            {p.isPlaying ? "❚❚" : "▶"}
          </button>
          <button className="ctrl-icon" onClick={() => p.onJump(1)} title="Next step">⏭</button>
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

      <div className="timeline-tracks">
        <div className="timeline-scaler" style={{ width: totalWidth + 92 /* label gutter */ }}>
          {/* ruler */}
          <div className="ruler" style={{ marginLeft: 92, position: "relative" }}>
            {ticks.map((t) => (
              <div key={t} className="tick" style={{ left: t * p.zoom }}>
                <span className="lbl">{fmt(t)}</span>
              </div>
            ))}
          </div>

          <div className="tracks">
            {/* Steps lane */}
            <Track label="Steps" glyph="⊞">
              <div ref={laneRef} className="lane" onClick={onLaneClick}>
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
              <div className="lane" onClick={onLaneClick}>
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
                        <img key={j} src={t.frame_url} alt="" />
                      ))}
                    </div>
                  );
                })}
                <Playhead time={p.currentTime} zoom={p.zoom} />
              </div>
            </Track>

            {/* Narration waveform lane */}
            <Track label="Narration" glyph="♪">
              <div className="lane" onClick={onLaneClick}>
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
              <div className="lane" onClick={onLaneClick}>
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
