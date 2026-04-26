"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TransitionSlide } from "@/components/TransitionSlide";
import type { StepDiff, Take, Walkthrough } from "@/lib/types";
import {
  defaultTransition,
  migrateTransition,
  placementsForLayout,
  layoutDefaults,
  type ScreenshotPlacement,
  type TransitionKind,
  type TransitionSpec,
} from "@/lib/transitions";

export interface StepZoom {
  enabled: boolean;
  factor: number;     // 1.0 .. 3.0
  origin_x: number;   // 0..100, % of viewport
  origin_y: number;   // 0..100
}
export const DEFAULT_STEP_ZOOM: StepZoom = {
  enabled: false,
  factor: 1.6,
  origin_x: 50,
  origin_y: 50,
};
import { Timeline } from "./Timeline";
import { Timeline2 } from "./Timeline2";
import { ChangesTimeline } from "./ChangesTimeline";
import {
  type ContinuousNarration,
  synthesizeContinuousFromTracks,
} from "@/lib/narration";
import { SuggestionsPanel } from "./SuggestionsPanel";
import { MusicMixer, type MusicMixerHandle } from "./MusicMixer";
import { LivePreview, type LivePreviewHandle } from "./LivePreview";
import type { MusicClip } from "@/lib/timeline";
import { ClipInspector } from "./ClipInspector";
import {
  type Clip,
  type ClipKind,
  type EditOverlay,
  DEFAULT_ROW,
  addClip as addClipPure,
  migrateOverlay,
  nextClipId,
  patchClip as patchClipPure,
  removeClip as removeClipPure,
} from "@/lib/timeline";

export interface TrackEntry {
  id: string;
  title: string;
  narration: string;
  duration_ms: number;
  diff_status: StepDiff["status"];
  diff_reason: string;
  frame_url: string;
  waveform: { duration_s: number; sample_rate: number; peaks: number[] } | null;
  segment_sha256: string | null;
}

export type RailTab = "steps" | "voice" | "brand" | "transitions" | "ai";

interface Props {
  takeId: string;
  walkthroughDisplayName: string;
  take: Take;
  walkthrough: Walkthrough;
  tracks: TrackEntry[];
  masterUrl: string;
  initialTransitions?: TransitionSpec[];
  /**
   * Continuous narration take loaded from disk on first render. When present
   * the timeline + LivePreview render the "river" view immediately instead of
   * falling back to the synthesized per-step approximation.
   */
  initialContinuousNarration?: ContinuousNarration | null;
}

