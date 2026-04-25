"use client";

// Editor v2 timeline. Renders the EditOverlay (timeline.json) with one row
// per track. Clips are selectable, draggable (move), and resizable from
// either edge. All edits go through props so EditorShell owns persistence.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Clip,
  type EditOverlay,
  TRACK_GLYPH,
  TRACK_LABEL,
  TRACK_ORDER,
  totalDurationMs,
} from "@/lib/timeline";
import type { TrackEntry } from "./EditorShell";

interface Props {
  overlay: EditOverlay;
  /** Source-side track frames keyed by step_id, used for thumbnails. */
  sourceById: Record<string, TrackEntry>;
  selectedClipId: string | null;
  currentTime: number;
  isPlaying: boolean;
  zoom: number;
  speed: number;
  onSelectClip: (id: string | null) => void;
  onPatchClip: (id: string, patch: Partial<Clip>) => void;
  onSeek: (s: number) => void;
  onTogglePlay: () => void;
  onZoom: (n: number) => void;
  onJump: (dir: -1 | 1) => void;
  /** Called when the user drops a palette item on a track. */
  onDropPalette: (
    track: keyof EditOverlay["tracks"],
    paletteKind: string,
    startMs: number,
  ) => void;
}

const LABEL_GUTTER = 92;
const SNAP_MS = 250;

type DragMode = "move" | "resize-l" | "resize-r";
interface DragState {
  clipId: string;
  mode: DragMode;
  startClientX: number;
  startMs: number;
  startDur: number;
}

