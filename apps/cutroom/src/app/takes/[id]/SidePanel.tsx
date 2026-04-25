"use client";

import type { Walkthrough } from "@/lib/types";
import type { RailTab, TrackEntry } from "./EditorShell";
import type { TransitionSpec } from "@/lib/transitions";

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
  onAddTransition: () => void;
  onRemoveTransition: (id: string) => void;
  onUpdateTransition: (id: string, patch: Partial<TransitionSpec>) => void;
  onStylizeTransition: () => Promise<void> | void;
  onReplayTransition: () => void;
}

export function SidePanel(p: Props) {
  return (
    <aside className="editor-side">
      {p.tab === "steps" && <StepsPanel tracks={p.tracks} selectedStepId={p.selectedStepId} onSelectStep={p.onSelectStep} />}
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

function StepsPanel({ tracks, selectedStepId, onSelectStep }: {
  tracks: TrackEntry[];
  selectedStepId: string | null;
  onSelectStep: (id: string) => void;
}) {
  return (
    <>
      <h3>Steps</h3>
      <div className="group">
        <div className="group-label">{tracks.length} steps · click to seek</div>
        {tracks.map((t, i) => (
          <button
            key={t.id}
            className={`tool-tile ${selectedStepId === t.id ? "" : ""}`}
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
              <div className="tile-sub">{t.diff_status}</div>
            </div>
          </button>
        ))}
      </div>
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
  onAdd: () => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<TransitionSpec>) => void;
  onStylize: () => Promise<void> | void;
  onReplay: () => void;
  busy: string | null;
}) {
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
          <button className="btn-secondary" type="button" onClick={p.onAdd} style={{ marginTop: 6 }}>
            + New transition
          </button>
        </div>
      </div>

      {active ? (
        <>
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
                onChange={(e) => p.onUpdate(active.id, { layout: e.target.value as TransitionSpec["layout"] })}
              >
                <option value="centered">centered</option>
                <option value="hero-left">hero-left</option>
                <option value="hero-right">hero-right</option>
                <option value="grid">grid</option>
              </select>
              <span className="val">{active.layout}</span>
            </div>
            <div className="ctrl-row">
              <span className="lbl">Background</span>
              <select
                value={active.bg}
                onChange={(e) => p.onUpdate(active.id, { bg: e.target.value as TransitionSpec["bg"] })}
              >
                <option value="gradient-purple">purple</option>
                <option value="gradient-amber">amber</option>
                <option value="gradient-graphite">graphite</option>
                <option value="dark">solid dark</option>
                <option value="light">solid light</option>
              </select>
              <span className="val">{active.bg.replace("gradient-", "")}</span>
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

          <div className="group">
            <div className="group-label">Screenshots ({active.screenshot_step_ids.length})</div>
            <div className="ss-picker">
              {p.tracks.map((t, i) => {
                const on = active.screenshot_step_ids.includes(t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`ss-tile ${on ? "on" : ""}`}
                    onClick={() => {
                      const ids = on
                        ? active.screenshot_step_ids.filter((x) => x !== t.id)
                        : [...active.screenshot_step_ids, t.id];
                      p.onUpdate(active.id, { screenshot_step_ids: ids });
                    }}
                    title={t.title}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={t.frame_url} alt="" />
                    <span className="ss-num">{String(i + 1).padStart(2, "0")}</span>
                  </button>
                );
              })}
            </div>
          </div>

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

function statusColor(status: string): string {
  switch (status) {
    case "changed": return "#f5a623";
    case "added":   return "#34c77b";
    case "removed": return "#ff3b30";
    default:        return "#86868b";
  }
}
