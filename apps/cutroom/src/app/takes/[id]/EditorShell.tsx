"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import type { StepDiff, Take, Walkthrough } from "@/lib/types";
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

export type RailTab = "steps" | "voice" | "brand" | "ai";

interface Props {
  takeId: string;
  walkthroughDisplayName: string;
  take: Take;
  walkthrough: Walkthrough;
  tracks: TrackEntry[];
  masterUrl: string;
}

export function EditorShell({ takeId, walkthroughDisplayName, take, walkthrough, tracks, masterUrl }: Props) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);

  // Step start times relative to the master, in seconds.
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

  // The first changed/added step is the "interesting" one — seed the inspector.
  const initialStep =
    tracks.find((t) => t.diff_status === "changed" || t.diff_status === "added")?.id ??
    tracks[0]?.id ??
    null;

  const [selectedStepId, setSelectedStepId] = useState<string | null>(initialStep);
  const [railTab, setRailTab] = useState<RailTab>("steps");
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(36); // px per second
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");

  // Editor state knobs (visual / wire-only for the demo surface).
  const [volume, setVolume] = useState(100);
  const [fadeIn, setFadeIn] = useState(0);
  const [fadeOut, setFadeOut] = useState(0);
  const [speed, setSpeed] = useState(1.0);
  const [animIn, setAnimIn] = useState("none");
  const [animOut, setAnimOut] = useState("none");

  // Sync video element with our state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, volume / 100));
    v.playbackRate = speed;
  }, [volume, speed]);

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

  const selectedStep = tracks.find((t) => t.id === selectedStepId) ?? null;
  const selectedStepIdx = tracks.findIndex((t) => t.id === selectedStepId);

  return (
    <div className={`editor ${mode === "preview" ? "mode-preview" : "mode-edit"}`}>
      {/* ─── header ─── */}
      <header className="editor-header">
        <div className="left">
          <Link href={`/walkthroughs/${walkthrough.id}`} className="back" style={{ margin: 0 }}>← {walkthroughDisplayName}</Link>
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

      {/* ─── main: rail | side | stage | inspector ─── */}
      <div className="editor-main">
        <nav className="editor-rail">
          <RailButton id="steps"  glyph="⊞" active={railTab === "steps"} onClick={() => setRailTab("steps")}>Steps</RailButton>
          <RailButton id="voice"  glyph="♪" active={railTab === "voice"} onClick={() => setRailTab("voice")}>Voice</RailButton>
          <RailButton id="brand"  glyph="◐" active={railTab === "brand"} onClick={() => setRailTab("brand")}>Brand</RailButton>
          <RailButton id="ai"     glyph="✦" active={railTab === "ai"}    onClick={() => setRailTab("ai")}>AI</RailButton>
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
        />

        <section className="editor-stage">
          <div className="canvas">
            <video
              ref={videoRef}
              src={masterUrl}
              onTimeUpdate={onTimeUpdate}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              preload="metadata"
            />
          </div>
          <div className="tabs">
            <button className="on">Original</button>
            <button>Captions</button>
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
          onDirectorActionStart={() => setBusyAction("retake")}
          onDirectorActionEnd={() => setBusyAction(null)}
        />
      </div>

      {/* ─── timeline ─── */}
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
