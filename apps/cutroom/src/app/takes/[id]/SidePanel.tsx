"use client";

import { useState } from "react";
import type { Walkthrough } from "@/lib/types";
import type { RailTab, TrackEntry, StepZoom } from "./EditorShell";
import type {
  ScreenshotPlacement,
  TransitionKind,
  TransitionSpec,
} from "@/lib/transitions";

interface Props {
  tab: RailTab;
  tracks: TrackEntry[];
  walkthrough: Walkthrough;
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;

  volume: number;   setVolume: (n: number) => void;
  fadeIn: number;   setFadeIn: (n: number) => void;
  fadeOut: number;  setFadeOut: (n: number) => void;
  speed: number;    setSpeed: (n: number) => void;
  animIn: string;   setAnimIn: (s: string) => void;
  animOut: string;  setAnimOut: (s: string) => void;

  aiReRunReview: () => Promise<void> | void;
  aiEditNarration: () => void;
  aiReNarrateSelected: () => Promise<void> | void;
  aiLaptopMockup: () => Promise<void> | void;
  aiBusy: string | null;

  transitions: TransitionSpec[];
  activeTransitionId: string | null;
  onSelectTransition: (id: string) => void;
  onAddTransition: (kind: TransitionKind) => void;
  stepZooms: Record<string, StepZoom>;
  onPatchStepZoom: (stepId: string, patch: Partial<StepZoom>) => void;
  onRemoveTransition: (id: string) => void;
  onUpdateTransition: (id: string, patch: Partial<TransitionSpec>) => void;
  onRelayoutTransition: (id: string, layout: TransitionSpec["layout"]) => void;
  onPatchScreenshot: (transitionId: string, index: number, patch: Partial<ScreenshotPlacement>) => void;
  onAddScreenshot: (transitionId: string, stepId: string) => void;
  onRemoveScreenshot: (transitionId: string, index: number) => void;
  onStylizeTransition: () => Promise<void> | void;
  onReplayTransition: () => void;
}

export function SidePanel(p: Props) {
  return (
    <aside className="editor-side">
      {p.tab === "steps" && (
        <StepsPanel
          tracks={p.tracks}
          selectedStepId={p.selectedStepId}
          onSelectStep={p.onSelectStep}
          stepZooms={p.stepZooms}
          onPatchStepZoom={p.onPatchStepZoom}
        />
      )}
      {p.tab === "voice" && <VoicePanel {...p} />}
      {p.tab === "brand" && <BrandPanel {...p} />}
      {p.tab === "transitions" && (
        <TransitionsPanel
          tracks={p.tracks}
          transitions={p.transitions}
          activeId={p.activeTransitionId}
          onSelect={p.onSelectTransition}
          onAdd={p.onAddTransition}
          onRemove={p.onRemoveTransition}
          onUpdate={p.onUpdateTransition}
          onRelayout={p.onRelayoutTransition}
          onPatchScreenshot={p.onPatchScreenshot}
          onAddScreenshot={p.onAddScreenshot}
          onRemoveScreenshot={p.onRemoveScreenshot}
          onStylize={p.onStylizeTransition}
          onReplay={p.onReplayTransition}
          busy={p.aiBusy}
        />
      )}
      {p.tab === "ai" && (
        <AIPanel
          onReRunReview={p.aiReRunReview}
          onEditNarration={p.aiEditNarration}
          onReNarrateSelected={p.aiReNarrateSelected}
          onLaptopMockup={p.aiLaptopMockup}
          busy={p.aiBusy}
        />
      )}
    </aside>
  );
}

