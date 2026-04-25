"use client";

// Render the overlay as a live composition. Per-clip video elements
// swap based on the playhead; per-clip audio elements mix in narration
// alongside any music; typed/caption/banana clips render as HTML
// overlays. Replaces the master.mp4 video preview so the user sees
// what's actually on the timeline, not the baked file.

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
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
  /** Bumped after asset re-synth so audio/video src= queries bust cache. */
  assetVersion?: number;
  /** Currently selected clip id — used to enable inline-edit on typed clips. */
  selectedClipId?: string | null;
  /** Patch a clip from inside the canvas (e.g. inline edit of typed text). */
  onPatchClip?: (id: string, patch: Partial<Clip>) => void;
  onTimeUpdate: (t: number) => void;
  onPlayStateChange: (playing: boolean) => void;
}

const TYPED_BG_PRESETS = new Set([
  "aurora-amber",
  "aurora-pink",
  "aurora-blue",
  "aurora-mint",
  "aurora-graphite",
  "void",
  "paper",
]);

function inRange(c: { start_ms: number; duration_ms: number }, tMs: number) {
  return tMs >= c.start_ms && tMs < c.start_ms + c.duration_ms;
}

export const LivePreview = forwardRef<LivePreviewHandle, Props>(function LivePreview(
  p, handleRef,
) {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const [missingSrc, setMissingSrc] = useState<Record<string, boolean>>({});
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
            poster={v.poster_url ?? undefined}
            preload="metadata"
            playsInline
            muted={activeVideo?.id !== v.id}
            onError={() => setMissingSrc((m) => (m[v.id] ? m : { ...m, [v.id]: true }))}
            onLoadedMetadata={() => setMissingSrc((m) => (m[v.id] ? { ...m, [v.id]: false } : m))}
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

        {/* Suggestion fallback — when the active video has no recorded mp4
            yet, show its still + narration so the user can preview the
            block before retake. */}
        {activeVideo && missingSrc[activeVideo.id] && (activeVideo.poster_url || activeVideo.placeholder_text) ? (
          <div className="live-video-placeholder">
            {activeVideo.poster_url ? (
              <div
                className="live-video-placeholder-bg"
                style={{ backgroundImage: `url(${activeVideo.poster_url})` }}
              />
            ) : null}
            <div className="live-video-placeholder-shade" />
            <div className="live-video-placeholder-card">
              <div className="live-video-placeholder-tag">NEEDS RETAKE</div>
              <div className="live-video-placeholder-title">{activeVideo.step_id}</div>
              {activeVideo.placeholder_text ? (
                <p className="live-video-placeholder-narration">{activeVideo.placeholder_text}</p>
              ) : null}
              <div className="live-video-placeholder-help">
                Source <span className="ci-mono">{activeVideo.step_id}.mp4</span> isn&apos;t recorded yet.
                Run a retake to capture it.
              </div>
            </div>
          </div>
        ) : null}

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
          <TypedClipView
            key={t.id}
            clip={t}
            tMs={tMs}
            isSelected={p.selectedClipId === t.id}
            onPatch={p.onPatchClip}
          />
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
            key={`${vo.id}-${p.assetVersion ?? 0}`}
            ref={(el) => { audioRefs.current[vo.id] = el; }}
            src={`/walkthroughs/${p.walkthroughId}/steps/${vo.step_id}.narration.mp3${p.assetVersion ? `?v=${p.assetVersion}` : ""}`}
            preload="auto"
          />
        ))}
      </div>
    </div>
  );
});

// Typed clip — renders the gradient bg + animated text + inline-edit
// affordance when the clip is selected. Pulled out so the editing state
// can live in local component state without polluting LivePreview.
function TypedClipView({
  clip,
  tMs,
  isSelected,
  onPatch,
}: {
  clip: TypedClip;
  tMs: number;
  isSelected: boolean;
  onPatch?: (id: string, patch: Partial<Clip>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(clip.strings.join("\n"));
  const isPreset = TYPED_BG_PRESETS.has(clip.bg_color);

  const presetClass = isPreset ? `has-bg-preset bg-${clip.bg_color}` : "";
  const editableClass = isSelected && onPatch ? "is-editable" : "";

  const inlineStyle: React.CSSProperties = {
    fontFamily: clip.font_family,
    fontSize: clip.font_size_px,
    color: clip.color,
    ...(isPreset
      ? {}
      : { background: clip.bg_color === "transparent" ? "transparent" : clip.bg_color }),
  };

  function commit() {
    if (!onPatch) return setEditing(false);
    const lines = draft.split("\n").map((l) => l).filter((l) => l.length > 0);
    onPatch(clip.id, { strings: lines.length > 0 ? lines : [draft] });
    setEditing(false);
  }

  return (
    <div
      className={`live-typed align-${clip.align} ${presetClass} ${editableClass}`}
      style={inlineStyle}
    >
      {isSelected && onPatch && !editing ? (
        <button
          type="button"
          className="live-typed-edit-btn"
          onClick={(e) => {
            e.stopPropagation();
            setDraft(clip.strings.join("\n"));
            setEditing(true);
          }}
        >
          ✎ edit
        </button>
      ) : null}

      {editing ? (
        <textarea
          autoFocus
          className="live-typed-editor"
          value={draft}
          rows={Math.max(1, draft.split("\n").length)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setEditing(false);
            }
          }}
        />
      ) : (
        <TypedText
          strings={clip.strings}
          loop={clip.loop}
          showCursor={clip.show_cursor}
          cursorChar={clip.cursor_char}
          typeSpeed={clip.type_speed_ms}
          backSpeed={clip.back_speed_ms}
          resetKey={`${clip.id}-${tMs >= clip.start_ms ? "live" : "idle"}`}
        />
      )}
    </div>
  );
}