export function EditorShell({
  takeId,
  walkthroughDisplayName,
  take,
  walkthrough,
  tracks,
  masterUrl,
  initialTransitions = [],
  initialContinuousNarration = null,
}: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicMixerRef = useRef<MusicMixerHandle>(null);
  const livePreviewRef = useRef<LivePreviewHandle>(null);

  const stepStartsMs = useMemo(() => {
    const out: number[] = [];
    let acc = 0;
    for (const t of tracks) {
      out.push(acc);
      acc += t.duration_ms;
    }
    return out;
  }, [tracks]);

  const initialStep =
    tracks.find((t) => t.diff_status === "changed" || t.diff_status === "added")?.id ??
    tracks[0]?.id ??
    null;

  const [selectedStepId, setSelectedStepId] = useState<string | null>(initialStep);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [overlay, setOverlay] = useState<EditOverlay | null>(null);

  // ── Continuous narration view ───────────────────────────────────────────
  // Until the director's continuous synth ships, fall back to a synthesized
  // view assembled from per-step waveforms. The Timeline draws one waveform
  // either way; the difference is purely in what audio backs it at render time.
  const [realContinuous, setRealContinuous] = useState<ContinuousNarration | null>(
    initialContinuousNarration,
  );
  const [voiceStale, setVoiceStale] = useState(false);
  const [voiceBusy, setVoiceBusy] = useState(false);
  const [showScriptLane, setShowScriptLane] = useState(false);

  const continuousNarration: ContinuousNarration = useMemo(
    () => realContinuous ?? synthesizeContinuousFromTracks(tracks, stepStartsMs),
    [realContinuous, tracks, stepStartsMs],
  );

  // Timeline length = max(sum of tracks, last overlay clip end). The overlay
  // tail matters when a user inserts a suggestion past the master's end —
  // without this the playhead can never reach the new clip.
  const totalDuration = useMemo(() => {
    const tracksMs = tracks.reduce((n, t) => n + t.duration_ms, 0);
    let overlayEndMs = 0;
    for (const c of overlay?.clips ?? []) {
      overlayEndMs = Math.max(overlayEndMs, c.start_ms + c.duration_ms);
    }
    return Math.max(tracksMs, overlayEndMs) / 1000;
  }, [tracks, overlay]);
  /** Canvas mode — video preview by default, transitions preview when the
   *  user opens the transitions feature, suggestion preview when previewing
   *  a proposed block from the left rail. */
  const [canvasMode, setCanvasMode] = useState<"video" | "transitions" | "suggestion">("video");
  /** Bottom panel: clip timeline vs chronological changes view. */
  const [leftMode, setLeftMode] = useState<"suggestions" | "changes">("suggestions");
  const [previewSuggestion, setPreviewSuggestion] = useState<{
    title: string;
    narration: string;
    reason: string;
    status: "added" | "changed";
    pr_title: string | null;
    pr_number: number | null;
    frame_url: string | null;
  } | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(36);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [captionsOn, setCaptionsOn] = useState(false);
  const [editNarrationTrigger, setEditNarrationTrigger] = useState(0);
  const [genaiByStep, setGenaiByStep] = useState<Record<string, string>>({});

  // Per-step zoom (Steps panel). Demo-state only — not persisted.
  const [stepZooms, setStepZooms] = useState<Record<string, StepZoom>>({});
  function patchStepZoom(stepId: string, patch: Partial<StepZoom>) {
    setStepZooms((curr) => ({
      ...curr,
      [stepId]: { ...DEFAULT_STEP_ZOOM, ...curr[stepId], ...patch },
    }));
  }

  // ─── transitions ──────────────────────────────────────────────────────
  const [transitions, setTransitions] = useState<TransitionSpec[]>(
    initialTransitions.map(migrateTransition),
  );
  const [activeTransitionId, setActiveTransitionId] = useState<string | null>(
    initialTransitions[0]?.id ?? null,
  );
  const [transitionResetKey, setTransitionResetKey] = useState(0);
  const activeTransition = transitions.find((t) => t.id === activeTransitionId) ?? null;

  // Persist transitions to disk whenever they change. Debounced via a small
  // dirty flag so rapid edits don't hammer the API.
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistTransitions = useCallback((next: TransitionSpec[]) => {
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      void fetch(`/api/takes/${takeId}/transitions?wt=${encodeURIComponent(walkthrough.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transitions: next }),
      });
    }, 350);
  }, [takeId, walkthrough.id]);

  function updateTransition(id: string, patch: Partial<TransitionSpec>) {
    setTransitions((curr) => {
      const next = curr.map((t) => (t.id === id ? { ...t, ...patch } : t));
      persistTransitions(next);
      return next;
    });
  }
  function addTransition(kind: TransitionKind = "title") {
    const t = defaultTransition(kind);
    const interesting = tracks.filter((tr) => tr.diff_status === "changed" || tr.diff_status === "added");
    const seedIds = (interesting.length >= 2 ? interesting : tracks).slice(0, 3).map((s) => s.id);
    if (kind === "title") {
      t.screenshots = placementsForLayout(t.layout, seedIds);
    } else if (kind === "angled-mockup" && t.angled) {
      t.angled.step_id = seedIds[0] ?? tracks[0]?.id ?? "";
    } else if (kind === "feature-zoom" && t.feature) {
      const target = tracks.find((tr) => tr.diff_status === "changed") ?? tracks[0];
      t.feature.step_id = target?.id ?? "";
    }
    setTransitions((curr) => {
      const next = [...curr, t];
      persistTransitions(next);
      return next;
    });
    setActiveTransitionId(t.id);
    setCanvasMode("transitions");
  }
  function removeTransition(id: string) {
    setTransitions((curr) => {
      const next = curr.filter((t) => t.id !== id);
      persistTransitions(next);
      return next;
    });
    if (activeTransitionId === id) {
      setActiveTransitionId(null);
    }
  }

  // Re-snap all screenshots to the current layout's defaults.
  function relayoutTransition(id: string, nextLayout: TransitionSpec["layout"]) {
    setTransitions((curr) => {
      const next = curr.map((t) => {
        if (t.id !== id) return t;
        const ids = t.screenshots.map((s) => s.step_id);
        return {
          ...t,
          layout: nextLayout,
          screenshots: placementsForLayout(nextLayout, ids),
        };
      });
      persistTransitions(next);
      return next;
    });
  }

  function patchScreenshot(
    transitionId: string,
    index: number,
    patch: Partial<ScreenshotPlacement>,
  ) {
    setTransitions((curr) => {
      const next = curr.map((t) => {
        if (t.id !== transitionId) return t;
        const screenshots = t.screenshots.map((s, i) => (i === index ? { ...s, ...patch } : s));
        return { ...t, screenshots };
      });
      persistTransitions(next);
      return next;
    });
  }

  function addScreenshotToTransition(transitionId: string, stepId: string) {
    setTransitions((curr) => {
      const next = curr.map((t) => {
        if (t.id !== transitionId) return t;
        // Use the next layout-default slot if available; else copy slot 0 with offset.
        const defaults = layoutDefaults(t.layout);
        const slot = defaults[t.screenshots.length] ?? { x: 30, y: 30, w: 36, rotation: 0, shadow: 70, z: 1 };
        return {
          ...t,
          screenshots: [...t.screenshots, { step_id: stepId, ...slot }],
        };
      });
      persistTransitions(next);
      return next;
    });
  }

  function removeScreenshotFromTransition(transitionId: string, index: number) {
    setTransitions((curr) => {
      const next = curr.map((t) => {
        if (t.id !== transitionId) return t;
        return { ...t, screenshots: t.screenshots.filter((_, i) => i !== index) };
      });
      persistTransitions(next);
      return next;
    });
  }

  async function aiStylizeTransition() {
    if (!activeTransition) return;
    setBusyAction("stylize");
    try {
      const res = await fetch(`/api/genai/stylize-transition`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkthrough_id: walkthrough.id,
          transition: activeTransition,
          screenshot_step_ids: activeTransition.screenshots.map((s) => s.step_id),
        }),
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (json.ok && json.url) {
        const stylized = `${json.url}?t=${Date.now()}`;
        updateTransition(activeTransition.id, { stylized_url: stylized });
      } else {
        alert(json.error ?? "Gemini call failed");
      }
    } finally {
      setBusyAction(null);
    }
  }

  // Editor state knobs — now actually wired through to the video element.
  const [volume, setVolume] = useState(100);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [animIn, setAnimIn] = useState("none");
  const [animOut, setAnimOut] = useState("none");

  // Force the video to full volume, unmuted, every time anything changes.
  // The legacy global volume slider is gone (per-clip volume lives in the
  // inspector now); we shouldn't be silently halving narration loudness.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = 1.0;
    v.muted = false;
    v.playbackRate = speed;
  });

  // fade in / fade out — drive video opacity from currentTime
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let opacity = 1;
    if (fadeIn > 0 && currentTime < fadeIn) {
      opacity = Math.max(0, currentTime / fadeIn);
    } else if (fadeOut > 0 && currentTime > totalDuration - fadeOut) {
      opacity = Math.max(0, (totalDuration - currentTime) / fadeOut);
    }
    v.style.opacity = String(opacity);
  }, [currentTime, fadeIn, fadeOut, totalDuration]);

  // animation in/out — apply CSS class on the canvas during the first/last 0.6s
  const animClass = (() => {
    if (currentTime < 0.6 && animIn !== "none") return `anim-in-${animIn}`;
    if (totalDuration - currentTime < 0.6 && animOut !== "none") return `anim-out-${animOut}`;
    return "";
  })();

  // Active step + its zoom config based on currentTime.
  const activeIdx = (() => {
    const t = currentTime * 1000;
    for (let i = 0; i < tracks.length; i++) {
      const start = stepStartsMs[i];
      const end = start + tracks[i].duration_ms;
      if (t >= start && t < end) return i;
    }
    return -1;
  })();

  // Resolve active zoom — prefer the overlay video clip currently under the
  // playhead (the new source of truth from the ClipInspector). Fall back to
  // the legacy stepZooms for steps whose overlay isn't loaded yet.
  const activeZoom = (() => {
    if (overlay) {
      const tMs = currentTime * 1000;
      for (const c of overlay.clips) {
        if (c.kind !== "video") continue;
        if (tMs >= c.start_ms && tMs < c.start_ms + c.duration_ms && c.zoom_enabled) {
          return {
            enabled: true,
            factor: c.zoom_factor,
            origin_x: c.zoom_origin_x,
            origin_y: c.zoom_origin_y,
          };
        }
      }
    }
    const stepId = activeIdx >= 0 ? tracks[activeIdx].id : null;
    return stepId ? stepZooms[stepId] ?? null : null;
  })();

  const videoTransform = useMemo<React.CSSProperties>(
    () =>
      activeZoom?.enabled
        ? {
            transform: `scale(${activeZoom.factor})`,
            transformOrigin: `${activeZoom.origin_x}% ${activeZoom.origin_y}%`,
          }
        : { transform: "none", transformOrigin: "50% 50%" },
    [activeZoom?.enabled, activeZoom?.factor, activeZoom?.origin_x, activeZoom?.origin_y],
  );

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
  }

  function togglePlay() {
    if (livePreviewRef.current) {
      if (isPlaying) {
        livePreviewRef.current.pause();
      } else {
        livePreviewRef.current.play();
        livePreviewRef.current.syncPlay();
        musicMixerRef.current?.syncPlay();
      }
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play();
      setIsPlaying(true);
    } else {
      v.pause();
      setIsPlaying(false);
    }
  }

  function seekTo(seconds: number) {
    const clamped = Math.max(0, Math.min(totalDuration, seconds));
    if (livePreviewRef.current) {
      setCurrentTime(clamped);
      livePreviewRef.current.syncSeek(clamped);
      musicMixerRef.current?.syncSeek(clamped);
      return;
    }
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = clamped;
    setCurrentTime(v.currentTime);
  }

  // Pause-during-interaction: capture playback state when a scrub or drag
  // starts, pause the video, then resume on release. Avoids the browser
  // stuttering as we set currentTime on every pointermove.
  const interactionWasPlaying = useRef(false);
  function beginInteraction() {
    const v = videoRef.current;
    if (v) {
      interactionWasPlaying.current = !v.paused;
      if (!v.paused) {
        v.pause();
        setIsPlaying(false);
      }
    }
    // Snapshot the overlay once at drag start so undo restores the
    // pre-drag state, not every intermediate tick.
    if (overlay) {
      undoStack.current.push(overlay);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
      dragSnapshotPushed.current = true;
    }
  }
  function endInteraction() {
    const v = videoRef.current;
    if (v && interactionWasPlaying.current) {
      void v.play();
      setIsPlaying(true);
    }
    interactionWasPlaying.current = false;
    dragSnapshotPushed.current = false;
  }

  function jumpStep(direction: -1 | 1) {
    const idx = tracks.findIndex((t) => t.id === selectedStepId);
    const next = Math.max(0, Math.min(tracks.length - 1, idx + direction));
    selectStep(tracks[next].id);
  }

  function selectStep(id: string) {
    setSelectedStepId(id);
    const idx = tracks.findIndex((t) => t.id === id);
    if (idx >= 0) seekTo(stepStartsMs[idx] / 1000);
  }

  async function decide(action: "approve" | "reject") {
    setBusyAction(action);
    try {
      const r = await fetch(`/api/takes/${takeId}/${action}?wt=${encodeURIComponent(walkthrough.id)}`, { method: "POST" });
      if (!r.ok) {
        const text = await r.text().catch(() => `HTTP ${r.status}`);
        alert(`${action === "approve" ? "Approve" : "Send back"} failed: ${text}`);
        return;
      }
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  // ─── AI tile handlers wired through to real director actions ────────────
  async function aiReRunReview() {
    setBusyAction("rebake");
    try {
      const r = await fetch(`/api/director/rebake-take`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ take_id: takeId, walkthrough_id: walkthrough.id }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => `HTTP ${r.status}`);
        alert(`Re-run review failed: ${text}`);
        return;
      }
      // Refresh to surface the new master + segments.
      router.refresh();
    } catch (err) {
      alert(`Re-run review errored: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyAction(null);
    }
  }

  function aiEditNarration() {
    // Jump to the first CHANGED/ADDED step + ask the inspector to open edit mode.
    const target = tracks.find((t) => t.diff_status === "changed" || t.diff_status === "added");
    if (target) {
      selectStep(target.id);
      setEditNarrationTrigger((n) => n + 1);
    }
  }

  async function aiReNarrateSelected() {
    const step = tracks.find((t) => t.id === selectedStepId);
    if (!step) return;
    setBusyAction("renarrate");
    try {
      const r = await fetch(`/api/director/renarrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ take_id: takeId, step_id: step.id, walkthrough_id: walkthrough.id }),
      });
      if (!r.ok) {
        const text = await r.text().catch(() => `HTTP ${r.status}`);
        alert(`Re-narrate failed: ${text}`);
        return;
      }
      router.refresh();
    } catch (err) {
      alert(`Re-narrate errored: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusyAction(null);
    }
  }

  async function aiLaptopMockup() {
    const step = tracks.find((t) => t.id === selectedStepId);
    if (!step) return;
    setBusyAction("laptop");
    try {
      const res = await fetch(`/api/genai/laptop-mockup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walkthrough_id: walkthrough.id, step_id: step.id }),
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (json.ok && json.url) {
        // Cache-bust so a re-run replaces the preview.
        setGenaiByStep((m) => ({ ...m, [step.id]: `${json.url}?t=${Date.now()}` }));
      } else {
        alert(json.error ?? "Gemini call failed");
      }
    } finally {
      setBusyAction(null);
    }
  }

  // ─── EditOverlay (timeline.json) ─────────────────────────────────────
  // Load on mount; fall back to a synthesized overlay on first run.
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/walkthroughs/${walkthrough.id}/timeline`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.overlay) setOverlay(migrateOverlay(j.overlay));
      })
      .catch(() => { /* leave null */ });
    return () => { cancelled = true; };
  }, [walkthrough.id]);

  // Debounced persistence — every overlay change schedules a PUT.
  const overlayPersistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistOverlay = useCallback((next: EditOverlay) => {
    if (overlayPersistTimer.current) clearTimeout(overlayPersistTimer.current);
    overlayPersistTimer.current = setTimeout(() => {
      void fetch(`/api/walkthroughs/${walkthrough.id}/timeline`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ overlay: next }),
      });
    }, 350);
  }, [walkthrough.id]);

  // Undo/redo ring buffer of overlay snapshots. Pushed by every mutator
  // that goes through commitOverlay(). Drag/resize coalesces — we only
  // snapshot when a drag ends (handled in onInteractionEnd).
  const undoStack = useRef<EditOverlay[]>([]);
  const redoStack = useRef<EditOverlay[]>([]);
  const dragSnapshotPushed = useRef(false);
  const [, forceRender] = useState(0);
  const bumpRender = () => forceRender((n) => n + 1);

  // Cache-buster for narration mp3s — bumped after a successful re-narrate
  // so the LivePreview's <audio> tags re-fetch the new bytes.
  const [assetVersion, setAssetVersion] = useState(0);
  const bumpAssets = () => setAssetVersion((n) => n + 1);

  function commitOverlay(next: EditOverlay, prev: EditOverlay | null) {
    if (prev) {
      undoStack.current.push(prev);
      if (undoStack.current.length > 100) undoStack.current.shift();
      redoStack.current = [];
    }
    persistOverlay(next);
    bumpRender();
  }
  function undo() {
    const curr = overlay;
    const prev = undoStack.current.pop();
    if (!prev || !curr) return;
    redoStack.current.push(curr);
    setOverlay(prev);
    persistOverlay(prev);
    bumpRender();
  }
  function redo() {
    const curr = overlay;
    const next = redoStack.current.pop();
    if (!next || !curr) return;
    undoStack.current.push(curr);
    setOverlay(next);
    persistOverlay(next);
    bumpRender();
  }

  function patchClipState(id: string, patch: Partial<Clip>) {
    setOverlay((curr) => {
      if (!curr) return curr;
      const next = patchClipPure(curr, id, patch);
      // During a drag we snapshot once at start (in beginInteraction)
      // and persist; intermediate ticks just update + persist.
      if (dragSnapshotPushed.current) {
        persistOverlay(next);
      } else {
        commitOverlay(next, curr);
      }
      return next;
    });
  }
  function removeClipState(id: string) {
    setOverlay((curr) => {
      if (!curr) return curr;
      const next = removeClipPure(curr, id);
      commitOverlay(next, curr);
      return next;
    });
    if (selectedClipId === id) setSelectedClipId(null);
  }
  function addClipOfKind(kind: ClipKind) {
    setOverlay((curr) => {
      if (!curr) return curr;
      const startMs = Math.round(currentTime * 1000 / 250) * 250;
      const row = DEFAULT_ROW[kind];
      let clip: Clip | null = null;
      if (kind === "banana") {
        clip = {
          id: nextClipId("banana"), kind: "banana", row,
          start_ms: startMs, duration_ms: 3000, fade_in_ms: 300, fade_out_ms: 300, volume: 1,
          prompt: "", asset_url: "", layout: "fullscreen", ref_step_id: tracks[0]?.id ?? null,
        };
      } else if (kind === "typed") {
        clip = {
          id: nextClipId("typed"), kind: "typed", row,
          start_ms: startMs, duration_ms: 3500, fade_in_ms: 200, fade_out_ms: 200, volume: 1,
          strings: ["Watch this."],
          font_family: "SF Pro Display, Inter, sans-serif",
          font_size_px: 64, color: "#fdf3d8", bg_color: "transparent",
          type_speed_ms: 55, back_speed_ms: 30,
          loop: false, show_cursor: true, cursor_char: "|", align: "center",
        };
      } else if (kind === "music") {
        clip = {
          id: nextClipId("music"), kind: "music", row,
          start_ms: startMs, duration_ms: 12000, fade_in_ms: 1500, fade_out_ms: 1500, volume: 0.18,
          asset_url: "", label: "New music bed", loop: true,
        };
      } else if (kind === "caption") {
        clip = {
          id: nextClipId("caption"), kind: "caption", row,
          start_ms: startMs, duration_ms: 2500, fade_in_ms: 200, fade_out_ms: 200, volume: 1,
          text: "New caption", align: "bottom",
        };
      } else if (kind === "transition") {
        // Spawn a fresh TransitionSpec too so the inspector has real fields
        // to edit. This is the "typed text transition" the user asked for.
        const t = defaultTransition("title");
        t.text = "New title";
        t.subtext = "Edit me in the inspector";
        const interesting = tracks.filter((tr) => tr.diff_status === "changed" || tr.diff_status === "added");
        const seedIds = (interesting.length >= 2 ? interesting : tracks).slice(0, 3).map((s) => s.id);
        t.screenshots = placementsForLayout(t.layout, seedIds);
        setTransitions((curr) => {
          const next = [...curr, t];
          persistTransitions(next);
          return next;
        });
        setActiveTransitionId(t.id);
        clip = {
          id: nextClipId("trans"), kind: "transition", row,
          start_ms: startMs, duration_ms: 3000, fade_in_ms: 300, fade_out_ms: 300, volume: 1,
          transition_id: t.id,
        };
      } else if (kind === "video") {
        const stepId = tracks[0]?.id ?? "";
        clip = {
          id: nextClipId("v"), kind: "video", row,
          start_ms: startMs, duration_ms: 4000, fade_in_ms: 0, fade_out_ms: 0, volume: 1,
          step_id: stepId,
          zoom_enabled: false, zoom_factor: 1.6, zoom_origin_x: 50, zoom_origin_y: 50,
          match_source_length: false,
        };
      } else if (kind === "voice") {
        const stepId = tracks[0]?.id ?? "";
        clip = {
          id: nextClipId("vo"), kind: "voice", row,
          start_ms: startMs, duration_ms: 4000, fade_in_ms: 0, fade_out_ms: 0, volume: 1,
          step_id: stepId,
        };
      }
      if (!clip) return curr;
      const next = addClipPure(curr, clip);
      setSelectedClipId(clip.id);
      commitOverlay(next, curr);
      return next;
    });
  }

  const [musicErrorByClip, setMusicErrorByClip] = useState<
    Record<string, { message: string; suggestion: string | null } | null>
  >({});

  async function generateMusicClip(clipId: string) {
    if (!overlay) return;
    const f = overlay.clips.find((c) => c.id === clipId);
    if (!f || f.kind !== "music" || !f.prompt) return;
    setBusyAction("music");
    setMusicErrorByClip((m) => ({ ...m, [clipId]: null }));
    try {
      const res = await fetch(`/api/music/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkthrough_id: walkthrough.id,
          prompt: f.prompt,
          duration_ms: f.duration_ms,
        }),
      });
      const json = (await res.json()) as {
        ok?: boolean; url?: string; error?: string; duration_ms?: number;
        prompt_suggestion?: string | null;
      };
      if (json.ok && json.url) {
        patchClipState(clipId, {
          asset_url: `${json.url}?t=${Date.now()}`,
          generated_duration_ms: json.duration_ms ?? f.duration_ms,
          source_sha256_at_edit: narrationHashNow,
        });
      } else {
        setMusicErrorByClip((m) => ({
          ...m,
          [clipId]: {
            message: json.error ?? "Music generation failed",
            suggestion: json.prompt_suggestion ?? null,
          },
        }));
      }
    } finally {
      setBusyAction(null);
    }
  }

  function applyMusicSuggestion(clipId: string, suggestion: string) {
    patchClipState(clipId, { prompt: suggestion });
    setMusicErrorByClip((m) => ({ ...m, [clipId]: null }));
  }

  // Debounced authoring writes — typing in the step title/narration shouldn't
  // hammer the YAML file on every keystroke.
  const authoringTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  function editStepInYaml(stepId: string, patch: { title?: string; narration?: string; duration_ms?: number }) {
    if (authoringTimers.current[stepId]) clearTimeout(authoringTimers.current[stepId]);
    // A narration edit invalidates the continuous take — flip the stale pill
    // so the user sees a "regenerate voice" prompt in the toolbar.
    if (patch.narration !== undefined) setVoiceStale(true);
    authoringTimers.current[stepId] = setTimeout(() => {
      void fetch(`/api/walkthroughs/${walkthrough.id}/authoring`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "rename", id: stepId, ...patch }),
      }).then(() => router.refresh());
    }, 500);
  }

  /** Kick the continuous-narration synth on the director side. The endpoint
   *  is a thin wrapper around `director synth-continuous <id>`; while it runs
   *  the toolbar shows a busy spinner. The status flips back to "fresh" once
   *  the response succeeds. */
  async function regenerateContinuousVoice() {
    setVoiceBusy(true);
    try {
      const r = await fetch(
        `/api/walkthroughs/${walkthrough.id}/narration/regenerate`,
        { method: "POST", headers: { "Content-Type": "application/json" } },
      );
      const data = await r.json().catch(() => ({}));
      if (r.ok && data?.ok) {
        setVoiceStale(false);
        if (data.narration) setRealContinuous(data.narration as ContinuousNarration);
        router.refresh();
      } else {
        console.warn("[narration] regenerate failed:", data);
      }
    } finally {
      setVoiceBusy(false);
    }
  }

  async function addNewStep() {
    const id = window.prompt("New step id (a-z0-9_-)");
    if (!id) return;
    const slug = id.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "");
    if (!slug) return;
    const res = await fetch(`/api/walkthroughs/${walkthrough.id}/authoring`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "add", step: { id: slug, title: slug, duration_ms: 5000 } }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      alert(`Couldn't add step: ${j.error ?? res.statusText}`);
      return;
    }
    router.refresh();
  }

  /** Walk every clip, regenerate the stale ones (banana/music). For
   *  video/voice we don't auto-record (that needs Playwright + agent),
   *  so we just clear their stale-by-edit marker so the user knows
   *  they need to retake from the inspector. */
  async function regenerateAllStale() {
    if (!overlay) return;
    setBusyAction("regen-all");
    try {
      for (const c of overlay.clips) {
        if (!isClipStale(c)) continue;
        if (c.kind === "music" && c.prompt) {
          // Music is regenerated via the same flow.
          await generateMusicClip(c.id);
        } else if (c.kind === "banana" && c.prompt) {
          await generateBananaClip(c.id);
        }
        // video/voice skipped — those need a real retake (agent + capture)
      }
    } finally {
      setBusyAction(null);
    }
  }

  // ─── suggestion preview/insert ───────────────────────────────────────
  function previewSuggestionFromRail(s: {
    title: string; narration: string; reason: string;
    status: "added" | "changed"; pr_title: string | null;
    pr_number: number | null; frame_url: string | null;
  }) {
    setPreviewSuggestion(s);
    setCanvasMode("suggestion");
    // Briefly auto-dismiss so the canvas returns to playback after a beat.
    window.setTimeout(() => {
      setCanvasMode((m) => (m === "suggestion" ? "video" : m));
    }, 7000);
  }
  function insertSuggestionAsClip(s: {
    step_id: string; title: string; narration: string; duration_ms: number;
    frame_url?: string | null;
  }) {
    setOverlay((curr) => {
      if (!curr) return curr;
      // Find the latest end time so we append.
      let end = 0;
      for (const c of curr.clips) end = Math.max(end, c.start_ms + c.duration_ms);
      const startMs = end;
      const id = nextClipId(`v-${s.step_id}`);
      const next = addClipPure(curr, {
        id,
        kind: "video",
        row: DEFAULT_ROW.video,
        step_id: s.step_id,
        start_ms: startMs,
        duration_ms: s.duration_ms,
        fade_in_ms: 0,
        fade_out_ms: 0,
        volume: 1.0,
        zoom_enabled: false,
        zoom_factor: 1.6,
        zoom_origin_x: 50,
        zoom_origin_y: 50,
        match_source_length: false,
        poster_url: s.frame_url ?? null,
        placeholder_text: s.narration ?? null,
      });
      setSelectedClipId(id);
      commitOverlay(next, curr);
      return next;
    });
  }

  async function generateBananaClip(clipId: string) {
    if (!overlay) return;
    const f = overlay.clips.find((c) => c.id === clipId);
    if (!f || f.kind !== "banana" || !f.prompt) return;
    const found = f;
    setBusyAction("banana");
    try {
      const res = await fetch(`/api/genai/laptop-mockup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          walkthrough_id: walkthrough.id,
          step_id: found.ref_step_id ?? tracks[0]?.id,
          prompt_override: found.prompt,
        }),
      });
      const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (json.ok && json.url) {
        patchClipState(clipId, { asset_url: `${json.url}?t=${Date.now()}` });
      } else {
        alert(json.error ?? "Banana failed");
      }
    } finally {
      setBusyAction(null);
    }
  }

  // Keyboard shortcuts: Delete clip, Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z redo.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
        return;
      }
      if ((e.key === "Delete" || e.key === "Backspace") && selectedClipId) {
        e.preventDefault();
        removeClipState(selectedClipId);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedClipId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Source frames keyed by step_id, for thumbnails in clip blocks.
  const sourceById = useMemo(() => {
    const out: Record<string, TrackEntry> = {};
    for (const t of tracks) out[t.id] = t;
    return out;
  }, [tracks]);

  // Stale predicate — a clip is stale when the step it references has
  // changed/added in the current take's diff. Banana clips stale when
  // their ref step is stale. Music stale flag uses the narration hash
  // captured at generation time. (Typed/caption are user-authored — we
  // don't auto-mark them.)
  const narrationHashNow = useMemo(() => {
    let h = 0;
    for (const s of walkthrough.steps) {
      const str = `${s.id}${s.narration}`;
      for (let i = 0; i < str.length; i++) {
        h = ((h << 5) - h + str.charCodeAt(i)) | 0;
      }
    }
    return String(h);
  }, [walkthrough]);
  const isClipStale = useCallback((clip: Clip): boolean => {
    if (clip.kind === "video" || clip.kind === "voice") {
      const t = sourceById[clip.step_id];
      return t?.diff_status === "changed" || t?.diff_status === "added";
    }
    if (clip.kind === "banana") {
      if (!clip.ref_step_id) return false;
      const t = sourceById[clip.ref_step_id];
      return t?.diff_status === "changed" || t?.diff_status === "added";
    }
    if (clip.kind === "music") {
      // If we never recorded a generation hash, treat as fresh.
      if (!clip.source_sha256_at_edit) return false;
      return clip.source_sha256_at_edit !== narrationHashNow;
    }
    return false;
  }, [sourceById, narrationHashNow]);

  // Music clips with a valid asset_url, for live mix during preview.
  const musicClipsForMix: MusicClip[] = useMemo(
    () =>
      (overlay?.clips ?? []).filter(
        (c): c is MusicClip => c.kind === "music" && !!c.asset_url,
      ),
    [overlay],
  );

  // captions text — what step is the playhead inside
  const currentCaption = (() => {
    if (!captionsOn) return null;
    const t = currentTime * 1000;
    for (let i = 0; i < tracks.length; i++) {
      const start = stepStartsMs[i];
      const end = start + tracks[i].duration_ms;
      if (t >= start && t < end) return tracks[i].narration;
    }
    return null;
  })();

  const selectedStep = tracks.find((t) => t.id === selectedStepId) ?? null;
  const selectedStepIdx = tracks.findIndex((t) => t.id === selectedStepId);

  if (mode === "preview") {
    return (
      <PreviewPage
        walkthrough={walkthrough}
        walkthroughDisplayName={walkthroughDisplayName}
        masterUrl={masterUrl}
        takeId={takeId}
        onBackToEdit={() => setMode("edit")}
      />
    );
  }

  return (
    <div className="editor mode-edit">
      <header className="editor-header">
        <div className="left">
          <Link href={`/walkthroughs/${walkthrough.id}`} className="back" style={{ margin: 0 }}>
            ← {walkthroughDisplayName}
          </Link>
          <span className="editor-title">
            {takeId}
            <span className="meta">
              {take.pr_title ? `· ${take.pr_title}` : "· canonical master"}
            </span>
          </span>
          <span className={`status status-${take.status}`}>{take.status}</span>
        </div>
        <div className="right">
          <div className="undo-cluster">
            <button
              type="button"
              className="undo-btn"
              onClick={undo}
              disabled={undoStack.current.length === 0}
              title="Undo (⌘Z)"
            >
              ↶
            </button>
            <button
              type="button"
              className="undo-btn"
              onClick={redo}
              disabled={redoStack.current.length === 0}
              title="Redo (⇧⌘Z)"
            >
              ↷
            </button>
          </div>
          <ModeToggle mode={mode} onChange={setMode} />
          <ThemeToggle />
          {take.parent_take_id ? (
            <Link
              href={`/takes/${takeId}/compare/${take.parent_take_id}`}
              className="btn-secondary"
            >
              Compare with {take.parent_take_id}
            </Link>
          ) : null}
          {take.status === "ready" ? (
            <>
              <button
                className="btn-secondary"
                onClick={() => decide("reject")}
                disabled={busyAction !== null}
              >
                {busyAction === "reject" ? "Sending back…" : "Send back"}
              </button>
              <button
                className="btn-primary"
                onClick={() => decide("approve")}
                disabled={busyAction !== null}
              >
                {busyAction === "approve" ? "Approving…" : "Approve master"}
              </button>
            </>
          ) : null}
        </div>
      </header>

      <div className="editor-main">
        <aside className="left-rail">
          <div className="left-rail-bar">
            <div className="bottom-tabs">
              <button
                type="button"
                className={`bottom-tab ${leftMode === "suggestions" ? "active" : ""}`}
                onClick={() => setLeftMode("suggestions")}
              >
                Suggestions
              </button>
              <button
                type="button"
                className={`bottom-tab ${leftMode === "changes" ? "active" : ""}`}
                onClick={() => setLeftMode("changes")}
              >
                Changes
              </button>
            </div>
          </div>
          {leftMode === "suggestions" ? (
            <SuggestionsPanel
              walkthroughId={walkthrough.id}
              selectedClipId={selectedClipId}
              busy={busyAction !== null}
              onPreview={previewSuggestionFromRail}
              onInsert={insertSuggestionAsClip}
              onAddStep={addNewStep}
            />
          ) : (
            <ChangesTimeline
              walkthroughId={walkthrough.id}
              onPreview={(c) => previewSuggestionFromRail({
                title: c.title, narration: c.narration, reason: c.reason,
                status: c.status, pr_title: c.pr_title, pr_number: c.pr_number,
                frame_url: c.frame_url,
              })}
              onInsert={(c) => insertSuggestionAsClip({
                step_id: c.step_id, title: c.title, narration: c.narration,
                duration_ms: c.duration_ms, frame_url: c.frame_url,
              })}
            />
          )}
        </aside>

        <section className="editor-stage">
          {canvasMode === "suggestion" && previewSuggestion ? (
            <div className="canvas is-suggestion-preview">
              <div
                className="suggestion-canvas-bg"
                style={previewSuggestion.frame_url ? { backgroundImage: `url(${previewSuggestion.frame_url})` } : undefined}
              />
              <div className="suggestion-canvas-shade" />
              <div className="suggestion-canvas-card">
                <span className={`sgx-status sgx-status-${previewSuggestion.status}`}>
                  {previewSuggestion.status === "added" ? "NEW BLOCK" : "PROPOSED UPDATE"}
                </span>
                <h2>{previewSuggestion.title}</h2>
                {previewSuggestion.pr_title ? (
                  <div className="suggestion-canvas-pr">
                    {previewSuggestion.pr_number ? `#${previewSuggestion.pr_number} · ` : ""}
                    {previewSuggestion.pr_title}
                  </div>
                ) : null}
                <p className="suggestion-canvas-narration">{previewSuggestion.narration}</p>
                <p className="suggestion-canvas-reason">{previewSuggestion.reason}</p>
                <button
                  className="suggestion-canvas-back"
                  onClick={() => setCanvasMode("video")}
                  type="button"
                >
                  ← Back to video
                </button>
              </div>
            </div>
          ) : canvasMode === "transitions" && activeTransition ? (
            <div className="canvas is-transition">
              <TransitionSlide
                spec={activeTransition}
                framesByStepId={Object.fromEntries(tracks.map((t) => [t.id, t.frame_url]))}
                resetKey={`${activeTransition.id}-${transitionResetKey}-${activeTransition.text}-${activeTransition.subtext ?? ""}`}
              />
            </div>
          ) : (
            <div className={`canvas live-canvas ${animClass} ${activeZoom?.enabled ? "step-zoomed" : ""}`}>
              {overlay ? (
                <LivePreview
                  ref={livePreviewRef}
                  overlay={overlay}
                  walkthroughId={walkthrough.id}
                  currentTime={currentTime}
                  isPlaying={isPlaying}
                  videoStyle={videoTransform}
                  assetVersion={assetVersion}
                  selectedClipId={selectedClipId}
                  onPatchClip={patchClipState}
                  narration={continuousNarration}
                  onTimeUpdate={(t) => setCurrentTime(t)}
                  onPlayStateChange={(playing) => {
                    setIsPlaying(playing);
                    if (playing) musicMixerRef.current?.syncPlay();
                    else musicMixerRef.current?.syncPause();
                  }}
                />
              ) : (
                <video
                  ref={videoRef}
                  src={masterUrl}
                  onTimeUpdate={onTimeUpdate}
                  onPlay={() => { setIsPlaying(true); musicMixerRef.current?.syncPlay(); }}
                  onPause={() => { setIsPlaying(false); musicMixerRef.current?.syncPause(); }}
                  preload="metadata"
                  controls
                  style={videoTransform}
                />
              )}
              <MusicMixer
                ref={musicMixerRef}
                clips={musicClipsForMix}
                currentTime={currentTime}
                isPlaying={isPlaying}
              />
            </div>
          )}
          <div className="tabs">
            {canvasMode === "transitions" && activeTransition ? (
              <>
                <button className="on" type="button">Live</button>
                <button onClick={() => setTransitionResetKey((n) => n + 1)} type="button">Replay typing</button>
                <button onClick={() => setCanvasMode("video")} type="button">← Back to video</button>
              </>
            ) : (
              <label className="caption-switch">
                <span>Captions</span>
                <button
                  type="button"
                  className={`ci-toggle ${captionsOn ? "on" : ""}`}
                  onClick={() => setCaptionsOn(!captionsOn)}
                  aria-pressed={captionsOn}
                  aria-label="Toggle captions overlay"
                >
                  <span className="ci-toggle-knob" />
                </button>
              </label>
            )}
          </div>
        </section>

        <div className="editor-inspector-slot">
          <ClipInspector
            overlay={overlay ?? { version: 2, clips: [] }}
            selectedClipId={selectedClipId}
            sourceById={sourceById}
            walkthroughId={walkthrough.id}
            brandVoiceId={walkthrough.brand?.voice_id ?? null}
            onPatch={patchClipState}
            onRemove={removeClipState}
            onRetake={(stepId) => { setSelectedStepId(stepId); aiReRunReview(); }}
            onRenarrate={(stepId) => { setSelectedStepId(stepId); aiReNarrateSelected(); }}
            onGenerateBanana={generateBananaClip}
            onGenerateMusic={generateMusicClip}
            musicError={selectedClipId ? musicErrorByClip[selectedClipId] ?? null : null}
            onApplyMusicSuggestion={applyMusicSuggestion}
            transitions={transitions}
            onUpdateTransition={updateTransition}
            onOpenTransitionInCanvas={(id) => {
              setActiveTransitionId(id);
              setTransitionResetKey((n) => n + 1);
              setCanvasMode("transitions");
            }}
            onEditStep={editStepInYaml}
            onAssetRefresh={bumpAssets}
            busy={busyAction !== null}
          />
        </div>
      </div>


      <div className="bottom-pane">
        {overlay ? (
        <Timeline2
          overlay={overlay}
          sourceById={sourceById}
          selectedClipId={selectedClipId}
          currentTime={currentTime}
          isPlaying={isPlaying}
          zoom={zoom}
          speed={speed}
          onSelectClip={(id) => {
            setSelectedClipId(id);
            if (id) {
              const found = overlay.clips.find((c) => c.id === id);
              if (found && "step_id" in found) setSelectedStepId(found.step_id as string);
            }
          }}
          onPatchClip={patchClipState}
          onSeek={seekTo}
          onTogglePlay={togglePlay}
          onJump={jumpStep}
          onZoom={(n) => setZoom(Math.max(12, Math.min(160, n)))}
          onAddClip={addClipOfKind}
          onInteractionStart={beginInteraction}
          onInteractionEnd={endInteraction}
          isClipStale={isClipStale}
          onRegenerateStale={regenerateAllStale}
          regenBusy={busyAction === "regen-all"}
          onRemoveClip={removeClipState}
          narration={continuousNarration}
          voiceStale={voiceStale}
          voiceBusy={voiceBusy}
          onRegenerateVoice={regenerateContinuousVoice}
          showScriptLane={showScriptLane}
          onToggleScriptLane={() => setShowScriptLane((v) => !v)}
          onEditStepNarration={(id, text) => editStepInYaml(id, { narration: text })}
        />
      ) : (
        <Timeline
          tracks={tracks}
          stepStartsMs={stepStartsMs}
          totalDuration={totalDuration}
          currentTime={currentTime}
          isPlaying={isPlaying}
          zoom={zoom}
          speed={speed}
          selectedStepId={selectedStepId}
          onSelectStep={selectStep}
          onSeek={seekTo}
          onTogglePlay={togglePlay}
          onJump={jumpStep}
          onZoom={(n) => setZoom(Math.max(12, Math.min(120, n)))}
        />
      )}
      </div>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: "edit" | "preview"; onChange: (m: "edit" | "preview") => void }) {
  return (
    <div className="mode-toggle" role="tablist" aria-label="View mode">
      <button
        type="button"
        className={`opt ${mode === "edit" ? "active" : ""}`}
        onClick={() => onChange("edit")}
        role="tab"
        aria-selected={mode === "edit"}
      >
        Edit
      </button>
      <button
        type="button"
        className={`opt ${mode === "preview" ? "active" : ""}`}
        onClick={() => onChange("preview")}
        role="tab"
        aria-selected={mode === "preview"}
      >
        Preview
      </button>
    </div>
  );
}

