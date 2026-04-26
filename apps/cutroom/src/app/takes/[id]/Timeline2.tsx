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
import { type ContinuousNarration, slicePeaks } from "@/lib/narration";
import type { TrackEntry } from "./EditorShell";

interface Props {
  overlay: EditOverlay;
  sourceById: Record<string, TrackEntry>;
  selectedClipId: string | null;
  /** Additional clips selected via shift-click. */
  extraSelectedClipIds?: string[];
  currentTime: number;
  isPlaying: boolean;
  zoom: number;
  speed: number;
  onSelectClip: (id: string | null, modifiers?: { shift?: boolean }) => void;
  onPatchClip: (id: string, patch: Partial<Clip>) => void;
  onSeek: (s: number) => void;
  onTogglePlay: () => void;
  onSpeed?: (n: number) => void;
  onZoom: (n: number) => void;
  onJump: (dir: -1 | 1) => void;
  onAddClip: (kind: ClipKind) => void;
  /** Pause video at scrub/drag start, resume at end. */
  onInteractionStart?: () => void;
  onInteractionEnd?: () => void;
  /** Mark a clip as out-of-date with its source. */
  isClipStale?: (clip: Clip) => boolean;
  /** Regenerate every stale clip we can (banana/music). */
  onRegenerateStale?: () => void;
  /** True while a regen sweep is in flight. */
  regenBusy?: boolean;
  /** Right-click delete on a clip. */
  onRemoveClip?: (id: string) => void;
  /** Split a clip at the playhead. Returns true if the split happened — used
   *  by the right-click menu to disable itself when the playhead is outside
   *  the clip's body. */
  onSplitClip?: (id: string) => boolean;
  /** Duplicate a clip — copy lands directly after the original on the same row. */
  onDuplicateClip?: (id: string) => void;
  /** Step lookup — search "step_id title narration" pulls from this when
   *  matching video/voice clips. Defaults to sourceById. */
  searchStepLabel?: (stepId: string) => string;