export function Timeline2(p: Props) {
  const lanesRef = useRef<HTMLDivElement>(null);
  const totalMs = Math.max(totalDurationMs(p.overlay), 1);
  const totalSeconds = totalMs / 1000;
  const totalWidth = totalSeconds * p.zoom;
  const [scrubbing, setScrubbing] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [hoverDropTrack, setHoverDropTrack] = useState<keyof EditOverlay["tracks"] | null>(null);

  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let s = 0; s <= totalSeconds + 0.001; s += 5) arr.push(s);
    return arr;
  }, [totalSeconds]);

  function xToMs(clientX: number): number {
    if (!lanesRef.current) return 0;
    const rect = lanesRef.current.getBoundingClientRect();
    const x = clientX - rect.left + lanesRef.current.scrollLeft - LABEL_GUTTER;
    return Math.max(0, Math.min(totalMs, (x / p.zoom) * 1000));
  }
  function snap(ms: number): number {
    return Math.round(ms / SNAP_MS) * SNAP_MS;
  }

  function startScrub(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest(".tl2-clip")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setScrubbing(true);
    p.onSeek(xToMs(e.clientX) / 1000);
  }

  function startDrag(clip: Clip, mode: DragMode, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    p.onSelectClip(clip.id);
    setDrag({
      clipId: clip.id,
      mode,
      startClientX: e.clientX,
      startMs: clip.start_ms,
      startDur: clip.duration_ms,
    });
  }

  // Global pointer-move while scrubbing OR dragging a clip.
  useEffect(() => {
    if (!scrubbing && !drag) return;
    function onMove(e: PointerEvent) {
      if (scrubbing) {
        p.onSeek(xToMs(e.clientX) / 1000);
        return;
      }
      if (drag) {
        const dxMs = ((e.clientX - drag.startClientX) / p.zoom) * 1000;
        if (drag.mode === "move") {
          const next = Math.max(0, snap(drag.startMs + dxMs));
          p.onPatchClip(drag.clipId, { start_ms: next });
        } else if (drag.mode === "resize-r") {
          const next = Math.max(SNAP_MS, snap(drag.startDur + dxMs));
          p.onPatchClip(drag.clipId, { duration_ms: next });
        } else if (drag.mode === "resize-l") {
          const newStart = Math.max(0, snap(drag.startMs + dxMs));
          const delta = newStart - drag.startMs;
          const newDur = Math.max(SNAP_MS, drag.startDur - delta);
          p.onPatchClip(drag.clipId, { start_ms: newStart, duration_ms: newDur });
        }
      }
    }
    function onUp() {
      setScrubbing(false);
      setDrag(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [scrubbing, drag, p.zoom, totalMs]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        p.onSeek(Math.max(0, p.currentTime - (e.shiftKey ? 5 : 1)));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        p.onSeek(Math.min(totalSeconds, p.currentTime + (e.shiftKey ? 5 : 1)));
      } else if (e.key === " ") {
        e.preventDefault();
        p.onTogglePlay();
      } else if (e.key === "Escape") {
        p.onSelectClip(null);
      } else if (e.key === "j" || e.key === "J") {
        p.onJump(-1);
      } else if (e.key === "l" || e.key === "L") {
        p.onJump(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.currentTime, totalSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll to keep playhead visible
  useEffect(() => {
    const el = lanesRef.current;
    if (!el) return;
    const x = p.currentTime * p.zoom;
    if (x < el.scrollLeft + 80) el.scrollTo({ left: Math.max(0, x - 80), behavior: "smooth" });
    else if (x > el.scrollLeft + el.clientWidth - 80)
      el.scrollTo({ left: x - el.clientWidth + 80, behavior: "smooth" });
  }, [p.currentTime, p.zoom]);

  function handleDragOverLane(e: React.DragEvent, track: keyof EditOverlay["tracks"]) {
    if (e.dataTransfer.types.includes("application/x-foley-palette")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setHoverDropTrack(track);
    }
  }
  function handleDropOnLane(e: React.DragEvent, track: keyof EditOverlay["tracks"]) {
    const paletteKind = e.dataTransfer.getData("application/x-foley-palette");
    if (!paletteKind) return;
    e.preventDefault();
    const ms = snap(xToMs(e.clientX));
    p.onDropPalette(track, paletteKind, ms);
    setHoverDropTrack(null);
  }

  return (
    <section className="timeline tl2">
      <div className="timeline-bar">
        <div className="controls">
          <button className="ctrl-icon" onClick={() => p.onJump(-1)} title="Previous clip (J)">⏮</button>
          <button className="play" onClick={p.onTogglePlay} title="Play / pause (Space)">
            {p.isPlaying ? "❚❚" : "▶"}
          </button>
          <button className="ctrl-icon" onClick={() => p.onJump(1)} title="Next clip (L)">⏭</button>
          <span className="speed">{p.speed.toFixed(1)}x</span>
          <span className="timestamp">
            {fmt(p.currentTime)} / {fmt(totalSeconds)}
          </span>
        </div>
        <div className="zoom">
          <button className="ctrl-icon" onClick={() => p.onZoom(p.zoom - 8)} title="Zoom out">－</button>
          <input
            type="range"
            min={12} max={160} step={2} value={p.zoom}
            onChange={(e) => p.onZoom(Number(e.target.value))}
            style={{ width: 120 }}
            aria-label="zoom"
          />
          <button className="ctrl-icon" onClick={() => p.onZoom(p.zoom + 8)} title="Zoom in">＋</button>
        </div>
      </div>

      <div
        className={`timeline-tracks ${scrubbing ? "scrubbing" : ""} ${drag ? "dragging" : ""}`}
        ref={lanesRef}
      >
        <div className="timeline-scaler" style={{ width: totalWidth + LABEL_GUTTER, minWidth: "100%" }}>
          <div
            className="ruler"
            style={{ marginLeft: LABEL_GUTTER, position: "relative", cursor: "ew-resize" }}
            onPointerDown={startScrub}
          >
            {ticks.map((t) => (
              <div key={t} className="tick" style={{ left: t * p.zoom }}>
                <span className="lbl">{fmt(t)}</span>
              </div>
            ))}
          </div>

          <div className="tracks tl2-tracks" onPointerDown={startScrub}>
            {TRACK_ORDER.map((track) => (
              <TrackLane
                key={track}
                track={track}
                clips={p.overlay.tracks[track]}
                zoom={p.zoom}
                sourceById={p.sourceById}
                selectedClipId={p.selectedClipId}
                currentTime={p.currentTime}
                onSelectClip={p.onSelectClip}
                onClipPointerDown={startDrag}
                onDragOver={(e) => handleDragOverLane(e, track)}
                onDrop={(e) => handleDropOnLane(e, track)}
                onDragLeave={() => setHoverDropTrack(null)}
                isDropHover={hoverDropTrack === track}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

interface LaneProps {
  track: keyof EditOverlay["tracks"];
  clips: Clip[];
  zoom: number;
  sourceById: Record<string, TrackEntry>;
  selectedClipId: string | null;
  currentTime: number;
  onSelectClip: (id: string | null) => void;
  onClipPointerDown: (clip: Clip, mode: DragMode, e: React.PointerEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  isDropHover: boolean;
}

function TrackLane(p: LaneProps) {
  return (
    <div className={`track tl2-track tl2-track-${p.track}`}>
      <div className="label tl2-label">
        <span style={{ marginRight: 5 }}>{TRACK_GLYPH[p.track]}</span>
        {TRACK_LABEL[p.track]}
      </div>
      <div
        className={`lane tl2-lane ${p.isDropHover ? "drop-hover" : ""}`}
        onDragOver={p.onDragOver}
        onDrop={p.onDrop}
        onDragLeave={p.onDragLeave}
      >
        {p.clips.map((c) => (
          <ClipBlock
            key={c.id}
            clip={c}
            track={p.track}
            zoom={p.zoom}
            sourceById={p.sourceById}
            selected={p.selectedClipId === c.id}
            onSelect={p.onSelectClip}
            onPointerDown={p.onClipPointerDown}
          />
        ))}
        <Playhead time={p.currentTime} zoom={p.zoom} />
      </div>
    </div>
  );
}

interface ClipProps {
  clip: Clip;
  track: keyof EditOverlay["tracks"];
  zoom: number;
  sourceById: Record<string, TrackEntry>;
  selected: boolean;
  onSelect: (id: string | null) => void;
  onPointerDown: (clip: Clip, mode: DragMode, e: React.PointerEvent) => void;
}

function ClipBlock(p: ClipProps) {
  const left = (p.clip.start_ms / 1000) * p.zoom;
  const width = Math.max(8, (p.clip.duration_ms / 1000) * p.zoom - 2);
  const fadeInPx = (p.clip.fade_in_ms / 1000) * p.zoom;
  const fadeOutPx = (p.clip.fade_out_ms / 1000) * p.zoom;

  let body: React.ReactNode = null;
  let label = "";
  if (p.clip.kind === "video") {
    const src = p.sourceById[p.clip.step_id];
    label = src?.title ?? p.clip.step_id;
    const thumbCount = Math.max(1, Math.floor(width / 56));
    body = (
      <div className="tl2-video-thumbs">
        {Array.from({ length: thumbCount }).map((_, j) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={j} src={src?.frame_url} alt="" draggable={false} />
        ))}
      </div>
    );
  } else if (p.clip.kind === "voice") {
    const src = p.sourceById[p.clip.step_id];
    label = `vo: ${src?.title ?? p.clip.step_id}`;
    body = (
      <div className="tl2-waveform">
        {(src?.waveform?.peaks ?? []).map((peak, idx) => (
          <span key={idx} className="bar" style={{ height: `${Math.max(2, peak * 100)}%` }} />
        ))}
      </div>
    );
  } else if (p.clip.kind === "music") {
    label = p.clip.label;
    body = <div className="tl2-music-fill" />;
  } else if (p.clip.kind === "transition") {
    label = `trans: ${p.clip.transition_id}`;
    body = <div className="tl2-trans-fill"><span>✨ {p.clip.transition_id}</span></div>;
  } else if (p.clip.kind === "caption") {
    label = p.clip.text.slice(0, 24);
    body = <div className="tl2-caption-fill">📝 {p.clip.text}</div>;
  } else if (p.clip.kind === "banana") {
    label = p.clip.prompt.slice(0, 32) || "(no prompt yet)";
    body = (
      <div className="tl2-banana-fill" style={p.clip.asset_url ? { backgroundImage: `url(${p.clip.asset_url})` } : undefined}>
        {!p.clip.asset_url ? <span>🍌 {p.clip.prompt || "ungenerated"}</span> : null}
      </div>
    );
  } else if (p.clip.kind === "typed") {
    label = p.clip.strings[0]?.slice(0, 28) ?? "(typed)";
    body = <div className="tl2-typed-fill">⌨ {p.clip.strings.join(" / ")}</div>;
  }

  return (
    <div
      className={`tl2-clip kind-${p.clip.kind} ${p.selected ? "selected" : ""}`}
      style={{ left, width }}
      onPointerDown={(e) => {
        // body drag = move
        if ((e.target as HTMLElement).closest(".tl2-handle")) return;
        p.onPointerDown(p.clip, "move", e);
      }}
      onClick={(e) => {
        e.stopPropagation();
        p.onSelect(p.clip.id);
      }}
      title={label}
    >
      {fadeInPx > 4 ? <div className="tl2-fade tl2-fade-in" style={{ width: fadeInPx }} /> : null}
      {fadeOutPx > 4 ? <div className="tl2-fade tl2-fade-out" style={{ width: fadeOutPx }} /> : null}
      <div className="tl2-clip-body">{body}</div>
      <div className="tl2-clip-label">{label}</div>
      <div
        className="tl2-handle tl2-handle-l"
        onPointerDown={(e) => p.onPointerDown(p.clip, "resize-l", e)}
      />
      <div
        className="tl2-handle tl2-handle-r"
        onPointerDown={(e) => p.onPointerDown(p.clip, "resize-r", e)}
      />
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
