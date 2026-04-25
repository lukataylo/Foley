"use client";

// Live music playback during preview. The master.mp4 has narration baked
// in but no music — the editorial music tracks live in timeline.json and
// are only mixed in at export. To make preview honest, render one hidden
// <audio> per music clip and sync them to the master video's playback
// state. The user hears narration + music exactly as the export will.

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { MusicClip } from "@/lib/timeline";

export interface MusicMixerHandle {
  /** Imperative play — call from the video's onPlay handler so the
   *  click gesture extends to the audio elements (autoplay safety). */
  syncPlay: () => void;
  syncPause: () => void;
  syncSeek: (sec: number) => void;
}

interface Props {
  clips: MusicClip[];
  /** The master video's currentTime, in seconds. Updated by parent on
   *  timeupdate (~4Hz) — we only re-seek when drift > 0.3s so we don't
   *  thrash. */
  currentTime: number;
  isPlaying: boolean;
}

export const MusicMixer = forwardRef<MusicMixerHandle, Props>(function MusicMixer(
  { clips, currentTime, isPlaying },
  handleRef,
) {
  const refs = useRef<Record<string, HTMLAudioElement | null>>({});

  useImperativeHandle(handleRef, () => ({
    syncPlay() {
      for (const m of clips) {
        const a = refs.current[m.id];
        if (!a || !m.asset_url) continue;
        const startS = m.start_ms / 1000;
        const endS = startS + m.duration_ms / 1000;
        if (currentTime >= startS && currentTime < endS) {
          a.currentTime = Math.max(0, currentTime - startS);
          void a.play().catch(() => {});
        }
      }
    },
    syncPause() {
      for (const m of clips) {
        const a = refs.current[m.id];
        if (a && !a.paused) a.pause();
      }
    },
    syncSeek(sec: number) {
      for (const m of clips) {
        const a = refs.current[m.id];
        if (!a || !m.asset_url) continue;
        const startS = m.start_ms / 1000;
        const endS = startS + m.duration_ms / 1000;
        const inRange = sec >= startS && sec < endS;
        if (inRange) a.currentTime = Math.max(0, sec - startS);
        else if (!a.paused) a.pause();
      }
    },
  }), [clips, currentTime]);

  // Keep each audio element in sync with the master.
  useEffect(() => {
    for (const m of clips) {
      const a = refs.current[m.id];
      if (!a || !m.asset_url) continue;
      const startS = m.start_ms / 1000;
      const endS = startS + m.duration_ms / 1000;
      const inRange = currentTime >= startS && currentTime < endS;
      const localPos = Math.max(0, currentTime - startS);

      // Volume + fades — applied per-frame by setting a.volume.
      const fiS = m.fade_in_ms / 1000;
      const foS = m.fade_out_ms / 1000;
      const remaining = endS - currentTime;
      let gain = m.volume;
      if (fiS > 0 && localPos < fiS) gain *= localPos / fiS;
      if (foS > 0 && remaining < foS) gain *= Math.max(0, remaining) / foS;
      a.volume = Math.max(0, Math.min(1, gain));

      if (inRange && isPlaying) {
        // Correct drift only when it's noticeable; setting currentTime
        // every tick stutters playback.
        if (Math.abs(a.currentTime - localPos) > 0.3) a.currentTime = localPos;
        if (a.paused) void a.play().catch(() => {});
      } else {
        if (!a.paused) a.pause();
        // When the playhead is parked inside the clip but video is
        // paused, hold the audio at the matching offset for resume.
        if (inRange && Math.abs(a.currentTime - localPos) > 0.3) {
          a.currentTime = localPos;
        }
      }
    }
  }, [clips, currentTime, isPlaying]);

  return (
    <div style={{ display: "none" }} aria-hidden="true">
      {clips.map((m) =>
        m.asset_url ? (
          <audio
            key={m.id}
            ref={(el) => { refs.current[m.id] = el; }}
            src={m.asset_url.split("?")[0]}
            preload="auto"
          />
        ) : null,
      )}
    </div>
  );
});
