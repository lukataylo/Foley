// EditOverlay — the editorial layer that survives source regeneration.
//
// Source = captured/baked artifacts on disk (steps/<id>.mp4, narration audio,
// master.mp4). EditOverlay = a JSON file the editor owns that says where each
// piece sits on the timeline, plus user-applied tweaks (length override,
// fade in/out, volume, zoom, position, row in the stack).
//
// Schema v2: clips are a flat array. Rows are anonymous integer indices,
// 0 = front-most in z-order. Any kind can sit on any row. v1 (per-kind
// tracks) is migrated on read.
//
// All times in milliseconds. id strings are stable across saves.

import type { Walkthrough } from "./types";

export type ClipKind =
  | "video"
  | "voice"
  | "music"
  | "transition"
  | "caption"
  | "banana"
  | "typed";

interface ClipBase {
  id: string;
  kind: ClipKind;
  /** Row in the timeline stack. 0 = front-most in canvas z-order. */
  row: number;
  start_ms: number;
  duration_ms: number;
  fade_in_ms: number;
  fade_out_ms: number;
  volume: number;
  locked?: boolean;
  /** sha256 of the source asset *at the time the user last edited this clip*. */
  source_sha256_at_edit?: string | null;
}

export interface VideoClip extends ClipBase {
  kind: "video";
  step_id: string;
  zoom_enabled: boolean;
  zoom_factor: number;
  zoom_origin_x: number;
  zoom_origin_y: number;
  match_source_length: boolean;
  /** Fallback still shown when the source mp4 isn't recorded yet (suggestions). */
  poster_url?: string | null;
  /** Narration overlay shown over the poster while the step is unrecorded. */
  placeholder_text?: string | null;
  /** Where this clip starts inside its source mp4, in ms. Defaults to 0 — the
   *  clip plays the source from the top. Bumped by splitClip() so the right
   *  half of a cut continues from where the left half ended instead of
   *  restarting the source. */
  source_offset_ms?: number;
}

export interface VoiceClip extends ClipBase {
  kind: "voice";
  step_id: string;
  /** See VideoClip.source_offset_ms — same semantic, applied to the per-step
   *  narration mp3 in non-continuous mode. */
  source_offset_ms?: number;
}

export interface MusicClip extends ClipBase {
  kind: "music";
  asset_url: string;
  label: string;
  loop: boolean;
  /** Prompt used to generate this track (if AI-generated). */
  prompt?: string;
  /** Duration of the generated track in ms — informational only. */
  generated_duration_ms?: number;
}

export interface TransitionClip extends ClipBase {
  kind: "transition";
  transition_id: string;
}

export interface CaptionClip extends ClipBase {
  kind: "caption";
  text: string;
  align: "top" | "center" | "bottom";
}

export interface BananaClip extends ClipBase {
  kind: "banana";
  prompt: string;
  asset_url: string;
  layout: "fullscreen" | "lower-third" | "corner";
  ref_step_id?: string | null;
}

export interface TypedClip extends ClipBase {
  kind: "typed";
  strings: string[];
  font_family: string;
  font_size_px: number;
  color: string;
  bg_color: string;
  type_speed_ms: number;
  back_speed_ms: number;
  loop: boolean;
  show_cursor: boolean;
  cursor_char: string;
  align: "top" | "center" | "bottom";
}

export type Clip =
  | VideoClip
  | VoiceClip
  | MusicClip
  | TransitionClip
  | CaptionClip
  | BananaClip
  | TypedClip;

export interface EditOverlay {
  version: 2;
  clips: Clip[];
}

/** Default row a newly-added clip of this kind lands on.
 *
 * Row 0 is the top of the timeline. We put video/voice/music on the bottom
 * three so the user sees their content immediately when the editor opens
 * with a fresh synth. New overlays (transition/caption/banana/typed) come
 * in at row 0 — visually on top of the video, where overlays belong.
 *
 * Z-order in the canvas is determined separately by clip kind, not row, so
 * the row index here is purely a visual organization affordance.
 */
export const DEFAULT_ROW: Record<ClipKind, number> = {
  banana: 0,
  typed: 0,
  transition: 0,
  caption: 0,
  video: 1,
  voice: 2,
  music: 3,
};

export const KIND_GLYPH: Record<ClipKind, string> = {
  video: "🎬",
  voice: "🎤",
  music: "🎵",
  transition: "✨",
  caption: "📝",
  banana: "🍌",
  typed: "⌨",
};

export const KIND_LABEL: Record<ClipKind, string> = {
  video: "Video clip",
  voice: "Voice clip",
  music: "Music bed",
  transition: "Transition",
  caption: "Caption",
  banana: "Nano Banana",
  typed: "Typed text",
};

/** Synthesize a fresh overlay from a walkthrough's authored steps. */
export function synthesizeOverlay(wt: Walkthrough): EditOverlay {
  let cursor = 0;
  const clips: Clip[] = [];
  for (const step of wt.steps) {
    const dur = step.duration_ms;
    clips.push({
      id: `v-${step.id}`,
      kind: "video",
      row: DEFAULT_ROW.video,
      step_id: step.id,
      start_ms: cursor,
      duration_ms: dur,
      fade_in_ms: 0,
      fade_out_ms: 0,
      volume: 1.0,
      zoom_enabled: false,
      zoom_factor: 1.6,
      zoom_origin_x: 50,
      zoom_origin_y: 50,
      match_source_length: true,
    });
    clips.push({
      id: `vo-${step.id}`,
      kind: "voice",
      row: DEFAULT_ROW.voice,
      step_id: step.id,
      start_ms: cursor,
      duration_ms: dur,
      fade_in_ms: 0,
      fade_out_ms: 0,
      volume: 1.0,
    });
    cursor += dur;
  }
  return { version: 2, clips };
}

