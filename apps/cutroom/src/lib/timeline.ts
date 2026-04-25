// EditOverlay — the editorial layer that survives source regeneration.
//
// Source = captured/baked artifacts on disk (steps/<id>.mp4, narration audio,
// master.mp4). EditOverlay = a JSON file the editor owns that says where each
// piece sits on the timeline, plus user-applied tweaks (length override,
// fade in/out, volume, zoom, position). When the director regenerates a
// step's source, the overlay entry for that step is preserved.
//
// All times in milliseconds. id strings are stable across saves so React
// state and cross-references stay coherent.

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
  start_ms: number;
  duration_ms: number;
  fade_in_ms: number;
  fade_out_ms: number;
  volume: number;       // 0..1 (only used by video/voice/music)
  locked?: boolean;
  /** sha256 of the source asset *at the time the user last edited this clip*. */
  source_sha256_at_edit?: string | null;
}

export interface VideoClip extends ClipBase {
  kind: "video";
  step_id: string;             // reference into walkthrough.steps[].id
  zoom_enabled: boolean;
  zoom_factor: number;         // 1.0 .. 3.0
  zoom_origin_x: number;       // 0..100
  zoom_origin_y: number;       // 0..100
  /** if true, the clip resizes to match the source — otherwise length is locked. */
  match_source_length: boolean;
}

export interface VoiceClip extends ClipBase {
  kind: "voice";
  step_id: string;
}

export interface MusicClip extends ClipBase {
  kind: "music";
  asset_url: string;
  /** display name for the inspector */
  label: string;
  loop: boolean;
}

export interface TransitionClip extends ClipBase {
  kind: "transition";
  /** points into the existing transitions.json by id */
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
  /** populated after generation — empty until the user clicks Generate */
  asset_url: string;
  layout: "fullscreen" | "lower-third" | "corner";
  ref_step_id?: string | null;
}

export interface TypedClip extends ClipBase {
  kind: "typed";
  strings: string[];          // typed.js strings
  font_family: string;
  font_size_px: number;
  color: string;
  bg_color: string;           // "transparent" allowed
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
  version: 1;
  /**
   * Tracks render top-to-bottom. The shape is open to support multiple
   * stacked tracks per kind (the user asked for "stack videos on top of each
   * other") — the renderer only cares about start_ms/duration_ms within
   * each track's clip list.
   */
  tracks: {
    video: VideoClip[];
    voice: VoiceClip[];
    music: MusicClip[];
    transition: TransitionClip[];
    caption: CaptionClip[];
    banana: BananaClip[];
    typed: TypedClip[];
  };
}

export const TRACK_ORDER: (keyof EditOverlay["tracks"])[] = [
  "video",
  "voice",
  "music",
  "transition",
  "caption",
  "banana",
  "typed",
];

export const TRACK_LABEL: Record<keyof EditOverlay["tracks"], string> = {
  video: "Video",
  voice: "Voice",
  music: "Music",
  transition: "Trans",
  caption: "Captions",
  banana: "Banana",
  typed: "Typed",
};

export const TRACK_GLYPH: Record<keyof EditOverlay["tracks"], string> = {
  video: "🎬",
  voice: "🎤",
  music: "🎵",
  transition: "✨",
  caption: "📝",
  banana: "🍌",
  typed: "⌨",
};

/** Synthesize a fresh overlay from a walkthrough's authored steps. */
export function synthesizeOverlay(wt: Walkthrough): EditOverlay {
  let cursor = 0;
  const video: VideoClip[] = [];
  const voice: VoiceClip[] = [];
  for (const step of wt.steps) {
    const dur = step.duration_ms;
    video.push({
      id: `v-${step.id}`,
      kind: "video",
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
    voice.push({
      id: `vo-${step.id}`,
      kind: "voice",
      step_id: step.id,
      start_ms: cursor,
      duration_ms: dur,
      fade_in_ms: 0,
      fade_out_ms: 0,
      volume: 1.0,
    });
    cursor += dur;
  }
  return {
    version: 1,
    tracks: {
      video,
      voice,
      music: [],
      transition: [],
      caption: [],
      banana: [],
      typed: [],
    },
  };
}

export function totalDurationMs(overlay: EditOverlay): number {
  let max = 0;
  for (const k of TRACK_ORDER) {
    for (const c of overlay.tracks[k]) {
      max = Math.max(max, c.start_ms + c.duration_ms);
    }
  }
  return max;
}

/** Lookup a clip across all tracks. */
export function findClip(
  overlay: EditOverlay,
  clipId: string,
): { clip: Clip; track: keyof EditOverlay["tracks"] } | null {
  for (const k of TRACK_ORDER) {
    const list = overlay.tracks[k] as Clip[];
    const c = list.find((x) => x.id === clipId);
    if (c) return { clip: c, track: k };
  }
  return null;
}

/** Immutable replace of one clip in place. */
export function patchClip(
  overlay: EditOverlay,
  clipId: string,
  patch: Partial<Clip>,
): EditOverlay {
  const next = structuredClone(overlay) as EditOverlay;
  for (const k of TRACK_ORDER) {
    const list = next.tracks[k] as Clip[];
    const i = list.findIndex((x) => x.id === clipId);
    if (i >= 0) {
      list[i] = { ...list[i], ...patch } as Clip;
      return next;
    }
  }
  return overlay;
}

export function addClip<K extends keyof EditOverlay["tracks"]>(
  overlay: EditOverlay,
  track: K,
  clip: EditOverlay["tracks"][K][number],
): EditOverlay {
  const next = structuredClone(overlay) as EditOverlay;
  (next.tracks[track] as Clip[]).push(clip as Clip);
  return next;
}

export function removeClip(overlay: EditOverlay, clipId: string): EditOverlay {
  const next = structuredClone(overlay) as EditOverlay;
  const tracks = next.tracks as Record<string, Clip[]>;
  for (const k of TRACK_ORDER) {
    tracks[k] = (tracks[k] as Clip[]).filter((c) => c.id !== clipId);
  }
  return next;
}

let counter = 0;
export function nextClipId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}
