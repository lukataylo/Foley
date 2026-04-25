"use client";

// Editor v2/v3 timeline: anonymous rows that any clip kind can sit on.
// Row 0 = front-most in z-order. Drag horizontally to move (start_ms),
// drag either edge to resize (duration_ms), drag vertically to change row.
// Drop on the ghost row at the bottom to spawn a new row.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  type Clip,
  type ClipKind,
  type EditOverlay,
  KIND_GLYPH,
  KIND_LABEL,
  rowCount,
  totalDurationMs,
} from "@/lib/timeline";
import type { TrackEntry } from "./EditorShell";

interface Props {
  overlay: EditOverlay;
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
  onAddClip: (kind: ClipKind) => void;
  /** Pause video at scrub/drag start, resume at end. */
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
}

const LABEL_GUTTER = 64;
const ROW_HEIGHT = 44;
const SNAP_MS = 250;

type DragMode = "move" | "resize-l" | "resize-r";
interface DragState {
  clipId: string;
  mode: DragMode;
  startClientX: number;
  startClientY: number;
  startMs: number;
  startDur: number;
  startRow: number;
}

const ALL_KINDS: ClipKind[] = ["video", "voice", "music", "transition", "caption", "banana", "typed"];

export function Timeline2(p: Props) {
  const lanesRef = useRef<HTMLDivElement>(null);
  const [scrubbing, setScrubbing] = useState(false);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  const totalMs = Math.max(totalDurationMs(p.overlay), 1);
  const totalSeconds = totalMs / 1000;
  const totalWidth = totalSeconds * p.zoom;
  const rows = rowCount(p.overlay);

  const ticks = useMemo(() => {
    const arr: number[] = [];
    for (let s = 0; s <= totalSeconds + 0.001; s += 5) arr.push(s);
    return arr;
  }, [totalSeconds]);

  const clipsByRow = useMemo(() => {
    const out: Record<number, Clip[]> = {};
    for (const c of p.overlay.clips) {
      (out[c.row] ??= []).push(c);
    }
    return out;
  }, [p.overlay]);

  function xToMs(clientX: number): number {
    if (!lanesRef.current) return 0;
    const rect = lanesRef.current.getBoundingClientRect();
    const x = clientX - rect.left + lanesRef.current.scrollLeft - LABEL_GUTTER;
    return Math.max(0, Math.min(totalMs * 2, (x / p.zoom) * 1000));
  }
  function snap(ms: number): number {
    return Math.round(ms / SNAP_MS) * SNAP_MS;
  }

  function startScrub(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest(".tl3-clip")) return;
    if ((e.target as HTMLElement).closest(".tl3-row-chrome")) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setScrubbing(true);
    p.onInteractionStart?.();
    p.onSeek(xToMs(e.clientX) / 1000);
  }

  function startDrag(clip: Clip, mode: DragMode, e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    p.onSelectClip(clip.id);
    p.onInteractionStart?.();
    setDrag({
      clipId: clip.id,
      mode,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startMs: clip.start_ms,
      startDur: clip.duration_ms,
      startRow: clip.row,
    });
  }

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
          const newStart = Math.max(0, snap(drag.startMs + dxMs));
          // Vertical row change — rounded by half-row units. Allow new rows
          // up to one past the bottom (drop on ghost row).
          const dyRow = Math.round((e.clientY - drag.startClientY) / ROW_HEIGHT);
          const newRow = Math.max(0, Math.min(rows, drag.startRow + dyRow));
          p.onPatchClip(drag.clipId, { start_ms: newStart, row: newRow });
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
      p.onInteractionEnd?.();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [scrubbing, drag, p.zoom, totalMs, rows]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setAddOpen(false);
      } else if (e.key === "j" || e.key === "J") {
        p.onJump(-1);
      } else if (e.key === "l" || e.key === "L") {
        p.onJump(1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [p.currentTime, totalSeconds]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = lanesRef.current;
    if (!el) return;
    const x = p.currentTime * p.zoom;
    if (x < el.scrollLeft + 80) el.scrollTo({ left: Math.max(0, x - 80), behavior: "smooth" });
    else if (x > el.scrollLeft + el.clientWidth - 80)
      el.scrollTo({ left: x - el.clientWidth + 80, behavior: "smooth" });
  }, [p.currentTime, p.zoom]);

  // Click outside the add menu closes it.
  useEffect(() => {
    if (!addOpen) return;
    function onDoc(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".tl3-add")) setAddOpen(false);
    }
    window.addEventListener("mousedown", onDoc);
    return () => window.removeEventListener("mousedown", onDoc);
  }, [addOpen]);

  return (
    <section className="timeline tl3">
      <div className="timeline-bar tl3-bar">
        <div className="controls">
          <div className="tl3-add">
            <button
              type="button"
              className="tl3-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                setAddOpen((v) => !v);
              }}
              aria-haspopup="menu"
              aria-expanded={addOpen}
            >
              + Add <span className="tl3-add-caret">▾</span>
            </button>
            {addOpen ? (
              <div className="tl3-add-menu" role="menu">
                {ALL_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="tl3-add-item"
                    onClick={() => { p.onAddClip(k); setAddOpen(false); }}
                  >
                    <span className="tl3-add-glyph">{KIND_GLYPH[k]}</span>
                    <span>{KIND_LABEL[k]}</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <button className="ctrl-icon" onClick={() => p.onJump(-1)} title="Previous clip (J)">⏮</button>
          <button className="play" onClick={p.onTogglePlay} title="Play / pause (Space)">
            {p.isPlaying ? "❚❚" : "▶"}
          </button>
          <button className="ctrl-icon" onClick={() => p.onJump(1)} title="Next clip (L)">⏭</button>
          <span className="speed">{p.speed.toFixed(1)}x</span>
          <span className="timestamp">{fmt(p.currentTime)} / {fmt(totalSeconds)}</span>
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
        className={`timeline-tracks tl3-tracks ${scrubbing ? "scrubbing" : ""} ${drag ? "dragging" : ""}`}
        ref={lanesRef}
      >
        <div className="tl3-scaler" style={{ width: totalWidth + LABEL_GUTTER, minWidth: "100%" }}>
          <div
            className="ruler tl3-ruler"
            style={{ marginLeft: LABEL_GUTTER, position: "relative", cursor: "ew-resize" }}
            onPointerDown={startScrub}
          >
            {ticks.map((t) => (
              <div key={t} className="tick" style={{ left: t * p.zoom }}>
                <span className="lbl">{fmt(t)}</span>
              </div>
            ))}
          </div>

          <div className="tl3-rows" onPointerDown={startScrub}>
            {Array.from({ length: rows }).map((_, r) => (
              <Row
                key={r}
                rowIndex={r}
                clips={clipsByRow[r] ?? []}
                zoom={p.zoom}
                sourceById={p.sourceById}
                selectedClipId={p.selectedClipId}
                currentTime={p.currentTime}
                onSelectClip={p.onSelectClip}
                onClipPointerDown={startDrag}
              />
            ))}
            <GhostRow rowIndex={rows} zoom={p.zoom} currentTime={p.currentTime} />
          </div>
        </div>
      </div>
    </section>
  );
}

interface RowProps {
  rowIndex: number;
  clips: Clip[];
  zoom: number;
  sourceById: Record<string, TrackEntry>;
  selectedClipId: string | null;
  currentTime: number;
  onSelectClip: (id: string | null) => void;
  onClipPointerDown: (clip: Clip, mode: DragMode, e: React.PointerEvent) => void;
}

function Row(p: RowProps) {
  return (
    <div className="tl3-row" data-row={p.rowIndex}>
      <div className="tl3-row-chrome">
        <span className="tl3-row-speaker" title={`Row ${p.rowIndex + 1}`}>🔊</span>
      </div>
      <div className="tl3-row-lane">
        {p.clips.map((c) => (
          <ClipBlock
            key={c.id}
            clip={c}
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

function GhostRow({ rowIndex, zoom, currentTime }: { rowIndex: number; zoom: number; currentTime: number }) {
  return (
    <div className="tl3-row tl3-row-ghost" data-row={rowIndex}>
      <div className="tl3-row-chrome">
        <span className="tl3-row-speaker">＋</span>
      </div>
      <div className="tl3-row-lane">
        <div className="tl3-ghost-hint">drop here to start a new row</div>
        <Playhead time={currentTime} zoom={zoom} />
      </div>
    </div>
  );
}

interface ClipProps {
  clip: Clip;
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
      <div className="tl3-video-thumbs">
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
      <div className="tl3-waveform">
        {(src?.waveform?.peaks ?? []).map((peak, idx) => (
          <span key={idx} className="bar" style={{ height: `${Math.max(2, peak * 100)}%` }} />
        ))}
      </div>
    );
  } else if (p.clip.kind === "music") {
    label = p.clip.label;
    body = <div className="tl3-music-fill" />;
  } else if (p.clip.kind === "transition") {
    label = `trans: ${p.clip.transition_id}`;
    body = <div className="tl3-trans-fill"><span>✨ {p.clip.transition_id}</span></div>;
  } else if (p.clip.kind === "caption") {
    label = p.clip.text.slice(0, 24);
    body = <div className="tl3-caption-fill">📝 {p.clip.text}</div>;
  } else if (p.clip.kind === "banana") {
    label = p.clip.prompt.slice(0, 32) || "(no prompt yet)";
    body = (
      <div className="tl3-banana-fill" style={p.clip.asset_url ? { backgroundImage: `url(${p.clip.asset_url})` } : undefined}>
        {!p.clip.asset_url ? <span>🍌 {p.clip.prompt || "ungenerated"}</span> : null}
      </div>
    );
  } else if (p.clip.kind === "typed") {
    label = p.clip.strings[0]?.slice(0, 28) ?? "(typed)";
    body = <div className="tl3-typed-fill">⌨ {p.clip.strings.join(" / ")}</div>;
  }

  return (
    <div
      className={`tl3-clip kind-${p.clip.kind} ${p.selected ? "selected" : ""}`}
      style={{ left, width }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest(".tl3-handle")) return;
        p.onPointerDown(p.clip, "move", e);
      }}
      onClick={(e) => { e.stopPropagation(); p.onSelect(p.clip.id); }}
      title={label}
    >
      {fadeInPx > 4 ? <div className="tl3-fade tl3-fade-in" style={{ width: fadeInPx }} /> : null}
      {fadeOutPx > 4 ? <div className="tl3-fade tl3-fade-out" style={{ width: fadeOutPx }} /> : null}
      <div className="tl3-clip-body">{body}</div>
      <div className="tl3-clip-label">
        <span className="tl3-clip-glyph">{KIND_GLYPH[p.clip.kind]}</span>
        {label}
      </div>
      <div className="tl3-handle tl3-handle-l" onPointerDown={(e) => p.onPointerDown(p.clip, "resize-l", e)} />
      <div className="tl3-handle tl3-handle-r" onPointerDown={(e) => p.onPointerDown(p.clip, "resize-r", e)} />
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
