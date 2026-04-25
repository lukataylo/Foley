"use client";

// Selection-aware inspector. Reads the currently selected clip and renders
// kind-specific controls. All edits flow through onPatch / onAction up to
// EditorShell.

import { type Clip, findClip, type EditOverlay } from "@/lib/timeline";
import type { TrackEntry } from "./EditorShell";
import type { TransitionSpec } from "@/lib/transitions";

interface Props {
  overlay: EditOverlay;
  selectedClipId: string | null;
  sourceById: Record<string, TrackEntry>;
  onPatch: (id: string, patch: Partial<Clip>) => void;
  onRemove: (id: string) => void;
  onRetake: (stepId: string) => void;
  onRenarrate: (stepId: string) => void;
  onGenerateBanana: (id: string) => void;
  onGenerateMusic: (id: string) => void;
  musicError?: { message: string; suggestion: string | null } | null;
  onApplyMusicSuggestion?: (id: string, suggestion: string) => void;
  /** Look up the linked transition spec for a transition clip. */
  transitions?: TransitionSpec[];
  /** Patch a transition's spec by id. */
  onUpdateTransition?: (id: string, patch: Partial<TransitionSpec>) => void;
  /** Open the full transition preview/editor (canvas swap). */
  onOpenTransitionInCanvas?: (id: string) => void;
  /** Edit the underlying step in walkthrough.yaml — title/narration/duration. */
  onEditStep?: (stepId: string, patch: { title?: string; narration?: string; duration_ms?: number }) => void;
  busy?: boolean;
}

export function ClipInspector(p: Props) {
  if (!p.selectedClipId) {
    return (
      <div className="ci ci-empty">
        <div className="ci-empty-glyph">⌖</div>
        <div className="ci-empty-title">Nothing selected</div>
        <div className="ci-empty-sub">
          Click any clip in the timeline. Drag clips by their middle to move them,
          or by either edge to resize.
        </div>
      </div>
    );
  }
  const clip = findClip(p.overlay, p.selectedClipId);
  if (!clip) {
    return (
      <div className="ci ci-empty">
        <div className="ci-empty-glyph">∅</div>
        <div className="ci-empty-title">Clip missing</div>
      </div>
    );
  }
  return (
    <div className="ci">
      <ClipHeader clip={clip} onRemove={p.onRemove} />
      <ClipTiming clip={clip} onPatch={p.onPatch} />

      {clip.kind === "video" && (
        <VideoBody
          clip={clip}
          onPatch={p.onPatch}
          onRetake={p.onRetake}
          onEditStep={p.onEditStep}
          sourceById={p.sourceById}
          busy={p.busy}
        />
      )}
      {clip.kind === "voice" && <VoiceBody clip={clip} onPatch={p.onPatch} onRenarrate={p.onRenarrate} busy={p.busy} />}
      {clip.kind === "music" && (
        <MusicBody
          clip={clip}
          onPatch={p.onPatch}
          onGenerate={p.onGenerateMusic}
          busy={p.busy}
          error={p.musicError ?? null}
          onApplySuggestion={p.onApplyMusicSuggestion}
        />
      )}
      {clip.kind === "transition" && (
        <TransitionBody
          clip={clip}
          transitions={p.transitions ?? []}
          onUpdateTransition={p.onUpdateTransition}
          onOpenInCanvas={p.onOpenTransitionInCanvas}
        />
      )}
      {clip.kind === "caption" && <CaptionBody clip={clip} onPatch={p.onPatch} />}
      {clip.kind === "banana" && <BananaBody clip={clip} onPatch={p.onPatch} onGenerate={p.onGenerateBanana} busy={p.busy} sourceById={p.sourceById} />}
      {clip.kind === "typed" && <TypedBody clip={clip} onPatch={p.onPatch} />}
    </div>
  );
}

function ClipHeader({ clip, onRemove }: { clip: Clip; onRemove: (id: string) => void }) {
  return (
    <div className="ci-header">
      <div className="ci-kind kind-{clip.kind}">{KIND_LABEL[clip.kind]}</div>
      <div className="ci-id">{clip.id}</div>
      <button className="ci-remove" onClick={() => onRemove(clip.id)} title="Delete clip">✕</button>
    </div>
  );
}