/** Migrate a v1 (per-kind tracks) overlay to v2 (flat clips with row). */
interface OverlayV1 {
  version: 1;
  tracks: Record<ClipKind, Clip[]>;
}
export function migrateOverlay(raw: unknown): EditOverlay {
  if (!raw || typeof raw !== "object") {
    return { version: 2, clips: [] };
  }
  const o = raw as { version?: number };
  if (o.version === 2) {
    return raw as EditOverlay;
  }
  if (o.version === 1) {
    const v1 = raw as OverlayV1;
    const clips: Clip[] = [];
    for (const kind of Object.keys(v1.tracks) as ClipKind[]) {
      for (const c of v1.tracks[kind] ?? []) {
        // Stamp the row default for the kind if the clip doesn't have one.
        const row = typeof (c as Clip).row === "number" ? (c as Clip).row : DEFAULT_ROW[kind];
        clips.push({ ...c, row });
      }
    }
    return { version: 2, clips };
  }
  // Unknown version — best effort: treat as empty.
  return { version: 2, clips: [] };
}

export function totalDurationMs(overlay: EditOverlay): number {
  let max = 0;
  for (const c of overlay.clips) {
    max = Math.max(max, c.start_ms + c.duration_ms);
  }
  return max;
}

/** Number of rows = max row index + 1, with a minimum of 4. */
export function rowCount(overlay: EditOverlay): number {
  let max = 0;
  for (const c of overlay.clips) max = Math.max(max, c.row);
  return Math.max(4, max + 1);
}

export function findClip(overlay: EditOverlay, clipId: string): Clip | null {
  return overlay.clips.find((c) => c.id === clipId) ?? null;
}

export function patchClip(
  overlay: EditOverlay,
  clipId: string,
  patch: Partial<Clip>,
): EditOverlay {
  return {
    ...overlay,
    clips: overlay.clips.map((c) => (c.id === clipId ? ({ ...c, ...patch } as Clip) : c)),
  };
}

export function addClip(overlay: EditOverlay, clip: Clip): EditOverlay {
  return { ...overlay, clips: [...overlay.clips, clip] };
}

export function removeClip(overlay: EditOverlay, clipId: string): EditOverlay {
  return { ...overlay, clips: overlay.clips.filter((c) => c.id !== clipId) };
}

/** Minimum duration of either half after a split, in ms. Mirrors SNAP_MS in
 *  the timeline UI so the user can never produce a sub-snap fragment. */
export const SPLIT_MIN_MS = 250;

/** Split `clip` at `splitMs` (absolute, ms). Returns the new overlay plus
 *  the id of the right-hand clip so the caller can keep selection sensible.
 *  No-op (returns null) when:
 *    - the clip doesn't exist
 *    - the split position is outside the clip body
 *    - either resulting half would be shorter than SPLIT_MIN_MS
 *  The right-half copies all kind-specific fields verbatim — for video/voice
 *  both halves keep the same `step_id` (they're literally two windows on the
 *  same source). The left half keeps the original fade-in and gets a fade-out
 *  of 0; the right half mirrors that for fade-out. Locked clips are not split. */
export function splitClip(
  overlay: EditOverlay,
  clipId: string,
  splitMs: number,
): { overlay: EditOverlay; rightId: string } | null {
  const idx = overlay.clips.findIndex((c) => c.id === clipId);
  if (idx < 0) return null;
  const orig = overlay.clips[idx];
  if (orig.locked) return null;
  const localMs = Math.round(splitMs - orig.start_ms);
  const leftDur = localMs;
  const rightDur = orig.duration_ms - localMs;
  if (leftDur < SPLIT_MIN_MS || rightDur < SPLIT_MIN_MS) return null;

  const rightId = nextClipId(`${orig.kind}-split`);
  const left: Clip = {
    ...orig,
    duration_ms: leftDur,
    fade_out_ms: 0,
  };
  const right: Clip = {
    ...orig,
    id: rightId,
    start_ms: orig.start_ms + leftDur,
    duration_ms: rightDur,
    fade_in_ms: 0,
  };
  // A "match_source_length" video clip is a window on its mp4 source; once we
  // split it we can no longer claim it covers the full source — flip both
  // halves to manual length so a future re-render doesn't snap them back.
  if (orig.kind === "video" && (left as VideoClip).match_source_length) {
    (left as VideoClip).match_source_length = false;
    (right as VideoClip).match_source_length = false;
  }
  // Continue source playback across the cut: the right half resumes where
  // the left ended in the underlying mp3/mp4. Without this, splitting a
  // 4s video at 2s would make the right half replay the source from 0.
  if (orig.kind === "video" || orig.kind === "voice") {
    const baseOffset = (orig as VideoClip | VoiceClip).source_offset_ms ?? 0;
    (right as VideoClip | VoiceClip).source_offset_ms = baseOffset + leftDur;
  }
  const clips = overlay.clips.slice();
  clips[idx] = left;
  clips.splice(idx + 1, 0, right);
  return { overlay: { ...overlay, clips }, rightId };
}

let counter = 0;
export function nextClipId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