  /** ── Variant A / B props ────────────────────────────────────────── */
  /** One waveform spanning the whole take. When present, voice clips draw
   *  their slice of *this* waveform instead of their own per-step peaks. */
  narration?: ContinuousNarration | null;
  /** True iff any step's narration text was edited since the last continuous
   *  synth. Drives the "voice stale" pill in the toolbar. */
  voiceStale?: boolean;
  /** Triggered by the regenerate-voice button. */
  onRegenerateVoice?: () => void;
  /** Spinner state for the regenerate-voice button. */
  voiceBusy?: boolean;
  /** Variant B — render an opt-in lane that shows narration text per step on
   *  top of the voice clip. Editing flips voiceStale until the next render. */
  showScriptLane?: boolean;
  onToggleScriptLane?: () => void;
  /** Update narration text for a step (debounced PATCH happens upstream). */
  onEditStepNarration?: (step_id: string, text: string) => void;
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
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; clipId: string; kind: ClipKind } | null>(null);
  const [search, setSearch] = useState("");

  // Build a coarse "haystack" string per clip for the search filter. Includes
  // the clip id, kind label, any user-authored text (transitions, captions,
  // typed strings, music labels, banana prompts), and — for video/voice
  // clips — the step's title via the `searchStepLabel` callback.
  function clipMatches(c: Clip, q: string): boolean {
    if (!q) return false;
    const needle = q.trim().toLowerCase();
    if (!needle) return false;
    const parts: string[] = [c.id, c.kind];
    if (c.kind === "video" || c.kind === "voice") {
      parts.push(c.step_id, p.searchStepLabel?.(c.step_id) ?? "");
    }
    if (c.kind === "music") parts.push(c.label, c.prompt ?? "");
    if (c.kind === "transition") parts.push(c.transition_id);
    if (c.kind === "caption") parts.push(c.text);
    if (c.kind === "banana") parts.push(c.prompt);
    if (c.kind === "typed") parts.push(...c.strings);
    return parts.some((s) => s.toLowerCase().includes(needle));
  }
  const matchedIds = useMemo(() => {
    if (!search.trim()) return new Set<string>();
    return new Set(p.overlay.clips.filter((c) => clipMatches(c, search)).map((c) => c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, p.overlay]);

  const totalMs = Math.max(totalDurationMs(p.overlay), 1);
  const totalSeconds = totalMs / 1000;
  const totalWidth = totalSeconds * p.zoom;
  const rows = rowCount(p.overlay);
  const staleCount = p.isClipStale
    ? p.overlay.clips.filter(p.isClipStale).length
    : 0;

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
    // Forward the shift modifier so the parent's selection logic can choose
    // between toggling the multi-select set (shift) and replacing the
    // primary selection (no shift). Without this, every shift-click would
    // pointerdown-clear the extras before the click handler could add them.
    p.onSelectClip(clip.id, { shift: e.shiftKey });
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
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") onUp();
    }
    function onBlur() { onUp(); }
    function onLeave(e: PointerEvent) {
      // If the pointer leaves the document entirely, treat as release.
      if (e.clientX <= 0 || e.clientY <= 0
          || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
        onUp();
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    window.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onBlur);
    window.addEventListener("keydown", onEsc);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("keydown", onEsc);
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

  // Click outside the context menu closes it.
  useEffect(() => {
    if (!ctxMenu) return;
    function onDoc(e: MouseEvent) {
      if (!(e.target as HTMLElement).closest(".tl3-ctxmenu")) setCtxMenu(null);
    }
    function onEsc(e: KeyboardEvent) { if (e.key === "Escape") setCtxMenu(null); }
    function onScroll() { setCtxMenu(null); }
    window.addEventListener("mousedown", onDoc);
    window.addEventListener("keydown", onEsc);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDoc);
      window.removeEventListener("keydown", onEsc);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [ctxMenu]);

  function openCtxMenu(clip: Clip, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY, clipId: clip.id, kind: clip.kind });
  }

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
          {p.onSpeed ? (
            <select
              className="speed-select"
              value={p.speed.toFixed(2)}
              onChange={(e) => p.onSpeed?.(Number(e.target.value))}
              aria-label="Playback speed"
              title="Playback speed"
            >
              {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                <option key={s} value={s.toFixed(2)}>{s}x</option>
              ))}
            </select>
          ) : (
            <span className="speed">{p.speed.toFixed(1)}x</span>
          )}
          <span className="timestamp">{fmt(p.currentTime)} / {fmt(totalSeconds)}</span>
          {staleCount > 0 ? (
            <button
              type="button"
              className="tl3-stale-cta"
              onClick={p.onRegenerateStale}
              disabled={p.regenBusy}
              title="Regenerate stale clips"
            >
              ⚠ {staleCount} stale {p.regenBusy ? "· regenerating…" : "· regenerate all"}
            </button>
          ) : null}
          {p.onToggleScriptLane ? (
            <button
              type="button"
              className={`tl3-toggle ${p.showScriptLane ? "on" : ""}`}
              onClick={p.onToggleScriptLane}
              title="Show narration script bubbles on voice clips"
            >
              {p.showScriptLane ? "✓ Script" : "Script"}
            </button>
          ) : null}
          {p.onRegenerateVoice ? (
            <button
              type="button"
              className={`tl3-voice-cta ${p.voiceStale ? "stale" : ""}`}
              onClick={p.onRegenerateVoice}
              disabled={p.voiceBusy}
              title={
                p.voiceStale
                  ? "Narration text edited — re-synth as one continuous take"
                  : "Re-synth narration as one continuous take"
              }
            >
              {p.voiceBusy
                ? "🎙 synthesizing…"
                : p.voiceStale
                  ? "⚠ voice stale · regenerate"
                  : "🎙 regenerate voice"}
            </button>
          ) : null}
        </div>
        <input
          className="tl3-search"
          type="search"
          placeholder="Find clip…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search clips"
        />
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
                extraSelectedClipIds={p.extraSelectedClipIds}
                matchedClipIds={matchedIds}
                searchActive={search.trim().length > 0}
                currentTime={p.currentTime}
                isClipStale={p.isClipStale}
                onSelectClip={p.onSelectClip}
                onClipPointerDown={startDrag}
                onContextMenu={openCtxMenu}
                narration={p.narration ?? null}
                showScriptLane={!!p.showScriptLane}
                onEditStepNarration={p.onEditStepNarration}
              />
            ))}
            <GhostRow rowIndex={rows} zoom={p.zoom} currentTime={p.currentTime} />
          </div>
          {ctxMenu && (() => {
            // Compute split eligibility from the live clip — the right-click
            // happened earlier, so we re-read the clip rather than trust a
            // captured copy that might be stale after a drag.
            const ctxClip = p.overlay.clips.find((c) => c.id === ctxMenu.clipId);
            const tMs = p.currentTime * 1000;
            const splitOk =
              !!ctxClip &&
              !ctxClip.locked &&
              !!p.onSplitClip &&
              tMs - ctxClip.start_ms >= SNAP_MS &&
              ctxClip.start_ms + ctxClip.duration_ms - tMs >= SNAP_MS;
            return (
              <div
                className="tl3-ctxmenu"
                style={{ left: ctxMenu.x, top: ctxMenu.y }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <div className="tl3-ctxmenu-head">{ctxMenu.kind} clip</div>
                <button
                  type="button"
                  className="tl3-ctxmenu-item"
                  onClick={() => {
                    p.onSelectClip(ctxMenu.clipId);
                    setCtxMenu(null);
                  }}
                >
                  Edit in inspector
                </button>
                <button
                  type="button"
                  className="tl3-ctxmenu-item"
                  disabled={!splitOk}
                  title={
                    splitOk
                      ? "Split this clip at the playhead (S)"
                      : "Move the playhead inside the clip body to split"
                  }
                  onClick={() => {
                    if (!splitOk) return;
                    p.onSplitClip?.(ctxMenu.clipId);
                    setCtxMenu(null);
                  }}
                >
                  Split at playhead
                </button>
                <button
                  type="button"
                  className="tl3-ctxmenu-item"
                  disabled={!p.onDuplicateClip}
                  title="Duplicate this clip (⌘D)"
                  onClick={() => {
                    p.onDuplicateClip?.(ctxMenu.clipId);
                    setCtxMenu(null);
                  }}
                >
                  Duplicate clip
                </button>
                <button
                  type="button"
                  className="tl3-ctxmenu-item danger"
                  onClick={() => {
                    p.onRemoveClip?.(ctxMenu.clipId);
                    setCtxMenu(null);
                  }}
                >
                  Delete clip
                </button>
              </div>
            );
          })()}
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
  extraSelectedClipIds?: string[];
  matchedClipIds?: Set<string>;
  searchActive?: boolean;
  currentTime: number;
  isClipStale?: (clip: Clip) => boolean;
  onSelectClip: (id: string | null, modifiers?: { shift?: boolean }) => void;
  onClipPointerDown: (clip: Clip, mode: DragMode, e: React.PointerEvent) => void;
  onContextMenu?: (clip: Clip, e: React.MouseEvent) => void;
  narration: ContinuousNarration | null;
  showScriptLane: boolean;
  onEditStepNarration?: (step_id: string, text: string) => void;
}

