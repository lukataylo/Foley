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
import { Inspector } from "./Inspector";
import { SidePanel } from "./SidePanel";
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
}

export function EditorShell({
  takeId,
  walkthroughDisplayName,
  take,
  walkthrough,
  tracks,
  masterUrl,
  initialTransitions = [],
}: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  const totalDuration = useMemo(
    () => tracks.reduce((n, t) => n + t.duration_ms, 0) / 1000,
    [tracks],
  );
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
  const [railTab, setRailTab] = useState<RailTab>("steps");
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
      void fetch(`/api/takes/${takeId}/transitions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transitions: next }),
      });
    }, 350);
  }, [takeId]);

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
    setRailTab("transitions");
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

  // volume + speed → video element
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, volume / 100));
    v.playbackRate = speed;
  }, [volume, speed]);

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
  const activeZoomStepId = activeIdx >= 0 ? tracks[activeIdx].id : null;
  const activeZoom = activeZoomStepId ? stepZooms[activeZoomStepId] : null;
  const videoTransform =
    activeZoom?.enabled
      ? {
          transform: `scale(${activeZoom.factor})`,
          transformOrigin: `${activeZoom.origin_x}% ${activeZoom.origin_y}%`,
        }
      : { transform: "none", transformOrigin: "50% 50%" };

  function onTimeUpdate() {
    const v = videoRef.current;
    if (!v) return;
    setCurrentTime(v.currentTime);
  }

  function togglePlay() {
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
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(totalDuration, seconds));
    setCurrentTime(v.currentTime);
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
      await fetch(`/api/takes/${takeId}/${action}`, { method: "POST" });
      router.refresh();
    } finally {
      setBusyAction(null);
    }
  }

  // ─── AI tile handlers wired through to real director actions ────────────
  async function aiReRunReview() {
    setBusyAction("rebake");
    try {
      await fetch(`/api/director/rebake-take`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ take_id: takeId }),
      });
      // Refresh to surface the new master + segments.
      router.refresh();
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
      await fetch(`/api/director/renarrate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ take_id: takeId, step_id: step.id }),
      });
      router.refresh();
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

  function patchClipState(id: string, patch: Partial<Clip>) {
    setOverlay((curr) => {
      if (!curr) return curr;
      const next = patchClipPure(curr, id, patch);
      persistOverlay(next);
      return next;
    });
  }
  function removeClipState(id: string) {
    setOverlay((curr) => {
      if (!curr) return curr;
      const next = removeClipPure(curr, id);
      persistOverlay(next);
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
        clip = {
          id: nextClipId("trans"), kind: "transition", row,
          start_ms: startMs, duration_ms: 2000, fade_in_ms: 300, fade_out_ms: 300, volume: 1,
          transition_id: transitions[0]?.id ?? "",
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
      persistOverlay(next);
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

  // Source frames keyed by step_id, for thumbnails in clip blocks.
  const sourceById = useMemo(() => {
    const out: Record<string, TrackEntry> = {};
    for (const t of tracks) out[t.id] = t;
    return out;
  }, [tracks]);

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

  return (
    <div className={`editor ${mode === "preview" ? "mode-preview" : "mode-edit"}`}>
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
        <nav className="editor-rail">
          <RailButton id="steps"       glyph="⊞" active={railTab === "steps"}       onClick={() => setRailTab("steps")}>Steps</RailButton>
          <RailButton id="voice"       glyph="♪" active={railTab === "voice"}       onClick={() => setRailTab("voice")}>Voice</RailButton>
          <RailButton id="brand"       glyph="◐" active={railTab === "brand"}       onClick={() => setRailTab("brand")}>Brand</RailButton>
          <RailButton id="transitions" glyph="⌁" active={railTab === "transitions"} onClick={() => setRailTab("transitions")}>Trans.</RailButton>
          <RailButton id="ai"          glyph="✦" active={railTab === "ai"}          onClick={() => setRailTab("ai")}>AI</RailButton>
        </nav>

        <SidePanel
          tab={railTab}
          tracks={tracks}
          walkthrough={walkthrough}
          selectedStepId={selectedStepId}
          onSelectStep={selectStep}
          volume={volume} setVolume={setVolume}
          fadeIn={fadeIn} setFadeIn={setFadeIn}
          fadeOut={fadeOut} setFadeOut={setFadeOut}
          speed={speed} setSpeed={setSpeed}
          animIn={animIn} setAnimIn={setAnimIn}
          animOut={animOut} setAnimOut={setAnimOut}
          aiReRunReview={aiReRunReview}
          aiEditNarration={aiEditNarration}
          aiReNarrateSelected={aiReNarrateSelected}
          aiLaptopMockup={aiLaptopMockup}
          aiBusy={busyAction}
          transitions={transitions}
          activeTransitionId={activeTransitionId}
          onSelectTransition={(id) => { setActiveTransitionId(id); setTransitionResetKey((n) => n + 1); }}
          onAddTransition={(kind) => addTransition(kind)}
          stepZooms={stepZooms}
          onPatchStepZoom={patchStepZoom}
          onRemoveTransition={removeTransition}
          onUpdateTransition={updateTransition}
          onRelayoutTransition={relayoutTransition}
          onPatchScreenshot={patchScreenshot}
          onAddScreenshot={addScreenshotToTransition}
          onRemoveScreenshot={removeScreenshotFromTransition}
          onStylizeTransition={aiStylizeTransition}
          onReplayTransition={() => setTransitionResetKey((n) => n + 1)}
        />

        <section className="editor-stage">
          {railTab === "transitions" && activeTransition ? (
            <div className="canvas is-transition">
              <TransitionSlide
                spec={activeTransition}
                framesByStepId={Object.fromEntries(tracks.map((t) => [t.id, t.frame_url]))}
                resetKey={`${activeTransition.id}-${transitionResetKey}-${activeTransition.text}-${activeTransition.subtext ?? ""}`}
              />
            </div>
          ) : (
            <div className={`canvas ${animClass} ${activeZoom?.enabled ? "step-zoomed" : ""}`}>
              <video
                ref={videoRef}
                src={masterUrl}
                onTimeUpdate={onTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                preload="metadata"
                style={videoTransform}
              />
              {currentCaption ? (
                <div className="captions-overlay">{currentCaption}</div>
              ) : null}
            </div>
          )}
          <div className="tabs">
            {railTab === "transitions" && activeTransition ? (
              <>
                <button className="on" type="button">Live</button>
                <button onClick={() => setTransitionResetKey((n) => n + 1)} type="button">Replay typing</button>
              </>
            ) : (
              <>
                <button
                  className={!captionsOn ? "on" : ""}
                  onClick={() => setCaptionsOn(false)}
                  type="button"
                >
                  Original
                </button>
                <button
                  className={captionsOn ? "on" : ""}
                  onClick={() => setCaptionsOn(true)}
                  type="button"
                >
                  Captions
                </button>
              </>
            )}
          </div>
        </section>

        <div className="editor-inspector-slot">
          {selectedClipId && overlay ? (
            <ClipInspector
              overlay={overlay}
              selectedClipId={selectedClipId}
              sourceById={sourceById}
              onPatch={patchClipState}
              onRemove={removeClipState}
              onRetake={(stepId) => { setSelectedStepId(stepId); aiReRunReview(); }}
              onRenarrate={(stepId) => { setSelectedStepId(stepId); aiReNarrateSelected(); }}
              onGenerateBanana={generateBananaClip}
              busy={busyAction !== null}
            />
          ) : (
            <Inspector
              take={take}
              step={selectedStep}
              stepIndex={selectedStepIdx}
              totalSteps={tracks.length}
              onPrev={() => jumpStep(-1)}
              onNext={() => jumpStep(1)}
              takeId={takeId}
              editTriggerCount={editNarrationTrigger}
              genaiPreviewUrl={selectedStepId ? genaiByStep[selectedStepId] ?? null : null}
              onDirectorActionStart={() => setBusyAction("retake")}
              onDirectorActionEnd={() => setBusyAction(null)}
            />
          )}
        </div>
      </div>


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
  );
}

function RailButton(props: {
  id: string;
  glyph: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      className={`rail-btn ${props.active ? "active" : ""}`}
      onClick={props.onClick}
      type="button"
      aria-label={props.id}
    >
      <span className="glyph">{props.glyph}</span>
      <span>{props.children}</span>
    </button>
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