function StepsPanel({
  tracks,
  selectedStepId,
  onSelectStep,
  stepZooms,
  onPatchStepZoom,
}: {
  tracks: TrackEntry[];
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
  stepZooms: Record<string, StepZoom>;
  onPatchStepZoom: (stepId: string, patch: Partial<StepZoom>) => void;
}) {
  const sel = tracks.find((t) => t.id === selectedStepId);
  const z = selectedStepId ? stepZooms[selectedStepId] : undefined;
  return (
    <>
      <h3>Steps</h3>
      <div className="group">
        <div className="group-label">{tracks.length} steps · click to seek</div>
        {tracks.map((t, i) => (
          <button
            key={t.id}
            className="tool-tile"
            style={{
              borderColor: selectedStepId === t.id ? "var(--link)" : undefined,
              background: selectedStepId === t.id ? "var(--panel)" : undefined,
            }}
            onClick={() => onSelectStep(t.id)}
            type="button"
          >
            <div className="tile-icon" style={{ background: statusColor(t.diff_status) }}>
              {String(i + 1).padStart(2, "0")}
            </div>
            <div>
              <div className="tile-title">{t.title}</div>
              <div className="tile-sub">
                {t.diff_status}
                {stepZooms[t.id]?.enabled ? <span style={{ marginLeft: 6, color: "var(--link)" }}>· zoom {stepZooms[t.id].factor.toFixed(1)}×</span> : null}
              </div>
            </div>
          </button>
        ))}
      </div>

      {sel ? (
        <div className="group">
          <div className="group-label">Zoom · {sel.title}</div>
          <div className="ctrl-row">
            <span className="lbl">Enabled</span>
            <input
              type="checkbox"
              checked={Boolean(z?.enabled)}
              onChange={(e) => onPatchStepZoom(sel.id, { enabled: e.target.checked })}
              style={{ justifySelf: "start" }}
            />
            <span className="val">{z?.enabled ? "on" : "off"}</span>
          </div>
          <Slider label="Factor" value={z?.factor ?? 1.6} min={1} max={3} step={0.05} unit="x"
            onChange={(v) => onPatchStepZoom(sel.id, { factor: v })} />
          <Slider label="Origin X" value={z?.origin_x ?? 50} min={0} max={100} step={1} unit="%"
            onChange={(v) => onPatchStepZoom(sel.id, { origin_x: v })} />
          <Slider label="Origin Y" value={z?.origin_y ?? 50} min={0} max={100} step={1} unit="%"
            onChange={(v) => onPatchStepZoom(sel.id, { origin_y: v })} />
          <p style={{ color: "var(--muted)", fontSize: 11.5, margin: "6px 0 0" }}>
            Applies to the canvas while the playhead is inside this step.
          </p>
        </div>
      ) : null}
    </>
  );
}

function VoicePanel(p: Props) {
  return (
    <>
      <h3>Voice & playback</h3>
      <div className="group">
        <div className="group-label">Playback</div>
        <Slider label="Volume"   value={p.volume}  min={0} max={100} step={1}  unit="%" onChange={p.setVolume} />
        <Slider label="Fade in"  value={p.fadeIn}  min={0} max={3}   step={0.05} unit="s" onChange={p.setFadeIn} />
        <Slider label="Fade out" value={p.fadeOut} min={0} max={3}   step={0.05} unit="s" onChange={p.setFadeOut} />
        <Slider label="Speed"    value={p.speed}   min={0.5} max={2} step={0.05} unit="x" onChange={p.setSpeed} />
      </div>
      <div className="group">
        <div className="group-label">Voice</div>
        <div className="ctrl-row">
          <span className="lbl">Voice</span>
          <select value={p.walkthrough.brand.voice_id} disabled>
            <option>{p.walkthrough.brand.voice_name}</option>
          </select>
          <span className="val">🔒</span>
        </div>
        <div className="ctrl-row">
          <span className="lbl">Pacing</span>
          <select value={String(p.walkthrough.brand.pacing_wpm)} disabled>
            <option>{p.walkthrough.brand.pacing_wpm} wpm</option>
          </select>
          <span className="val">🔒</span>
        </div>
      </div>
    </>
  );
}

