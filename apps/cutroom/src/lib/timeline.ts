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
}

export interface VoiceClip extends ClipBase {
  kind: "voice";
  step_id: string;
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

let counter = 0;
export function nextClipId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
