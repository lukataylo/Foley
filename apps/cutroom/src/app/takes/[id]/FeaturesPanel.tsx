"use client";

// Replaces the legacy rail-tabs + SidePanel. A single scrollable list of
// Foley capabilities, each with a preview clip and a Try button that
// invokes the real handler (selecting/adding clips, opening transitions,
// etc.). Aim is to make every Foley capability discoverable in one place.

import { useMemo, useRef } from "react";

interface Feature {
  id: string;
  title: string;
  blurb: string;
  glyph: string;
  tone: "amber" | "mint" | "sky" | "rose" | "violet" | "graphite";
  /** If set, the preview area loops the master mp4 starting at this second. */
  previewMasterStartS?: number;
  ctaLabel: string;
}

interface Props {
  masterUrl: string;
  selectedClipId: string | null;
  onAddBanana: () => void;
  onAddTyped: () => void;
  onAddMusic: () => void;
  onAddCaption: () => void;
  onOpenTransitions: () => void;
  onRetakeSelected: () => void;
  onRenarrateSelected: () => void;
  onOpenWatching: () => void;
  busy: boolean;
}

const FEATURES: Feature[] = [
  {
    id: "pr-detect",
    title: "Detect changes from PRs",
    blurb: "Foley diffs every PR against your walkthrough and flags exactly which scenes are stale.",
    glyph: "✱",
    tone: "amber",
    previewMasterStartS: 8,
    ctaLabel: "See watching state",
  },
  {
    id: "retake",
    title: "Retake a scene",
    blurb: "Replace the source mp4 only — your timeline edits (length, fades, zoom) are preserved.",
    glyph: "↻",
    tone: "mint",
    previewMasterStartS: 14,
    ctaLabel: "Retake selected",
  },
  {
    id: "renarrate",
    title: "Re-narrate with Charlotte",
    blurb: "Edit the script and ElevenLabs regenerates only the affected steps. Hash-cached.",
    glyph: "🎤",
    tone: "violet",
    previewMasterStartS: 22,
    ctaLabel: "Re-narrate selected",
  },
  {
    id: "music",
    title: "Generate background music",
    blurb: "Drop a music track, describe the mood, ElevenLabs Music writes a bespoke score.",
    glyph: "🎵",
    tone: "sky",
    ctaLabel: "Add music track",
  },
  {
    id: "banana",
    title: "Compose with Nano Banana",
    blurb: "Gemini 2.5 Flash composes screenshots into laptop mockups or stylizes transitions.",
    glyph: "🍌",
    tone: "amber",
    ctaLabel: "Add banana clip",
  },
  {
    id: "typed",
    title: "Animated headlines",
    blurb: "Type-on text overlays for chapter cards and transitions. typed.js-driven.",
    glyph: "⌨",
    tone: "graphite",
    ctaLabel: "Add typed clip",
  },
  {
    id: "captions",
    title: "Captions",
    blurb: "Burn-in captions for the social cut. Pulled from the narration script automatically.",
    glyph: "📝",
    tone: "rose",
    ctaLabel: "Add caption",
  },
  {
    id: "transitions",
    title: "Transitions",
    blurb: "Title cards, angled mockups, feature zooms. Picks the layout that fits the diff.",
    glyph: "✨",
    tone: "amber",
    previewMasterStartS: 0,
    ctaLabel: "Open transitions",
  },
];

export function FeaturesPanel(p: Props) {
  // Keep a single shared <video> ref per feature so each preview
  // independently loops a slice of the master.
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({});

  const handleClick = useMemo(() => {
    return (id: string) => {
      switch (id) {
        case "pr-detect":     return p.onOpenWatching();
        case "retake":        return p.onRetakeSelected();
        case "renarrate":     return p.onRenarrateSelected();
        case "music":         return p.onAddMusic();
        case "banana":        return p.onAddBanana();
        case "typed":         return p.onAddTyped();
        case "captions":      return p.onAddCaption();
        case "transitions":   return p.onOpenTransitions();
      }
    };
  }, [p]);

  return (
    <div className="features-panel">
      <header className="features-header">
        <h2>What Foley does</h2>
        <p>Click any to try it on this take.</p>
      </header>
      <div className="features-list">
        {FEATURES.map((f) => (
          <article key={f.id} className={`feature-card tone-${f.tone}`}>
            <div className="feature-thumb">
              {f.previewMasterStartS != null ? (
                <video
                  ref={(el) => { videoRefs.current[f.id] = el; }}
                  src={`${p.masterUrl}#t=${f.previewMasterStartS},${f.previewMasterStartS + 4}`}
                  muted
                  loop
                  autoPlay
                  playsInline
                  preload="metadata"
                  className="feature-thumb-video"
                />
              ) : (
                <div className="feature-thumb-glyph">{f.glyph}</div>
              )}
              <span className="feature-thumb-badge">{f.glyph}</span>
            </div>
            <div className="feature-meta">
              <h3>{f.title}</h3>
              <p>{f.blurb}</p>
              <button
                type="button"
                className="feature-cta"
                onClick={() => handleClick(f.id)}
                disabled={p.busy}
              >
                {f.ctaLabel} →
              </button>
            </div>
          </article>
        ))}
      </div>
      <footer className="features-foot">
        <span>Selected:</span>
        <code>{p.selectedClipId ?? "—"}</code>
      </footer>
    </div>
  );
}