function Row(p: RowProps) {
  // One continuous waveform across the row when this is a voice row that has
  // a continuous narration take. Replaces the per-clip waveform islands so the
  // voice overlay reads as a single end-to-end strip.
  const voiceClips = p.clips.filter((c) => c.kind === "voice");
  const isVoiceRiver = !!p.narration && voiceClips.length >= 1;
  const riverLeft = isVoiceRiver
    ? Math.min(...voiceClips.map((c) => c.start_ms)) / 1000 * p.zoom
    : 0;
  const riverRight = isVoiceRiver
    ? Math.max(...voiceClips.map((c) => c.start_ms + c.duration_ms)) / 1000 * p.zoom
    : 0;
  const riverWidth = Math.max(0, riverRight - riverLeft);
  const riverPeaks = isVoiceRiver && p.narration
    ? slicePeaks(
        p.narration,
        Math.min(...voiceClips.map((c) => c.start_ms)),
        Math.max(...voiceClips.map((c) => c.start_ms + c.duration_ms)) -
          Math.min(...voiceClips.map((c) => c.start_ms)),
      )
    : [];
  const showBoundaries = isVoiceRiver && voiceClips.length >= 2;
  // Expand the row when the script lane is on so the per-step ScriptBubble
  // textareas have real room to breathe — the default 44px row only fits a
  // single ellipsised line.
  const isScriptExpanded = !!p.showScriptLane && voiceClips.length >= 1;

  return (
    <div
      className={`tl3-row ${isScriptExpanded ? "tl3-row-script" : ""}`}
      data-row={p.rowIndex}
    >
      <div className="tl3-row-chrome">
        <span className="tl3-row-speaker" title={`Row ${p.rowIndex + 1}`}>🔊</span>
      </div>
      <div className={`tl3-row-lane ${isVoiceRiver ? "tl3-row-lane-river" : ""}`}>
        {isVoiceRiver ? (
          <div
            className="tl3-row-river"
            style={{ left: riverLeft, width: riverWidth }}
            aria-hidden
          >
            <div className="tl3-waveform tl3-waveform-river">
              {riverPeaks.map((peak, idx) => (
                <span key={idx} className="bar" style={{ height: `${Math.max(2, peak * 100)}%` }} />
              ))}
            </div>
          </div>
        ) : null}
        {showBoundaries
          ? voiceClips.slice(1).map((c) => (
              <div
                key={`b-${c.id}`}
                className="tl3-step-boundary"
                style={{ left: (c.start_ms / 1000) * p.zoom }}
                aria-hidden
              />
            ))
          : null}
        {p.clips.map((c) => (
          <ClipBlock
            key={c.id}
            clip={c}
            zoom={p.zoom}
            sourceById={p.sourceById}
            selected={p.selectedClipId === c.id}
            multiSelected={p.extraSelectedClipIds?.includes(c.id) ?? false}
            matched={p.matchedClipIds?.has(c.id) ?? false}
            dimmed={!!p.searchActive && !(p.matchedClipIds?.has(c.id) ?? false)}
            stale={p.isClipStale?.(c) ?? false}
            narration={p.narration}
            showScriptLane={p.showScriptLane}
            onSelect={p.onSelectClip}
            onPointerDown={p.onClipPointerDown}
            onContextMenu={p.onContextMenu}
            onEditStepNarration={p.onEditStepNarration}
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
  /** True when this clip is part of a multi-selection (shift-click). */
  multiSelected?: boolean;
  /** True when the search query matches this clip. */
  matched?: boolean;
  /** True when search is active and this clip is NOT a match. */
  dimmed?: boolean;
  stale: boolean;
  narration: ContinuousNarration | null;
  showScriptLane: boolean;
  onSelect: (id: string | null, modifiers?: { shift?: boolean }) => void;
  onPointerDown: (clip: Clip, mode: DragMode, e: React.PointerEvent) => void;
  onContextMenu?: (clip: Clip, e: React.MouseEvent) => void;
  onEditStepNarration?: (step_id: string, text: string) => void;
}

function ClipBlock(p: ClipProps) {
  const left = (p.clip.start_ms / 1000) * p.zoom;
  const width = Math.max(8, (p.clip.duration_ms / 1000) * p.zoom - 2);
  const fadeInPx = (p.clip.fade_in_ms / 1000) * p.zoom;
  const fadeOutPx = (p.clip.fade_out_ms / 1000) * p.zoom;

  let body: React.ReactNode = null;
  let label = "";
  const bodyOwnsLabel =
    p.clip.kind === "transition" ||
    p.clip.kind === "caption" ||
    p.clip.kind === "banana" ||
    p.clip.kind === "typed";
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
    // River mode (continuous narration available): the row paints one waveform
    // strip end-to-end behind every voice clip — so the per-clip body is just
    // an empty selection region. Legacy mode: each clip draws its own peaks.
    if (p.narration && p.narration.peaks.length) {
      body = p.showScriptLane ? (
        <ScriptBubble
          stepId={p.clip.step_id}
          text={src?.narration ?? ""}
          onEdit={p.onEditStepNarration}
        />
      ) : null;
    } else {
      const peaks = src?.waveform?.peaks ?? [];
      body = (
        <>
          <div className="tl3-waveform">
            {peaks.map((peak, idx) => (
              <span key={idx} className="bar" style={{ height: `${Math.max(2, peak * 100)}%` }} />
            ))}
          </div>
          {p.showScriptLane ? (
            <ScriptBubble
              stepId={p.clip.step_id}
              text={src?.narration ?? ""}
              onEdit={p.onEditStepNarration}
            />
          ) : null}
        </>
      );
    }
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

  const isVoiceRiver = p.clip.kind === "voice" && !!p.narration && p.narration.peaks.length > 0;

  return (
    <div
      className={`tl3-clip kind-${p.clip.kind} ${p.selected ? "selected" : ""} ${p.multiSelected ? "multi-selected" : ""} ${p.matched ? "matched" : ""} ${p.dimmed ? "dimmed" : ""} ${p.stale ? "stale" : ""} ${isVoiceRiver ? "kind-voice-river" : ""}`}
      style={{ left, width }}
      onPointerDown={(e) => {
        if ((e.target as HTMLElement).closest(".tl3-handle")) return;
        p.onPointerDown(p.clip, "move", e);
      }}
      onClick={(e) => {
        // Selection is handled in startDrag (pointerdown) so it survives
        // dragging without a click event. Click here just blocks scrub
        // bubbling — selecting again here would re-toggle the extras set
        // on shift-click and cancel out the pointerdown's add.
        e.stopPropagation();
      }}
      onContextMenu={(e) => p.onContextMenu?.(p.clip, e)}
      title={[
        `${KIND_LABEL[p.clip.kind]} — ${label}`,
        `${(p.clip.start_ms / 1000).toFixed(1)}s · ${(p.clip.duration_ms / 1000).toFixed(1)}s long · row ${p.clip.row + 1}`,
        p.stale ? "⚠ source updated since this clip was edited" : null,
        "Right-click for menu · S to split · Delete to remove",
      ].filter(Boolean).join("\n")}
    >
      {fadeInPx > 4 ? <div className="tl3-fade tl3-fade-in" style={{ width: fadeInPx }} /> : null}
      {fadeOutPx > 4 ? <div className="tl3-fade tl3-fade-out" style={{ width: fadeOutPx }} /> : null}
      <div className="tl3-clip-body">{body}</div>
      {bodyOwnsLabel ? (
        p.stale ? (
          <div className="tl3-clip-label tl3-clip-label-badge">
            <span className="tl3-stale-badge" title="Source updated since this clip was edited">⚠</span>
          </div>
        ) : null
      ) : (
        <div className="tl3-clip-label">
          <span className="tl3-clip-glyph">{KIND_GLYPH[p.clip.kind]}</span>
          {label}
          {p.stale ? <span className="tl3-stale-badge" title="Source updated since this clip was edited">⚠</span> : null}
        </div>
      )}
      <div className="tl3-handle tl3-handle-l" onPointerDown={(e) => p.onPointerDown(p.clip, "resize-l", e)} />
      <div className="tl3-handle tl3-handle-r" onPointerDown={(e) => p.onPointerDown(p.clip, "resize-r", e)} />
    </div>
  );
}

function Playhead({ time, zoom }: { time: number; zoom: number }) {
  return <div className="playhead" style={{ left: time * zoom }} />;
}

interface ScriptBubbleProps {
  stepId: string;
  text: string;
  onEdit?: (step_id: string, text: string) => void;
}

function ScriptBubble(p: ScriptBubbleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.text);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Reset the local draft when the source text changes (e.g. after a save
  // round-trip from an external editor).
  useEffect(() => {
    if (!editing) setDraft(p.text);
  }, [p.text, editing]);

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== p.text) p.onEdit?.(p.stepId, next);
    else setDraft(p.text);
  }

  if (editing) {
    return (
      <textarea
        ref={taRef}
        className="tl3-script-bubble editing"
        value={draft}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            setDraft(p.text);
            setEditing(false);
          } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commit();
          }
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
    );
  }
  return (
    <div
      className="tl3-script-bubble"
      onClick={(e) => {
        e.stopPropagation();
        if (!p.onEdit) return;
        setEditing(true);
      }}
      onPointerDown={(e) => e.stopPropagation()}
      title="Click to edit narration text"
    >
      <span className="tl3-script-glyph">📝</span>
      <span className="tl3-script-text">{p.text || <em>No narration yet</em>}</span>
    </div>
  );
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${String(m).padStart(1, "0")}:${String(sec).padStart(2, "0")}`;
}