// Docs-style preview that mirrors the public /docs/<id> page layout — master
// video at the top, then a vertical step-by-step list with each step's
// title, narration, and segment clip. Lets the user see the walkthrough as
// the audience will, without leaving the editor.
function PreviewPage({
  walkthrough,
  walkthroughDisplayName,
  masterUrl,
  takeId,
  onBackToEdit,
}: {
  walkthrough: Walkthrough;
  walkthroughDisplayName: string;
  masterUrl: string;
  takeId: string;
  onBackToEdit: () => void;
}) {
  const totalMs = walkthrough.steps.reduce((n, s) => n + s.duration_ms, 0);
  const repoTail = walkthrough.target_app.repo.split("/")[1] ?? walkthrough.id;
  return (
    <main
      className="docs editor-preview-page"
      style={{
        ["--brand-accent" as string]: walkthrough.brand.palette_accent,
      }}
    >
      <div className="docs-toolbar">
        <button type="button" className="back" onClick={onBackToEdit} style={{ margin: 0, background: "none", border: 0, cursor: "pointer", font: "inherit", color: "inherit", padding: 0 }}>
          ← back to edit
        </button>
        <ModeToggle mode="preview" onChange={(m) => { if (m === "edit") onBackToEdit(); }} />
      </div>

      <header className="docs-hero">
        <div className="brand-band" />
        <div className="docs-hero-inner">
          <p className="docs-eyebrow">Walkthrough · v{walkthrough.version}</p>
          <h1 className="docs-title">A tour of {repoTail}</h1>
          <p className="docs-meta">
            {walkthrough.steps.length} steps · {(totalMs / 1000).toFixed(0)}s · narrated by {walkthrough.brand.voice_name}
          </p>
        </div>
      </header>

      <div className="docs-master-frame">
        <video src={masterUrl} controls playsInline preload="metadata" />
      </div>

      <ol className="docs-steps">
        {walkthrough.steps.map((step, i) => (
          <li key={step.id} className="docs-step">
            <div className="docs-step-num">{String(i + 1).padStart(2, "0")}</div>
            <div className="docs-step-body">
              <h2>{step.title}</h2>
              <p className="narration">{step.narration}</p>
              <video
                src={`/walkthroughs/${walkthrough.id}/takes/${takeId}/segments/${step.id}.mp4`}
                poster={`/walkthroughs/${walkthrough.id}/steps/${step.id}.png`}
                muted
                playsInline
                preload="none"
                controls
              />
              <p className="docs-step-meta">{(step.duration_ms / 1000).toFixed(1)}s</p>
            </div>
          </li>
        ))}
      </ol>

      <footer className="docs-footer">
        <p>Live preview of <strong>{walkthroughDisplayName}</strong>. This mirrors what the public /docs/{walkthrough.id} page renders.</p>
      </footer>
    </main>
  );
}