function ClipTiming({
  clip,
  onPatch,
}: {
  clip: Clip;
  onPatch: (id: string, patch: Partial<Clip>) => void;
}) {
  return (
    <Section title="Timing">
      <Row label="Row">
        <span className="ci-row-stepper">
          <button type="button" className="ci-step-btn" onClick={() => onPatch(clip.id, { row: Math.max(0, clip.row - 1) })}>↑</button>
          <span className="ci-row-num">row {clip.row + 1}</span>
          <button type="button" className="ci-step-btn" onClick={() => onPatch(clip.id, { row: clip.row + 1 })}>↓</button>
        </span>
      </Row>
      <Row label="Start">
        <NumInput
          value={clip.start_ms / 1000}
          step={0.1}
          min={0}
          suffix="s"
          onChange={(v) => onPatch(clip.id, { start_ms: Math.max(0, Math.round(v * 1000)) })}
        />
      </Row>
      <Row label="Length">
        <NumInput
          value={clip.duration_ms / 1000}
          step={0.1}
          min={0.25}
          suffix="s"
          onChange={(v) => onPatch(clip.id, { duration_ms: Math.max(250, Math.round(v * 1000)) })}
        />
      </Row>
      <Row label="Fade in">
        <Slider min={0} max={3} step={0.05} value={clip.fade_in_ms / 1000}
          onChange={(v) => onPatch(clip.id, { fade_in_ms: Math.round(v * 1000) })}
          suffix="s" />
      </Row>
      <Row label="Fade out">
        <Slider min={0} max={3} step={0.05} value={clip.fade_out_ms / 1000}
          onChange={(v) => onPatch(clip.id, { fade_out_ms: Math.round(v * 1000) })}
          suffix="s" />
      </Row>
    </Section>
  );
}

function VideoBody({
  clip,
  onPatch,
  onRetake,
  onEditStep,
  sourceById,
  busy,
}: {
  clip: Clip & { kind: "video" };
  onPatch: (id: string, patch: Partial<Clip>) => void;
  onRetake: (stepId: string) => void;
  onEditStep?: (stepId: string, patch: { title?: string; narration?: string; duration_ms?: number }) => void;
  sourceById: Record<string, TrackEntry>;
  busy?: boolean;
}) {
  const src = sourceById[clip.step_id];
  return (
    <>
      <Section title="Source">
        <Row label="Step">
          <span className="ci-mono">{clip.step_id}</span>
        </Row>
        <Row label="Match length">
          <Toggle
            checked={clip.match_source_length}
            onChange={(v) => onPatch(clip.id, { match_source_length: v })}
          />
        </Row>
      </Section>
      <Section title="Audio">
        <Row label="Volume">
          <Slider min={0} max={1.5} step={0.05} value={clip.volume}
            onChange={(v) => onPatch(clip.id, { volume: v })} suffix="x" />
        </Row>
      </Section>
      <Section title="Zoom (Ken-Burns)">
        <Row label="Enable">
          <Toggle checked={clip.zoom_enabled} onChange={(v) => onPatch(clip.id, { zoom_enabled: v })} />
        </Row>
        <Row label="Factor">
          <Slider min={1.0} max={3.0} step={0.05} value={clip.zoom_factor}
            onChange={(v) => onPatch(clip.id, { zoom_factor: v })} suffix="×" />
        </Row>
        <Row label="Origin X">
          <Slider min={0} max={100} step={1} value={clip.zoom_origin_x}
            onChange={(v) => onPatch(clip.id, { zoom_origin_x: v })} suffix="%" />
        </Row>
        <Row label="Origin Y">
          <Slider min={0} max={100} step={1} value={clip.zoom_origin_y}
            onChange={(v) => onPatch(clip.id, { zoom_origin_y: v })} suffix="%" />
        </Row>
      </Section>
      <div className="ci-actions">
        <button className="ci-btn ci-btn-ghost" disabled={busy} onClick={() => onRetake(clip.step_id)}>
          ↻ Re-record source
        </button>
      </div>
      <p className="ci-help">
        Re-recording replaces the source mp4 only. Length, fades, zoom, and
        position on the timeline are preserved.
      </p>
      {onEditStep && src ? (
        <Section title="Author the step (walkthrough.yaml)">
          <Row label="Title">
            <TextInput value={src.title} onChange={(v) => onEditStep(clip.step_id, { title: v })} />
          </Row>
          <Row label="Narration">
            <TextArea value={src.narration} onChange={(v) => onEditStep(clip.step_id, { narration: v })} />
          </Row>
          <Row label="Duration">
            <NumInput
              value={src.duration_ms / 1000}
              step={0.5}
              min={1}
              suffix="s"
              onChange={(v) => onEditStep(clip.step_id, { duration_ms: Math.round(v * 1000) })}
            />
          </Row>
        </Section>
      ) : null}
    </>
  );
}