function BrandPanel(p: Props) {
  const { palette_bg, palette_fg, palette_accent, font_family, intro_card_ms } = p.walkthrough.brand;
  return (
    <>
      <h3>Brand</h3>
      <div className="group">
        <div className="group-label">Animation (per step)</div>
        <div className="ctrl-row">
          <span className="lbl">In</span>
          <select value={p.animIn} onChange={(e) => p.setAnimIn(e.target.value)}>
            <option>none</option><option>fade</option><option>slide</option><option>zoom</option>
          </select>
          <span className="val">{p.animIn}</span>
        </div>
        <div className="ctrl-row">
          <span className="lbl">Out</span>
          <select value={p.animOut} onChange={(e) => p.setAnimOut(e.target.value)}>
            <option>none</option><option>fade</option><option>slide</option><option>zoom</option>
          </select>
          <span className="val">{p.animOut}</span>
        </div>
      </div>
      <div className="group">
        <div className="group-label">Palette</div>
        <PaletteRow k="Background" hex={palette_bg} />
        <PaletteRow k="Foreground" hex={palette_fg} />
        <PaletteRow k="Accent"     hex={palette_accent} />
      </div>
      <div className="group">
        <div className="group-label">Type</div>
        <div className="ctrl-row" style={{ gridTemplateColumns: "70px 1fr" }}>
          <span className="lbl">Font</span>
          <span className="val" style={{ textAlign: "left", fontFamily: font_family, color: "var(--fg)" }}>{font_family}</span>
        </div>
        <div className="ctrl-row" style={{ gridTemplateColumns: "70px 1fr" }}>
          <span className="lbl">Intro</span>
          <span className="val" style={{ textAlign: "left", color: "var(--fg)" }}>{(intro_card_ms / 1000).toFixed(1)}s card</span>
        </div>
      </div>
    </>
  );
}

function AIPanel({
  onReRunReview,
  onEditNarration,
  onReNarrateSelected,
  onLaptopMockup,
  busy,
}: {
  onReRunReview: () => Promise<void> | void;
  onEditNarration: () => void;
  onReNarrateSelected: () => Promise<void> | void;
  onLaptopMockup: () => Promise<void> | void;
  busy: string | null;
}) {
  return (
    <>
      <h3>AI tools</h3>
      <div className="group">
        <div className="group-label">Compose with Gemini · Nano Banana</div>
        <button
          className={`tool-tile ${busy === "laptop" ? "busy" : ""}`}
          type="button"
          onClick={() => onLaptopMockup()}
          disabled={busy !== null}
        >
          <div className="tile-icon" style={{ background: "linear-gradient(135deg, #f5b740 0%, #f08394 100%)" }}>🍌</div>
          <div>
            <div className="tile-title">{busy === "laptop" ? "Composing…" : "Insert in laptop mockup"}</div>
            <div className="tile-sub">Wrap the selected step's frame in a MacBook</div>
          </div>
        </button>
      </div>
      <div className="group">
        <div className="group-label">Director</div>
        <button
          className={`tool-tile ${busy === "rebake" ? "busy" : ""}`}
          type="button"
          onClick={() => onReRunReview()}
          disabled={busy !== null}
        >
          <div className="tile-icon" style={{ background: "#34c77b" }}>↺</div>
          <div>
            <div className="tile-title">{busy === "rebake" ? "Rebaking…" : "Re-run review"}</div>
            <div className="tile-sub">Re-take changed steps + reassemble master</div>
          </div>
        </button>
        <button
          className="tool-tile"
          type="button"
          onClick={onEditNarration}
          disabled={busy !== null}
        >
          <div className="tile-icon" style={{ background: "#0070f3" }}>✎</div>
          <div>
            <div className="tile-title">Edit narration</div>
            <div className="tile-sub">Rewrite the changed step's voiceover</div>
          </div>
        </button>
      </div>
      <div className="group">
        <div className="group-label">Voice</div>
        <button
          className={`tool-tile ${busy === "renarrate" ? "busy" : ""}`}
          type="button"
          onClick={() => onReNarrateSelected()}
          disabled={busy !== null}
        >
          <div className="tile-icon" style={{ background: "#a855f7" }}>♪</div>
          <div>
            <div className="tile-title">{busy === "renarrate" ? "Re-narrating…" : "Re-narrate step"}</div>
            <div className="tile-sub">Re-synthesize Charlotte for the selected step</div>
          </div>
        </button>
        <button className="tool-tile" type="button" disabled>
          <div className="tile-icon" style={{ background: "#6e6e73" }}>◐</div>
          <div>
            <div className="tile-title">Use voice changer</div>
            <div className="tile-sub">Locked at the walkthrough level</div>
          </div>
        </button>
      </div>
    </>
  );
}

function Slider(props: {
  label: string;
  value: number;
  min: number; max: number; step: number;
  unit: string;
  onChange: (n: number) => void;
}) {
  return (
    <div className="ctrl-row">
      <span className="lbl">{props.label}</span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <span className="val">{props.value}{props.unit}</span>
    </div>
  );
}

