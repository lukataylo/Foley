"use client";

// Render the overlay as a live composition. Per-clip video elements
// swap based on the playhead; per-clip audio elements mix in narration
// alongside any music; typed/caption/banana clips render as HTML
// overlays. Replaces the master.mp4 video preview so the user sees
// what's actually on the timeline, not the baked file.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from "react";
import type {
  BananaClip,
  CaptionClip,
  Clip,
  EditOverlay,
  TypedClip,
  VideoClip,
  VoiceClip,
} from "@/lib/timeline";
import { TypedText } from "@/components/TypedText";

export interface LivePreviewHandle {
  syncPlay: () => void;
  syncPause: () => void;
  syncSeek: (sec: number) => void;
  /** Browser play/pause from external controls. */
  play: () => void;
  pause: () => void;
}

interface Props {
  overlay: EditOverlay;
  walkthroughId: string;
  currentTime: number;
  isPlaying: boolean;
  videoStyle?: React.CSSProperties;
  onTimeUpdate: (t: number) => void;
  onPlayStateChange: (playing: boolean) => void;
}

function inRange(c: { start_ms: number; duration_ms: number }, tMs: number) {
  return tMs >= c.start_ms && tMs < c.start_ms + c.duration_ms;
}

export const LivePreview = forwardRef<LivePreviewHandle, Props>(function LivePreview(
  p, handleRef,
) {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const tMs = p.currentTime * 1000;

  // Partition clips by kind once per overlay.
  const { videos, voices, typeds, captions, bananas } = useMemo(() => {
    const v: VideoClip[] = []; const vo: VoiceClip[] = [];
    const ty: TypedClip[] = []; const ca: CaptionClip[] = []; const ba: BananaClip[] = [];
    for (const c of p.overlay.clips) {
      if (c.kind === "video") v.push(c);
      else if (c.kind === "voice") vo.push(c);
      else if (c.kind === "typed") ty.push(c);
      else if (c.kind === "caption") ca.push(c);
      else if (c.kind === "banana") ba.push(c);
    }
    return { videos: v, voices: vo, typeds: ty, captions: ca, bananas: ba };
  }, [p.overlay]);

  // Active video at the playhead — lowest row index wins (front in z-order
  // for the canvas; we still pick exactly one to play).
  const activeVideo = useMemo<VideoClip | null>(() => {
    const candidates = videos.filter((c) => inRange(c, tMs));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.row - b.row || a.start_ms - b.start_ms);
    return candidates[0];
  }, [videos, tMs]);

  // Active overlays
  const activeTyped = useMemo(() => typeds.filter((c) => inRange(c, tMs)), [typeds, tMs]);
  const activeCaption = useMemo(() => captions.find((c) => inRange(c, tMs)) ?? null, [captions, tMs]);
  const activeBanana = useMemo(() => bananas.find((c) => inRange(c, tMs)) ?? null, [bananas, tMs]);

  // Sync video elements: pause inactive, play+seek active.
  useEffect(() => {
    for (const v of videos) {
      const el = videoRefs.current[v.id];
      if (!el) continue;
      const isActive = activeVideo?.id === v.id;
      if (isActive) {
        const localPos = (tMs - v.start_ms) / 1000;
        if (Math.abs(el.currentTime - localPos) > 0.3) el.currentTime = localPos;
        if (p.isPlaying && el.paused) void el.play().catch(() => {});
        if (!p.isPlaying && !el.paused) el.pause();
      } else if (!el.paused) {
        el.pause();
      }
    }
  }, [videos, activeVideo, tMs, p.isPlaying]);

  // Sync voice elements
  useEffect(() => {
    for (const vo of voices) {
      const el = audioRefs.current[vo.id];
      if (!el) continue;
      const active = inRange(vo, tMs);
      if (active) {
        const localPos = (tMs - vo.start_ms) / 1000;
        if (Math.abs(el.currentTime - localPos) > 0.3) el.currentTime = localPos;
        // Linear fades + base volume.
        const fi = vo.fade_in_ms / 1000;
        const fo = vo.fade_out_ms / 1000;
        const fromStart = (tMs - vo.start_ms) / 1000;
        const remaining = (vo.start_ms + vo.duration_ms - tMs) / 1000;
        let gain = vo.volume;
        if (fi > 0 && fromStart < fi) gain *= fromStart / fi;
        if (fo > 0 && remaining < fo) gain *= Math.max(0, remaining) / fo;
        el.volume = Math.max(0, Math.min(1, gain));
        if (p.isPlaying && el.paused) void el.play().catch(() => {});
        if (!p.isPlaying && !el.paused) el.pause();
      } else if (!el.paused) {
        el.pause();
      }
    }
  }, [voices, tMs, p.isPlaying]);

  // External imperative handle so the editor's keyboard/spacebar/timeline
  // bar can drive playback without going through the native <video> controls.
  useImperativeHandle(handleRef, () => ({
    play() {
      const el = activeVideo ? videoRefs.current[activeVideo.id] : null;
      if (el) void el.play().catch(() => {});
      p.onPlayStateChange(true);
    },
    pause() {
      for (const v of videos) videoRefs.current[v.id]?.pause();
      for (const vo of voices) audioRefs.current[vo.id]?.pause();
      p.onPlayStateChange(false);
    },
    syncPlay() {
      // For each currently in-range clip, kick play (preserves user gesture).
      const v = activeVideo;
      if (v) {
        const el = videoRefs.current[v.id];
        if (el) {
          el.currentTime = Math.max(0, (tMs - v.start_ms) / 1000);
          void el.play().catch(() => {});
        }
      }
      for (const vo of voices) {
        if (!inRange(vo, tMs)) continue;
        const el = audioRefs.current[vo.id];
        if (!el) continue;
        el.currentTime = Math.max(0, (tMs - vo.start_ms) / 1000);
        void el.play().catch(() => {});
      }
    },
    syncPause() {
      for (const v of videos) videoRefs.current[v.id]?.pause();
      for (const vo of voices) audioRefs.current[vo.id]?.pause();
    },
    syncSeek(sec: number) {
      const ms = sec * 1000;
      for (const v of videos) {
        const el = videoRefs.current[v.id];
        if (!el) continue;
        if (inRange(v, ms)) el.currentTime = Math.max(0, (ms - v.start_ms) / 1000);
        else if (!el.paused) el.pause();
      }
      for (const vo of voices) {
        const el = audioRefs.current[vo.id];
        if (!el) continue;
        if (inRange(vo, ms)) el.currentTime = Math.max(0, (ms - vo.start_ms) / 1000);
        else if (!el.paused) el.pause();
      }
    },
  }), [videos, voices, activeVideo, tMs, p]);

  return (
    <div className="live-preview">
      {/* Video stack — only the active one is visible. */}
      <div className="live-preview-stack" style={p.videoStyle}>
        {videos.map((v) => (
          <video
            key={v.id}
            ref={(el) => { videoRefs.current[v.id] = el; }}
            src={`/walkthroughs/${p.walkthroughId}/steps/${v.step_id}.mp4`}
            preload="metadata"
            playsInline
            muted={activeVideo?.id !== v.id}
            onTimeUpdate={(e) => {
              if (activeVideo?.id !== v.id) return;
              const local = (e.currentTarget as HTMLVideoElement).currentTime;
              p.onTimeUpdate(v.start_ms / 1000 + local);
            }}
            onPlay={() => { if (activeVideo?.id === v.id) p.onPlayStateChange(true); }}
            onPause={() => { if (activeVideo?.id === v.id) p.onPlayStateChange(false); }}
            className={`live-video ${activeVideo?.id === v.id ? "live-video-active" : ""}`}
          />
        ))}
        {videos.length === 0 ? (
          <div className="live-preview-empty">
            No video clips on the timeline. Use <strong>+ Add</strong> to drop one in.
          </div>
        ) : null}

        {/* Banana overlay (image) */}
        {activeBanana && activeBanana.asset_url ? (
          <div className={`live-banana layout-${activeBanana.layout}`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={activeBanana.asset_url} alt="" />
          </div>
        ) : null}

        {/* Typed text overlays */}
        {activeTyped.map((t) => (
          <div
            key={t.id}
            className={`live-typed align-${t.align}`}
            style={{
              fontFamily: t.font_family,
              fontSize: t.font_size_px,
              color: t.color,
              background: t.bg_color === "transparent" ? "transparent" : t.bg_color,
            }}
          >
            <TypedText
              strings={t.strings}
              loop={t.loop}
              showCursor={t.show_cursor}
              cursorChar={t.cursor_char}
              typeSpeed={t.type_speed_ms}
              backSpeed={t.back_speed_ms}
              resetKey={`${t.id}-${tMs >= t.start_ms ? "live" : "idle"}`}
            />
          </div>
        ))}

        {/* Caption */}
        {activeCaption ? (
          <div className={`live-caption align-${activeCaption.align}`}>
            {activeCaption.text}
          </div>
        ) : null}
      </div>

      {/* Hidden audio elements per voice clip */}
      <div style={{ display: "none" }}>
        {voices.map((vo) => (
          <audio
            key={vo.id}
            ref={(el) => { audioRefs.current[vo.id] = el; }}
            src={`/walkthroughs/${p.walkthroughId}/steps/${vo.step_id}.narration.mp3`}
            preload="auto"
          />
        ))}
      </div>
    </div>
  );
});
