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
  TransitionClip,
  TypedClip,
  VideoClip,
  VoiceClip,
} from "@/lib/timeline";
import type { ContinuousNarration } from "@/lib/narration";
import type { TransitionSpec } from "@/lib/transitions";
import { TypedText } from "@/components/TypedText";
import { TransitionSlide } from "@/components/TransitionSlide";

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
  /**
   * Continuous narration take. When `narration.audio_url` is present we play
   * one master <audio> spanning the whole timeline instead of swapping per-step
   * audio elements at every boundary — that swap was the audible pause.
   */
  narration?: ContinuousNarration | null;
  /**
   * Transition specs (title cards, angled mockups, feature zooms). When a
   * transition clip on the overlay is in range we look up its spec by id and
   * mount a TransitionSlide on top of the video stack. Without this map the
   * overlay clips are inert during playback.
   */
  transitions?: TransitionSpec[];
  /**
   * step_id → public PNG url so transition screenshot placements resolve. The
   * editor builds this from the same `tracks` array it uses elsewhere.
   */
  framesByStepId?: Record<string, string>;
  /** Playback rate (1.0 = real time). Applied to the active video and the
   *  master audio so the user can scrub at half/double speed. */
  speed?: number;
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

/** Keep voices natural-sounding at 1.5x/2x by enabling pitch preservation.
 *  Spelled differently across browsers — Safari uses webkitPreservesPitch. */
function setPreservesPitch(el: HTMLMediaElement): void {
  const pe = el as unknown as { preservesPitch?: boolean; webkitPreservesPitch?: boolean };
  if (typeof pe.preservesPitch === "boolean" || "preservesPitch" in pe) {
    pe.preservesPitch = true;
  }
  if (typeof pe.webkitPreservesPitch === "boolean" || "webkitPreservesPitch" in pe) {
    pe.webkitPreservesPitch = true;
  }
}