function VoiceBody({
  clip,
  onPatch,
  onRenarrate,
  busy,
}: {
  clip: Clip & { kind: "voice" };
  onPatch: (id: string, patch: Partial<Clip>) => void;
  onRenarrate: (stepId: string) => void;
  busy?: boolean;
}) {
  return (
    <>
      <Section title="Source">
        <Row label="Step"><span className="ci-mono">{clip.step_id}</span></Row>
      </Section>
      <Section title="Audio">
        <Row label="Volume">
          <Slider min={0} max={1.5} step={0.05} value={clip.volume}
            onChange={(v) => onPatch(clip.id, { volume: v })} suffix="x" />
        </Row>
      </Section>
      <div className="ci-actions">
        <button className="ci-btn ci-btn-ghost" disabled={busy} onClick={() => onRenarrate(clip.step_id)}>
          🎤 Re-narrate
        </button>
      </div>
    </>
  );
}

function MusicBody({
  clip,
  onPatch,
  onGenerate,
  busy,
  error,
  onApplySuggestion,
}: {
  clip: Clip & { kind: "music" };
  onPatch: (id: string, patch: Partial<Clip>) => void;
  onGenerate: (id: string) => void;
  busy?: boolean;
  error?: { message: string; suggestion: string | null } | null;
  onApplySuggestion?: (id: string, suggestion: string) => void;
}) {
  return (
    <>
      <Section title="Generate from prompt">
        <Row label="Prompt">
          <TextArea
            value={clip.prompt ?? ""}
            onChange={(v) => onPatch(clip.id, { prompt: v })}
            placeholder="warm cinematic ambient, soft piano + light strings, no drums"
          />
        </Row>
      </Section>
      <div className="ci-actions">
        <button
          className="ci-btn ci-btn-primary"
          disabled={busy || !clip.prompt}
          onClick={() => onGenerate(clip.id)}
        >
          🎵 {busy ? "Generating…" : clip.asset_url ? "Re-generate" : "Generate"}
        </button>
      </div>
      {error ? (
        <div className="ci-music-error">
          <strong>Couldn't generate.</strong>
          <span>{error.message}</span>
          {error.suggestion ? (
            <>
              <div className="ci-music-suggestion">
                <span className="ci-music-suggestion-label">Try this prompt instead:</span>
                <span className="ci-music-suggestion-text">"{error.suggestion}"</span>
              </div>
              <button
                type="button"
                className="ci-btn ci-btn-ghost"
                onClick={() => onApplySuggestion?.(clip.id, error.suggestion ?? "")}
              >
                Use suggested prompt
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      {clip.asset_url ? (
        <audio
          controls
          src={clip.asset_url}
          className="ci-audio-preview"
          style={{ width: "100%", marginTop: 8 }}
        />
      ) : !error ? (
        <p className="ci-help">
          ElevenLabs Music. Length matches the clip's duration ({(clip.duration_ms / 1000).toFixed(0)}s).
        </p>
      ) : null}
      <Section title="Track">
        <Row label="Label">
          <TextInput value={clip.label} onChange={(v) => onPatch(clip.id, { label: v })} />
        </Row>
        <Row label="Loop">
          <Toggle checked={clip.loop} onChange={(v) => onPatch(clip.id, { loop: v })} />
        </Row>
      </Section>
      <Section title="Mix">
        <Row label="Volume">
          <Slider min={0} max={1.5} step={0.02} value={clip.volume}
            onChange={(v) => onPatch(clip.id, { volume: v })} suffix="x" />
        </Row>
      </Section>
    </>
  );
}

function TransitionBody({
  clip,
  transitions,
  onUpdateTransition,
  onOpenInCanvas,
}: {
  clip: Clip & { kind: "transition" };
  transitions: TransitionSpec[];
  onUpdateTransition?: (id: string, patch: Partial<TransitionSpec>) => void;
  onOpenInCanvas?: (id: string) => void;
}) {
  const spec = transitions.find((t) => t.id === clip.transition_id);
  if (!spec || !onUpdateTransition) {
    return (
      <Section title="Transition">
        <Row label="Refers to"><span className="ci-mono">{clip.transition_id || "(none)"}</span></Row>
      </Section>
    );
  }
  return (
    <>
      <Section title="Headline">
        <Row label="Text">
          <TextInput value={spec.text ?? ""} onChange={(v) => onUpdateTransition(spec.id, { text: v })} />
        </Row>
        <Row label="Subtext">
          <TextInput value={spec.subtext ?? ""} onChange={(v) => onUpdateTransition(spec.id, { subtext: v })} />
        </Row>
      </Section>
      <Section title="Style">
        <Row label="Kind">
          <select
            value={spec.kind}
            onChange={(e) => onUpdateTransition(spec.id, { kind: e.target.value as TransitionSpec["kind"] })}
          >
            <option value="title">Title</option>
            <option value="angled-mockup">Angled mockup</option>
            <option value="feature-zoom">Feature zoom</option>
          </select>
        </Row>
        <Row label="Font">
          <select
            value={spec.font}
            onChange={(e) => onUpdateTransition(spec.id, { font: e.target.value as TransitionSpec["font"] })}
          >
            <option value="display">Display</option>
            <option value="sans">Sans</option>
            <option value="serif">Serif</option>
            <option value="mono">Mono</option>
          </select>
        </Row>
        <Row label="Background">
          <select
            value={spec.bg}
            onChange={(e) => onUpdateTransition(spec.id, { bg: e.target.value as TransitionSpec["bg"] })}
          >
            <option value="aurora-amber">Aurora amber</option>
            <option value="aurora-pink">Aurora pink</option>
            <option value="aurora-blue">Aurora blue</option>
            <option value="aurora-mint">Aurora mint</option>
            <option value="aurora-graphite">Aurora graphite</option>
            <option value="void">Void</option>
            <option value="paper">Paper</option>
          </select>
        </Row>
        {spec.kind === "title" ? (
          <Row label="Layout">
            <select
              value={spec.layout ?? "scatter"}
              onChange={(e) => onUpdateTransition(spec.id, { layout: e.target.value as TransitionSpec["layout"] })}
            >
              <option value="scatter">Scatter</option>
              <option value="stack">Stack</option>
              <option value="grid">Grid</option>
              <option value="split-vertical">Split vertical</option>
              <option value="hero-cover-tl">Hero cover ↖</option>
              <option value="hero-cover-tr">Hero cover ↗</option>
              <option value="hero-cover-bl">Hero cover ↙</option>
              <option value="hero-cover-br">Hero cover ↘</option>
            </select>
          </Row>
        ) : null}
      </Section>
      {onOpenInCanvas ? (
        <div className="ci-actions">
          <button className="ci-btn ci-btn-ghost" onClick={() => onOpenInCanvas(spec.id)} type="button">
            Preview in canvas →
          </button>
        </div>
      ) : null}
    </>
  );
}

function CaptionBody({
  clip,
  onPatch,
}: {
  clip: Clip & { kind: "caption" };
  onPatch: (id: string, patch: Partial<Clip>) => void;
}) {
  return (
    <Section title="Caption">
      <Row label="Text"><TextInput value={clip.text} onChange={(v) => onPatch(clip.id, { text: v })} /></Row>
      <Row label="Align">
        <select value={clip.align} onChange={(e) => onPatch(clip.id, { align: e.target.value as "top" | "center" | "bottom" })}>
          <option value="top">Top</option>
          <option value="center">Center</option>
          <option value="bottom">Bottom</option>
        </select>
      </Row>
    </Section>
  );
}

function BananaBody({
  clip,
  onPatch,
  onGenerate,
  busy,
  sourceById,
}: {
  clip: Clip & { kind: "banana" };
  onPatch: (id: string, patch: Partial<Clip>) => void;
  onGenerate: (id: string) => void;
  busy?: boolean;
  sourceById: Record<string, TrackEntry>;
}) {
  return (
    <>
      <Section title="Nano Banana image">
        <Row label="Prompt">
          <TextArea value={clip.prompt} onChange={(v) => onPatch(clip.id, { prompt: v })} />
        </Row>
        <Row label="Layout">
          <select value={clip.layout} onChange={(e) => onPatch(clip.id, { layout: e.target.value as "fullscreen" | "lower-third" | "corner" })}>
            <option value="fullscreen">Fullscreen</option>
            <option value="lower-third">Lower-third</option>
            <option value="corner">Corner badge</option>
          </select>
        </Row>
        <Row label="Reference step">
          <select
            value={clip.ref_step_id ?? ""}
            onChange={(e) => onPatch(clip.id, { ref_step_id: e.target.value || null })}
          >
            <option value="">— none —</option>
            {Object.values(sourceById).map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </Row>
      </Section>
      <div className="ci-actions">
        <button
          className="ci-btn ci-btn-primary"
          disabled={busy || !clip.prompt}
          onClick={() => onGenerate(clip.id)}
        >
          🍌 {clip.asset_url ? "Re-generate" : "Generate"}
        </button>
      </div>
      {clip.asset_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={clip.asset_url} alt="" className="ci-banana-preview" />
      ) : (
        <p className="ci-help">Powered by Gemini 2.5 Flash Image. Reference step composes the screenshot in.</p>
      )}
    </>
  );
}

function TypedBody({
  clip,
  onPatch,
}: {
  clip: Clip & { kind: "typed" };
  onPatch: (id: string, patch: Partial<Clip>) => void;
}) {
  return (
    <>
      <Section title="Typed text">
        <Row label="Lines">
          <TextArea
            value={clip.strings.join("\n")}
            onChange={(v) => onPatch(clip.id, { strings: v.split("\n").filter(Boolean) })}
            placeholder="One line per typed string"
          />
        </Row>
        <Row label="Loop">
          <Toggle checked={clip.loop} onChange={(v) => onPatch(clip.id, { loop: v })} />
        </Row>
        <Row label="Cursor">
          <Toggle checked={clip.show_cursor} onChange={(v) => onPatch(clip.id, { show_cursor: v })} />
        </Row>
      </Section>
      <Section title="Style">
        <Row label="Font">
          <TextInput value={clip.font_family} onChange={(v) => onPatch(clip.id, { font_family: v })} />
        </Row>
        <Row label="Size">
          <NumInput value={clip.font_size_px} step={2} min={12}
            onChange={(v) => onPatch(clip.id, { font_size_px: Math.round(v) })} suffix="px" />
        </Row>
        <Row label="Color">
          <input type="color" value={clip.color} onChange={(e) => onPatch(clip.id, { color: e.target.value })} />
        </Row>
        <Row label="Background">
          <input type="color" value={clip.bg_color === "transparent" ? "#000000" : clip.bg_color}
            onChange={(e) => onPatch(clip.id, { bg_color: e.target.value })} />
        </Row>
        <Row label="Align">
          <select value={clip.align} onChange={(e) => onPatch(clip.id, { align: e.target.value as "top" | "center" | "bottom" })}>
            <option value="top">Top</option>
            <option value="center">Center</option>
            <option value="bottom">Bottom</option>
          </select>
        </Row>
      </Section>
      <Section title="Animation">
        <Row label="Type speed">
          <Slider min={20} max={200} step={5} value={clip.type_speed_ms}
            onChange={(v) => onPatch(clip.id, { type_speed_ms: Math.round(v) })} suffix="ms/char" />
        </Row>
        <Row label="Back speed">
          <Slider min={20} max={200} step={5} value={clip.back_speed_ms}
            onChange={(v) => onPatch(clip.id, { back_speed_ms: Math.round(v) })} suffix="ms/char" />
        </Row>
      </Section>
    </>
  );
}

const KIND_LABEL: Record<Clip["kind"], string> = {
  video: "Video clip",
  voice: "Voice clip",
  music: "Music clip",
  transition: "Transition",
  caption: "Caption",
  banana: "Banana image",
  typed: "Typed text",
};

// ───────────── primitives ─────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="ci-section">
      <div className="ci-section-title">{title}</div>
      <div className="ci-section-body">{children}</div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="ci-row">
      <span className="ci-row-label">{label}</span>
      <span className="ci-row-control">{children}</span>
    </div>
  );
}

function Slider({
  min, max, step, value, onChange, suffix,
}: {
  min: number; max: number; step: number; value: number;
  onChange: (v: number) => void; suffix?: string;
}) {
  return (
    <span className="ci-slider">
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
      <span className="ci-slider-val">{value.toFixed(2)}{suffix ?? ""}</span>
    </span>
  );
}

function NumInput({
  value, onChange, step = 1, min, suffix,
}: { value: number; onChange: (v: number) => void; step?: number; min?: number; suffix?: string }) {
  return (
    <span className="ci-num">
      <input type="number" value={value} step={step} min={min}
        onChange={(e) => onChange(Number(e.target.value))} />
      {suffix ? <span className="ci-num-suffix">{suffix}</span> : null}
    </span>
  );
}

function TextInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return <input type="text" className="ci-text" value={value} onChange={(e) => onChange(e.target.value)} />;
}
function TextArea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <textarea className="ci-textarea" value={value} placeholder={placeholder} rows={3}
      onChange={(e) => onChange(e.target.value)} />
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`ci-toggle ${checked ? "on" : ""}`}
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
    >
      <span className="ci-toggle-knob" />
    </button>
  );
}
