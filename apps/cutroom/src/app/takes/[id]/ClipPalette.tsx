"use client";

// Drag sources for new timeline clips. Each entry sets a custom MIME type
// that Timeline2's lanes look for in dragover/drop. Compatibility map
// below restricts which tracks accept which kinds.

import { type EditOverlay } from "@/lib/timeline";

export interface PaletteItem {
  id: string;
  label: string;
  glyph: string;
  blurb: string;
  /** which tracks this can be dropped on */
  allowed: (keyof EditOverlay["tracks"])[];
}

export const PALETTE: PaletteItem[] = [
  {
    id: "music",
    label: "Music bed",
    glyph: "🎵",
    blurb: "Background score under everything.",
    allowed: ["music"],
  },
  {
    id: "caption",
    label: "Caption",
    glyph: "📝",
    blurb: "Lower-third text overlay.",
    allowed: ["caption"],
  },
  {
    id: "banana",
    label: "Nano Banana",
    glyph: "🍌",
    blurb: "Gemini 2.5 Flash composes an image — drop, prompt, generate.",
    allowed: ["banana"],
  },
  {
    id: "typed",
    label: "Typed text",
    glyph: "⌨",
    blurb: "Headline typed onto screen with a cursor. typed.js.",
    allowed: ["typed"],
  },
];

interface Props {
  collapsed?: boolean;
}

export function ClipPalette(p: Props) {
  return (
    <div className={`palette ${p.collapsed ? "collapsed" : ""}`}>
      <div className="palette-title">Add to timeline</div>
      <div className="palette-grid">
        {PALETTE.map((item) => (
          <div
            key={item.id}
            className="palette-item"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData("application/x-foley-palette", item.id);
              e.dataTransfer.effectAllowed = "copy";
            }}
            title={item.blurb}
          >
            <span className="palette-glyph">{item.glyph}</span>
            <div className="palette-meta">
              <div className="palette-label">{item.label}</div>
              <div className="palette-blurb">{item.blurb}</div>
            </div>
            <span className="palette-grip">⋮⋮</span>
          </div>
        ))}
      </div>
      <p className="palette-help">
        Drag onto a track to add. Click any clip to edit it on the right.
      </p>
    </div>
  );
}