export const LivePreview = forwardRef<LivePreviewHandle, Props>(function LivePreview(
  p, handleRef,
) {
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});
  const masterAudioRef = useRef<HTMLAudioElement | null>(null);
  const [missingSrc, setMissingSrc] = useState<Record<string, boolean>>({});
  const tMs = p.currentTime * 1000;
  const masterAudioUrl = p.narration?.audio_url ?? null;

  // Partition clips by kind once per overlay.
  const { videos, voices, typeds, captions, bananas, transitions } = useMemo(() => {
    const v: VideoClip[] = []; const vo: VoiceClip[] = [];
    const ty: TypedClip[] = []; const ca: CaptionClip[] = []; const ba: BananaClip[] = [];
    const tr: TransitionClip[] = [];
    for (const c of p.overlay.clips) {
      if (c.kind === "video") v.push(c);
      else if (c.kind === "voice") vo.push(c);
      else if (c.kind === "typed") ty.push(c);
      else if (c.kind === "caption") ca.push(c);
      else if (c.kind === "banana") ba.push(c);
      else if (c.kind === "transition") tr.push(c);
    }
    return { videos: v, voices: vo, typeds: ty, captions: ca, bananas: ba, transitions: tr };
  }, [p.overlay]);

  // Active video at the playhead — lowest row index wins (front in z-order
  // for the canvas; we still pick exactly one to play).
  const activeVideo = useMemo<VideoClip | null>(() => {
    const candidates = videos.filter((c) => inRange(c, tMs));
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => a.row - b.row || a.start_ms - b.start_ms);
    return candidates[0];
  }, [videos, tMs]);

  // Active overlays. A typed clip with a higher row index than the active
  // video is "behind" it (row 0 = front in z-order) so we hide it; this
  // mirrors how moving a typed clip below the video on the timeline reads.
  const activeTyped = useMemo(
    () => typeds.filter((c) => {
      if (!inRange(c, tMs)) return false;
      if (activeVideo && c.row > activeVideo.row) return false;
      return true;
    }),
    [typeds, tMs, activeVideo],
  );
  const activeCaption = useMemo(() => captions.find((c) => inRange(c, tMs)) ?? null, [captions, tMs]);
  const activeBanana = useMemo(() => bananas.find((c) => inRange(c, tMs)) ?? null, [bananas, tMs]);
  // Transitions are full-screen takeovers — when one is in range we render
  // its TransitionSlide on top of the video stack. The slide's resetKey is
  // bound to the clip's start_ms so the typed-text animation restarts every
  // time the clip enters range (instead of carrying state across plays).
  const activeTransition = useMemo<TransitionClip | null>(
    () => transitions.find((c) => inRange(c, tMs)) ?? null,
    [transitions, tMs],
  );
  const activeTransitionSpec = useMemo<TransitionSpec | null>(
    () =>
      activeTransition && p.transitions
        ? p.transitions.find((t) => t.id === activeTransition.transition_id) ?? null
        : null,
    [activeTransition, p.transitions],
  );

  // Boundary-driven video play/pause. Active clip plays unmuted, others are
  // paused. Re-runs only when activeVideo identity flips or play-state
  // toggles — not every tMs tick — so we don't churn play()/pause() at
  // 60Hz. Master audio is the continuity source; a brief one-frame video
  // decoder warm-up at boundaries is acceptable.
  //
  // Pre-roll was tried (warm next clip muted) but it traded a boundary
  // stall for a 250ms skip — both worse than the current cold-start. See
  // commit history for the full justification.
  useEffect(() => {
    for (const v of videos) {
      const el = videoRefs.current[v.id];
      if (!el) continue;
      const isActive = activeVideo?.id === v.id;
      if (isActive) {
        if (p.isPlaying && el.paused) void el.play().catch(() => {});
        if (!p.isPlaying && !el.paused) el.pause();
      } else if (!el.paused) {
        el.pause();
      }
    }
  }, [videos, activeVideo, p.isPlaying]);

  // When activeVideo identity flips, reset the new clip's currentTime to
  // 0 (start of clip) before play() so it doesn't pick up wherever it was
  // last paused. Only seeks when the gap is meaningful, to avoid a
  // redundant `seek` event right before play().
  const activeVideoIdRef = useRef<string | null>(null);
  useEffect(() => {
    const newId = activeVideo?.id ?? null;
    if (newId === activeVideoIdRef.current) return;
    activeVideoIdRef.current = newId;
    if (!activeVideo) return;
    const el = videoRefs.current[activeVideo.id];
    if (!el) return;
    // Account for source_offset_ms so split clips resume mid-source instead
    // of restarting from 0.
    const offset = (activeVideo.source_offset_ms ?? 0) / 1000;
    const localPos = Math.max(0, offset + (tMs - activeVideo.start_ms) / 1000);
    if (Math.abs(el.currentTime - localPos) > 0.05) {
      el.currentTime = localPos;
    }
  }, [activeVideo, tMs]);

  // Drift-correction for the active video — runs on every tMs tick but only
  // seeks when the gap exceeds 300ms. Boundary swaps are handled above; this
  // effect only catches sustained drift within a single clip.
  useEffect(() => {
    if (!activeVideo) return;
    const el = videoRefs.current[activeVideo.id];
    if (!el) return;
    const offset = (activeVideo.source_offset_ms ?? 0) / 1000;
    const localPos = offset + (tMs - activeVideo.start_ms) / 1000;
    if (Math.abs(el.currentTime - localPos) > 0.3) el.currentTime = localPos;
  }, [activeVideo, tMs]);

  // Continuous narration: one master <audio> spanning the whole timeline.
  // Replaces the per-voice-clip audio swap that produced the audible pause.
  useEffect(() => {
    if (!masterAudioUrl) return;
    const el = masterAudioRef.current;
    if (!el) return;
    if (p.isPlaying && el.paused) void el.play().catch(() => {});
    if (!p.isPlaying && !el.paused) el.pause();
  }, [masterAudioUrl, p.isPlaying]);

  // Propagate `speed` to every video/audio element so the timeline-level
  // speed dropdown actually changes playback rate. Defaults to 1.0 when
  // unset; preservesPitch=true keeps voices natural-sounding at 1.5x/2x.
  const speed = p.speed ?? 1.0;
  useEffect(() => {
    for (const v of videos) {
      const el = videoRefs.current[v.id];
      if (el) el.playbackRate = speed;
    }
    for (const vo of voices) {
      const el = audioRefs.current[vo.id];
      if (el) {
        el.playbackRate = speed;
        // Most browsers expose preservesPitch, Safari uses webkitPreservesPitch.
        setPreservesPitch(el);
      }
    }
    if (masterAudioRef.current) {
      masterAudioRef.current.playbackRate = speed;
      setPreservesPitch(masterAudioRef.current);
    }
  }, [speed, videos, voices]);

  // Drift-correction for the master audio (only when continuous mode is on).
  // Skip when the playhead is past the audio's declared duration — the seek
  // would clamp and the audio would then yank the parent back to that
  // duration through onTimeUpdate, producing a "seek snaps back" feel
  // when the user clicks on overlay clips that extend past the narration.
  useEffect(() => {
    if (!masterAudioUrl) return;
    const el = masterAudioRef.current;
    if (!el) return;
    const audDur = el.duration || 0;
    if (audDur > 0 && p.currentTime > audDur) return;
    if (Math.abs(el.currentTime - p.currentTime) > 0.3) {
      el.currentTime = Math.max(0, p.currentTime);
    }
  }, [masterAudioUrl, p.currentTime]);

  // Per-voice-clip audio sync — only used when there is no continuous take
  // (legacy fallback). When continuous mode is on we mute these and let the
  // master audio drive playback.
  useEffect(() => {
    if (masterAudioUrl) {
      // Make sure all per-step audio is silent in continuous mode.
      for (const vo of voices) {
        const el = audioRefs.current[vo.id];
        if (el && !el.paused) el.pause();
      }
      return;
    }
    for (const vo of voices) {
      const el = audioRefs.current[vo.id];
      if (!el) continue;
      const active = inRange(vo, tMs);
      if (active) {
        const offset = (vo.source_offset_ms ?? 0) / 1000;
        const localPos = offset + (tMs - vo.start_ms) / 1000;
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
  }, [voices, tMs, p.isPlaying, masterAudioUrl]);

  // External imperative handle so the editor's keyboard/spacebar/timeline
  // bar can drive playback without going through the native <video> controls.
  useImperativeHandle(handleRef, () => ({
    play() {
      const el = activeVideo ? videoRefs.current[activeVideo.id] : null;
      if (el) void el.play().catch(() => {});
      if (masterAudioUrl && masterAudioRef.current) {
        void masterAudioRef.current.play().catch(() => {});
      }
      p.onPlayStateChange(true);
    },
    pause() {
      for (const v of videos) videoRefs.current[v.id]?.pause();
      for (const vo of voices) audioRefs.current[vo.id]?.pause();
      masterAudioRef.current?.pause();
      p.onPlayStateChange(false);
    },
    syncPlay() {
      // For each currently in-range clip, kick play (preserves user gesture).
      const v = activeVideo;
      if (v) {
        const el = videoRefs.current[v.id];
        if (el) {
          const offset = (v.source_offset_ms ?? 0) / 1000;
          el.currentTime = Math.max(0, offset + (tMs - v.start_ms) / 1000);
          void el.play().catch(() => {});
        }
      }
      if (masterAudioUrl && masterAudioRef.current) {
        masterAudioRef.current.currentTime = Math.max(0, p.currentTime);
        void masterAudioRef.current.play().catch(() => {});
      } else {
        for (const vo of voices) {
          if (!inRange(vo, tMs)) continue;
          const el = audioRefs.current[vo.id];
          if (!el) continue;
          const offset = (vo.source_offset_ms ?? 0) / 1000;
          el.currentTime = Math.max(0, offset + (tMs - vo.start_ms) / 1000);
          void el.play().catch(() => {});
        }
      }
    },
    syncPause() {
      for (const v of videos) videoRefs.current[v.id]?.pause();
      for (const vo of voices) audioRefs.current[vo.id]?.pause();
      masterAudioRef.current?.pause();
    },
    syncSeek(sec: number) {
      const ms = sec * 1000;
      for (const v of videos) {
        const el = videoRefs.current[v.id];
        if (!el) continue;
        if (inRange(v, ms)) {
          const offset = (v.source_offset_ms ?? 0) / 1000;
          el.currentTime = Math.max(0, offset + (ms - v.start_ms) / 1000);
        }
        else if (!el.paused) el.pause();
      }
      if (masterAudioUrl && masterAudioRef.current) {
        const aEl = masterAudioRef.current;
        const audDur = aEl.duration || 0;
        // If the user seeked past the audio's end, pause it instead of
        // setting currentTime — the browser would clamp the seek to the
        // audio's duration and the resulting `timeupdate` would yank the
        // parent's playhead back to that duration. We need the playhead
        // to live freely in the post-audio region (e.g. an overlay clip
        // that extends past the master narration).
        if (audDur > 0 && sec > audDur) {
          if (!aEl.paused) aEl.pause();
        } else {
          aEl.currentTime = Math.max(0, sec);
        }
      } else {
        for (const vo of voices) {
          const el = audioRefs.current[vo.id];
          if (!el) continue;
          if (inRange(vo, ms)) {
            const offset = (vo.source_offset_ms ?? 0) / 1000;
            el.currentTime = Math.max(0, offset + (ms - vo.start_ms) / 1000);
          }
          else if (!el.paused) el.pause();
        }
      }
    },
  }), [videos, voices, activeVideo, tMs, p, masterAudioUrl]);

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
            // `auto` so every clip is fully buffered before the playhead
            // reaches it. Otherwise the decoder warm-up at section
            // boundaries shows up as a visible 200–400ms freeze when the
            // new clip becomes active. Each clip is ~5–10s of H.264 — a
            // handful of MB total, fine to download up-front.
            preload="auto"
            playsInline
            muted={activeVideo?.id !== v.id}
            onError={() => setMissingSrc((m) => (m[v.id] ? m : { ...m, [v.id]: true }))}
            onLoadedMetadata={() => setMissingSrc((m) => (m[v.id] ? { ...m, [v.id]: false } : m))}
            onTimeUpdate={(e) => {
              if (activeVideo?.id !== v.id) return;
              // When continuous narration is on, the master audio drives the
              // playhead — its cadence is steadier and avoids the per-clip
              // restart blip at section boundaries.
              if (masterAudioUrl) return;
              const local = (e.currentTarget as HTMLVideoElement).currentTime;
              const offset = (v.source_offset_ms ?? 0) / 1000;
              p.onTimeUpdate(v.start_ms / 1000 + (local - offset));
            }}
            // No onPlay/onPause feedback into the parent. Videos are SLAVES
            // of the master audio's play state — listening to a video's
            // own pause event is a footgun because the browser fires `pause`
            // when the video's currentTime reaches its source duration
            // (i.e. at every section boundary), which used to cascade into
            // pausing the master audio and stalling playback at every seam.
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

        {/* Transition takeover — full-screen card on top of the video stack
            for the clip's duration. Reset key flips when the clip enters
            range so the typed-text headline restarts cleanly. */}
        {activeTransition && activeTransitionSpec ? (
          <div className="live-transition" key={`${activeTransition.id}-${activeTransition.start_ms}`}>
            {/* The outer key forces a remount when the playhead leaves and
              * re-enters a transition (or when the clip moves) so the typed
              * headline animation restarts cleanly each time. */}
            <TransitionSlide
              spec={activeTransitionSpec}
              framesByStepId={p.framesByStepId ?? {}}
              resetKey={`${activeTransition.id}-${activeTransition.start_ms}-${activeTransitionSpec.text}`}
            />
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
            isPlaying={p.isPlaying}
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

      {/* Hidden audio. Continuous take wins when present; otherwise we fall
          back to one <audio> per voice clip (the legacy per-step path). */}
      <div style={{ display: "none" }}>
        {masterAudioUrl ? (
          <audio
            ref={masterAudioRef}
            src={`${masterAudioUrl}${p.assetVersion ? `?v=${p.assetVersion}` : ""}`}
            preload="auto"
            onTimeUpdate={(e) => {
              const el = e.currentTarget as HTMLAudioElement;
              // Skip while seeking — onTimeUpdate fires with stale values
              // mid-seek and would yank the playhead back, producing the
              // "cursor jumps around" symptom while scrubbing.
              if (el.seeking) return;
              // After a seek past audio.duration the browser clamps to
              // duration, fires `ended`, then keeps emitting timeupdate at
              // that duration value. Propagating it would snap the parent's
              // playhead back, defeating clicks on overlay clips beyond
              // the narration.
              if (el.ended) return;
              p.onTimeUpdate(el.currentTime);
            }}
            onSeeking={() => {
              // Block drift correction while we're mid-seek; once `seeked`
              // fires we'll resume normal onTimeUpdate flow.
            }}
            onPlay={() => p.onPlayStateChange(true)}
            onPause={() => p.onPlayStateChange(false)}
          />
        ) : (
          voices.map((vo) => (
            <audio
              key={`${vo.id}-${p.assetVersion ?? 0}`}
              ref={(el) => { audioRefs.current[vo.id] = el; }}
              src={`/walkthroughs/${p.walkthroughId}/steps/${vo.step_id}.narration.mp3${p.assetVersion ? `?v=${p.assetVersion}` : ""}`}
              preload="auto"
            />
          ))
        )}
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
  isPlaying,
  isSelected,
  onPatch,
}: {
  clip: TypedClip;
  tMs: number;
  isPlaying: boolean;
  isSelected: boolean;
  onPatch?: (id: string, patch: Partial<Clip>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(clip.strings.join("\n"));
  // Defensive: `bg_color` should never be missing on a TypedClip but older
  // imported walkthroughs sometimes do, and the empty string would then
  // resolve to "no background" while the inspector shows "Solid color".
  const bgColor = clip.bg_color || "transparent";
  const isPreset = TYPED_BG_PRESETS.has(bgColor);
  const isSolid = !isPreset && bgColor !== "transparent";

  const presetClass = isPreset ? `has-bg-preset bg-${bgColor}` : "";
  const solidClass = isSolid ? "has-bg-solid" : "";
  const editableClass = isSelected && onPatch ? "is-editable" : "";

  const inlineStyle: React.CSSProperties = {
    fontFamily: clip.font_family,
    fontSize: clip.font_size_px,
    color: clip.color,
    // `backgroundColor` (long-hand) not the `background` shorthand — the
    // shorthand clears background-image which the preset CSS sets via
    // ::before, breaking aurora gradients on hot-update.
    ...(isPreset
      ? {}
      : isSolid
        ? { backgroundColor: bgColor }
        : { backgroundColor: "transparent" }),
  };

  function commit() {
    if (!onPatch) return setEditing(false);
    const lines = draft.split("\n").map((l) => l).filter((l) => l.length > 0);
    onPatch(clip.id, { strings: lines.length > 0 ? lines : [draft] });
    setEditing(false);
  }

  return (
    <div
      className={`live-typed align-${clip.align} ${presetClass} ${solidClass} ${editableClass}`}
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
          paused={!isPlaying}
        />
      )}
    </div>
  );
}
