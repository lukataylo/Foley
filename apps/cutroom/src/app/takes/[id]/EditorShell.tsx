"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { TransitionSlide } from "@/components/TransitionSlide";
import type { StepDiff, Take, Walkthrough } from "@/lib/types";
import {
  defaultTransition,
  type TransitionSpec,
} from "@/lib/transitions";
import { Timeline } from "./Timeline";
import { Inspector } from "./Inspector";
import { SidePanel } from "./SidePanel";

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
  const [railTab, setRailTab] = useState<RailTab>("steps");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(36);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [captionsOn, setCaptionsOn] = useState(false);
  const [editNarrationTrigger, setEditNarrationTrigger] = useState(0);
  const [genaiByStep, setGenaiByStep] = useState<Record<string, string>>({});

  // ─── transitions ──────────────────────────────────────────────────────
  const [transitions, setTransitions] = useState<TransitionSpec[]>(initialTransitions);
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
  function addTransition() {
    const t = defaultTransition();
    // Seed with the first three step frames as default screenshots.
    t.screenshot_step_ids = tracks.slice(0, 3).map((s) => s.id);
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
          screenshot_step_ids: activeTransition.screenshot_step_ids,
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
          onAddTransition={addTransition}
          onRemoveTransition={removeTransition}
          onUpdateTransition={updateTransition}
          onStylizeTransition={aiStylizeTransition}
          onReplayTransition={() => setTransitionResetKey((n) => n + 1)}
        />

        <section className="editor-stage">
          {railTab === "transitions" && activeTransition ? (
            <div className="canvas is-transition">
              <TransitionSlide
                spec={activeTransition}
                screenshotUrls={activeTransition.screenshot_step_ids
                  .map((sid) => tracks.find((t) => t.id === sid)?.frame_url)
                  .filter((url): url is string => Boolean(url))}
                resetKey={`${activeTransition.id}-${transitionResetKey}-${activeTransition.text}-${activeTransition.subtext ?? ""}`}
              />
            </div>
          ) : (
            <div className={`canvas ${animClass}`}>
              <video
                ref={videoRef}
                src={masterUrl}
                onTimeUpdate={onTimeUpdate}
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                preload="metadata"
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
      </div>

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
