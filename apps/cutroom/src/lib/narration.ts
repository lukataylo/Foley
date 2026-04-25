// Continuous-narration data model.
//
// Variant A of the timeline ships a single waveform that spans the entire
// duration instead of one waveform per voice clip. This module owns the data
// shape and the fall-back logic that lets the UI render that view *now* using
// the per-step waveforms we already have on disk — so the change is visible
// before the director's continuous-synth pipeline lands.
//
// When the director's continuous render is wired up (later phase), it will
// drop a `narration.timing.json` + `narration.waveform.json` next to the
// walkthrough.yaml; loadContinuousNarration prefers those over the synthesized
// fallback automatically.

import type { TrackEntry } from "@/app/takes/[id]/EditorShell";

export interface ContinuousNarration {
  /** Total duration covered by the continuous take, in ms. */
  duration_ms: number;
  /**
   * One peaks array spanning duration_ms — sample positions are linearly
   * proportional to the audio timeline (peaks[i] ≈ amplitude at
   * i / peaks.length × duration_ms).
   */
  peaks: number[];
  /** /walkthroughs/<id>/narration.mp3 when the real continuous take exists. */
  audio_url: string | null;
  /**
   * Per-step alignment — where each step's words land in the continuous audio.
   * Synthesised from per-step durations when the real timing JSON isn't here
   * yet; replaced by ElevenLabs character-timing data once that pipeline runs.
   */
  steps: Array<{ step_id: string; start_ms: number; end_ms: number }>;
  /**
   * "real" — narration.mp3 + narration.timing.json on disk.
   * "synthesized" — derived from per-step waveforms; fine for the visual but
   * the audio is still per-step, not one continuous take.
   */
  source: "real" | "synthesized";
}

/**
 * Build a ContinuousNarration view from per-step TrackEntry data. This is the
 * fallback the UI uses until a real continuous synth has run for this
 * walkthrough.
 */
export function synthesizeContinuousFromTracks(
  tracks: TrackEntry[],
  stepStartsMs: number[],
): ContinuousNarration {
  const peaks: number[] = [];
  const steps: ContinuousNarration["steps"] = [];

  let totalMs = 0;
  for (let i = 0; i < tracks.length; i++) {
    const t = tracks[i];
    const start = stepStartsMs[i] ?? totalMs;
    const end = start + t.duration_ms;
    steps.push({ step_id: t.id, start_ms: start, end_ms: end });
    totalMs = Math.max(totalMs, end);
    if (t.waveform?.peaks?.length) peaks.push(...t.waveform.peaks);
  }

  return {
    duration_ms: totalMs,
    peaks,
    audio_url: null,
    steps,
    source: "synthesized",
  };
}

/**
 * Take a slice of the continuous waveform that corresponds to a clip occupying
 * [start_ms, start_ms + duration_ms). When the clip extends beyond the
 * continuous take's duration, we tail with zeros so the lane still renders.
 */
export function slicePeaks(
  cn: ContinuousNarration,
  start_ms: number,
  duration_ms: number,
): number[] {
  if (!cn.peaks.length || cn.duration_ms <= 0) return [];
  const startFrac = Math.max(0, start_ms) / cn.duration_ms;
  const endFrac = Math.min(1, (start_ms + duration_ms) / cn.duration_ms);
  if (endFrac <= startFrac) return [];

  const startIdx = Math.floor(startFrac * cn.peaks.length);
  const endIdx = Math.min(cn.peaks.length, Math.ceil(endFrac * cn.peaks.length));
  return cn.peaks.slice(startIdx, endIdx);
}