function PaletteRow({ k, hex }: { k: string; hex: string }) {
  return (
    <div className="ctrl-row" style={{ gridTemplateColumns: "70px 1fr 80px" }}>
      <span className="lbl">{k}</span>
      <span style={{ height: 22, borderRadius: 4, background: hex, border: "1px solid var(--border)" }} />
      <span className="val">{hex}</span>
    </div>
  );
}

function TransitionsPanel(p: {
  tracks: TrackEntry[];
  transitions: TransitionSpec[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onAdd: (kind: TransitionKind) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<TransitionSpec>) => void;
  onRelayout: (id: string, layout: TransitionSpec["layout"]) => void;
  onPatchScreenshot: (transitionId: string, index: number, patch: Partial<ScreenshotPlacement>) => void;
  onAddScreenshot: (transitionId: string, stepId: string) => void;
  onRemoveScreenshot: (transitionId: string, index: number) => void;
  onStylize: () => Promise<void> | void;
  onReplay: () => void;
  busy: string | null;
}) {
  const [activeShotIdx, setActiveShotIdx] = useState(0);
  const active = p.transitions.find((t) => t.id === p.activeId) ?? null;
  return (
    <>
      <h3>Transitions</h3>
      <div className="group">
        <div className="group-label">{p.transitions.length} on this take</div>
        <div className="tx-list">
          {p.transitions.map((t) => (
            <div
              key={t.id}
              className={`tx-row ${t.id === p.activeId ? "active" : ""}`}
              onClick={() => p.onSelect(t.id)}
              role="button"
            >
              <div className="tx-thumb">⌁</div>
              <div>
                <div className="tx-title">{t.text || "(empty)"}</div>
                <div className="tx-sub">{t.layout} · {t.bg} · {t.font}{t.typed ? " · typed" : ""}</div>
              </div>
              <button
                className="tx-x"
                type="button"
                onClick={(e) => { e.stopPropagation(); p.onRemove(t.id); }}
                aria-label="Remove transition"
              >×</button>
            </div>
          ))}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
            <button className="btn-secondary" type="button" onClick={() => p.onAdd("title")}        style={{ fontSize: 11.5, justifyContent: "center" }}>+ Title</button>
            <button className="btn-secondary" type="button" onClick={() => p.onAdd("angled-mockup")} style={{ fontSize: 11.5, justifyContent: "center" }}>+ Angled</button>
            <button className="btn-secondary" type="button" onClick={() => p.onAdd("feature-zoom")}  style={{ fontSize: 11.5, justifyContent: "center" }}>+ Feature</button>
          </div>
        </div>
      </div>

      {active ? (
        <>
          <div className="group">
            <div className="group-label">Kind</div>
            <div style={{ color: "var(--fg)", fontSize: 13, padding: "6px 0" }}>
              {active.kind === "angled-mockup" ? "Angled mockup reveal"
                : active.kind === "feature-zoom" ? "Feature zoom"
                : "Title slide"}
            </div>
          </div>
          <div className="group">
            <div className="group-label">Headline</div>
            <textarea
              rows={2}
              value={active.text}
              onChange={(e) => p.onUpdate(active.id, { text: e.target.value })}
              placeholder="Big bold sentence"
            />
            <div className="group-label" style={{ marginTop: 14 }}>Subhead</div>
            <textarea
              rows={2}
              value={active.subtext ?? ""}
              onChange={(e) => p.onUpdate(active.id, { subtext: e.target.value })}
              placeholder="Optional supporting line"
            />
          </div>

          <div className="group">
            <div className="group-label">Style</div>
            <div className="ctrl-row">
              <span className="lbl">Font</span>
              <select
                value={active.font}
                onChange={(e) => p.onUpdate(active.id, { font: e.target.value as TransitionSpec["font"] })}
              >
                <option value="display">display</option>
                <option value="sans">sans</option>
                <option value="serif">serif</option>
                <option value="mono">mono</option>
              </select>
              <span className="val">{active.font}</span>
            </div>
            <div className="ctrl-row">
              <span className="lbl">Layout</span>
              <select
                value={active.layout}
                onChange={(e) => p.onRelayout(active.id, e.target.value as TransitionSpec["layout"])}
              >
                <option value="scatter">scatter</option>
                <option value="hero-cover-tl">hero · top-left</option>
                <option value="hero-cover-tr">hero · top-right</option>
                <option value="hero-cover-bl">hero · bottom-left</option>
                <option value="hero-cover-br">hero · bottom-right</option>
                <option value="split-vertical">split</option>
                <option value="stack">stack</option>
                <option value="grid">grid</option>
              </select>
              <span className="val">{active.layout.replace("hero-cover-", "h-")}</span>
            </div>
            <div className="ctrl-row">
              <span className="lbl">Background</span>
              <select
                value={active.bg}
                onChange={(e) => p.onUpdate(active.id, { bg: e.target.value as TransitionSpec["bg"] })}
              >
                <option value="aurora-pink">aurora · pink</option>
                <option value="aurora-blue">aurora · blue</option>
                <option value="aurora-amber">aurora · amber</option>
                <option value="aurora-mint">aurora · mint</option>
                <option value="aurora-graphite">aurora · graphite</option>
                <option value="void">void</option>
                <option value="paper">paper</option>
              </select>
              <span className="val">{active.bg.replace("aurora-", "")}</span>
            </div>
            <div className="ctrl-row">
              <span className="lbl">Typed</span>
              <input
                type="checkbox"
                checked={active.typed}
                onChange={(e) => p.onUpdate(active.id, { typed: e.target.checked })}
                style={{ justifySelf: "start" }}
              />
              <button
                className="btn-secondary"
                type="button"
                style={{ height: 28, padding: "0 10px", fontSize: 12 }}
                onClick={p.onReplay}
              >Replay</button>
            </div>
          </div>

          {active.kind === "angled-mockup" && active.angled ? (
            <AngledMockupControls
              tracks={p.tracks}
              spec={active.angled}
              onPatch={(patch) => p.onUpdate(active.id, { angled: { ...active.angled!, ...patch } })}
              onReplay={p.onReplay}
            />
          ) : null}
          {active.kind === "feature-zoom" && active.feature ? (
            <FeatureZoomControls
              tracks={p.tracks}
              spec={active.feature}
              onPatch={(patch) => p.onUpdate(active.id, { feature: { ...active.feature!, ...patch } })}
              onReplay={p.onReplay}
            />
          ) : null}

          {active.kind === "title" ? (
          <div className="group">
            <div className="group-label">Screenshots ({active.screenshots.length})</div>

            {/* Active screenshot picker — click to focus its placement controls */}
            {active.screenshots.length > 0 ? (
              <div className="ss-picker" style={{ marginBottom: 10 }}>
                {active.screenshots.map((s, i) => {
                  const t = p.tracks.find((tr) => tr.id === s.step_id);
                  const isActive = i === activeShotIdx;
                  return (
                    <button
                      key={`${s.step_id}-${i}`}
                      type="button"
                      className={`ss-tile ${isActive ? "on" : ""}`}
                      onClick={() => setActiveShotIdx(i)}
                      title={t?.title ?? s.step_id}
                    >
                      {t ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.frame_url} alt="" />
                      ) : null}
                      <span className="ss-num">{String(i + 1).padStart(2, "0")}</span>
                    </button>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: "var(--muted)", fontSize: 12, margin: "0 0 10px" }}>
                No screenshots yet. Add one from the strip below.
              </p>
            )}

            {/* Placement controls for the active screenshot */}
            {active.screenshots[activeShotIdx] ? (
              <ScreenshotPlacementEditor
                placement={active.screenshots[activeShotIdx]}
                onChange={(patch) => p.onPatchScreenshot(active.id, activeShotIdx, patch)}
                onRemove={() => {
                  p.onRemoveScreenshot(active.id, activeShotIdx);
                  setActiveShotIdx(0);
                }}
              />
            ) : null}

            {/* Strip of all step frames — click a tile to ADD it (multi-add allowed) */}
            <div className="group-label" style={{ marginTop: 12 }}>Add from steps</div>
            <div className="ss-picker">
              {p.tracks.map((t, i) => (
                <button
                  key={t.id}
                  type="button"
                  className="ss-tile"
                  onClick={() => p.onAddScreenshot(active.id, t.id)}
                  title={`Add ${t.title}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={t.frame_url} alt="" />
                  <span className="ss-num">{String(i + 1).padStart(2, "0")}</span>
                </button>
              ))}
            </div>
          </div>
          ) : null}

          <div className="group">
            <div className="group-label">Stylize with Gemini · Nano Banana</div>
            <button
              className={`tool-tile ${p.busy === "stylize" ? "busy" : ""}`}
              type="button"
              onClick={() => p.onStylize()}
              disabled={p.busy !== null}
            >
              <div className="tile-icon" style={{ background: "linear-gradient(135deg, #f5b740 0%, #f08394 100%)" }}>🍌</div>
              <div>
                <div className="tile-title">{p.busy === "stylize" ? "Stylizing…" : "Stylize this slide"}</div>
                <div className="tile-sub">Compose text + screenshots into a polished frame</div>
              </div>
            </button>
            {active.stylized_url ? (
              <button
                className="btn-secondary"
                type="button"
                onClick={() => p.onUpdate(active.id, { stylized_url: null })}
                style={{ marginTop: 8 }}
              >
                Revert to draft
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <p style={{ color: "var(--muted)", fontSize: 13 }}>
          Pick a transition above or create a new one.
        </p>
      )}
    </>
  );
}

function AngledMockupControls(p: {
  tracks: TrackEntry[];
  spec: NonNullable<TransitionSpec["angled"]>;
  onPatch: (patch: Partial<NonNullable<TransitionSpec["angled"]>>) => void;
  onReplay: () => void;
}) {
  return (
    <>
      <div className="group">
        <div className="group-label">Source frame</div>
        <div className="ss-picker">
          {p.tracks.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`ss-tile ${p.spec.step_id === t.id ? "on" : ""}`}
              onClick={() => p.onPatch({ step_id: t.id })}
              title={t.title}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.frame_url} alt="" />
              <span className="ss-num">{String(i + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <div className="group-label">Tilt</div>
        <Slider label="Rotate X"  value={p.spec.rotate_x}  min={-45} max={45} step={1} unit="°" onChange={(v) => p.onPatch({ rotate_x: v })} />
        <Slider label="Rotate Y"  value={p.spec.rotate_y}  min={-45} max={45} step={1} unit="°" onChange={(v) => p.onPatch({ rotate_y: v })} />
        <Slider label="Rotate Z"  value={p.spec.rotate_z}  min={-30} max={30} step={1} unit="°" onChange={(v) => p.onPatch({ rotate_z: v })} />
        <Slider label="Width"     value={p.spec.width}     min={40}  max={130} step={1} unit="%" onChange={(v) => p.onPatch({ width: v })} />
        <Slider label="Anchor Y"  value={p.spec.anchor_y}  min={0}   max={100} step={1} unit="%" onChange={(v) => p.onPatch({ anchor_y: v })} />
        <div className="ctrl-row">
          <span className="lbl">Reveal</span>
          <select
            value={p.spec.reveal_from}
            onChange={(e) => p.onPatch({ reveal_from: e.target.value as "bottom" | "top" | "left" | "right" })}
          >
            <option value="bottom">from bottom</option>
            <option value="top">from top</option>
            <option value="left">from left</option>
            <option value="right">from right</option>
          </select>
          <button
            className="btn-secondary"
            type="button"
            style={{ height: 28, padding: "0 10px", fontSize: 12 }}
            onClick={p.onReplay}
          >Replay</button>
        </div>
      </div>
    </>
  );
}

function FeatureZoomControls(p: {
  tracks: TrackEntry[];
  spec: NonNullable<TransitionSpec["feature"]>;
  onPatch: (patch: Partial<NonNullable<TransitionSpec["feature"]>>) => void;
  onReplay: () => void;
}) {
  return (
    <>
      <div className="group">
        <div className="group-label">Source frame</div>
        <div className="ss-picker">
          {p.tracks.map((t, i) => (
            <button
              key={t.id}
              type="button"
              className={`ss-tile ${p.spec.step_id === t.id ? "on" : ""}`}
              onClick={() => p.onPatch({ step_id: t.id })}
              title={t.title}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.frame_url} alt="" />
              <span className="ss-num">{String(i + 1).padStart(2, "0")}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="group">
        <div className="group-label">Zoom</div>
        <Slider label="Origin X" value={p.spec.zoom_x}      min={0}   max={100} step={1} unit="%" onChange={(v) => p.onPatch({ zoom_x: v })} />
        <Slider label="Origin Y" value={p.spec.zoom_y}      min={0}   max={100} step={1} unit="%" onChange={(v) => p.onPatch({ zoom_y: v })} />
        <Slider label="Factor"   value={p.spec.zoom_factor} min={1}   max={4}   step={0.05} unit="x" onChange={(v) => p.onPatch({ zoom_factor: v })} />
      </div>
      <div className="group">
        <div className="group-label">Cursor</div>
        <Slider label="Cursor X"   value={p.spec.cursor_x}    min={0}  max={100} step={1} unit="%" onChange={(v) => p.onPatch({ cursor_x: v })} />
        <Slider label="Cursor Y"   value={p.spec.cursor_y}    min={0}  max={100} step={1} unit="%" onChange={(v) => p.onPatch({ cursor_y: v })} />
        <Slider label="Size"       value={p.spec.cursor_size} min={40} max={220} step={1} unit="px" onChange={(v) => p.onPatch({ cursor_size: v })} />
        <div className="ctrl-row" style={{ gridTemplateColumns: "70px 1fr 60px" }}>
          <span className="lbl">Label</span>
          <input
            type="text"
            value={p.spec.cursor_label ?? ""}
            placeholder="(no label)"
            onChange={(e) => p.onPatch({ cursor_label: e.target.value })}
            style={{
              padding: "6px 9px",
              borderRadius: 8,
              border: "1px solid var(--border)",
              background: "var(--panel-2)",
              color: "var(--fg)",
              font: "inherit",
              fontSize: 13,
            }}
          />
          <button
            className="btn-secondary"
            type="button"
            style={{ height: 28, padding: "0 10px", fontSize: 12 }}
            onClick={p.onReplay}
          >Replay</button>
        </div>
      </div>
    </>
  );
}

function ScreenshotPlacementEditor(props: {
  placement: ScreenshotPlacement;
  onChange: (patch: Partial<ScreenshotPlacement>) => void;
  onRemove: () => void;
}) {
  const { placement: p, onChange, onRemove } = props;
  return (
    <div
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "10px 12px",
        marginBottom: 6,
      }}
    >
      <Slider label="X"        value={p.x}        min={-40} max={140} step={1}   unit="%" onChange={(v) => onChange({ x: v })} />
      <Slider label="Y"        value={p.y}        min={-40} max={140} step={1}   unit="%" onChange={(v) => onChange({ y: v })} />
      <Slider label="Width"    value={p.w}        min={10}  max={140} step={1}   unit="%" onChange={(v) => onChange({ w: v })} />
      <Slider label="Rotation" value={p.rotation} min={-30} max={30}  step={1}   unit="°" onChange={(v) => onChange({ rotation: v })} />
      <Slider label="Shadow"   value={p.shadow}   min={0}   max={100} step={1}   unit=""  onChange={(v) => onChange({ shadow: v })} />
      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
        <button
          className="btn-secondary"
          type="button"
          style={{ height: 26, padding: "0 8px", fontSize: 11.5 }}
          onClick={() => onChange({ z: Math.max(1, p.z - 1) })}
        >
          Send back
        </button>
        <button
          className="btn-secondary"
          type="button"
          style={{ height: 26, padding: "0 8px", fontSize: 11.5 }}
          onClick={() => onChange({ z: p.z + 1 })}
        >
          Bring forward
        </button>
        <button
          className="btn-secondary"
          type="button"
          style={{ height: 26, padding: "0 8px", fontSize: 11.5, marginLeft: "auto", color: "var(--diff-removed)" }}
          onClick={onRemove}
        >
          Remove
        </button>
      </div>
    </div>
  );
}

function statusColor(status: string): string {
  switch (status) {
    case "changed": return "#f5a623";
    case "added":   return "#34c77b";
    case "removed": return "#ff3b30";
    default:        return "#86868b";
  }
}
