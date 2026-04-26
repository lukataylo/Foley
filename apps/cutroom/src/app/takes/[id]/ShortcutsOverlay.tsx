"use client";

// Modal listing every keyboard shortcut the editor responds to. Trigger
// with "?" — the same key shows / hides it. Pressing Escape closes.
//
// Kept as a single source of truth for the shortcut hint button in the
// editor toolbar; if you add a new shortcut, add a row here too.

import { useEffect } from "react";

interface Group {
  title: string;
  rows: { keys: string; label: string }[];
}

const GROUPS: Group[] = [
  {
    title: "Playback",
    rows: [
      { keys: "Space", label: "Play / pause" },
      { keys: "← / →", label: "Seek 1s (Shift = 5s)" },
      { keys: "J / L", label: "Jump to previous / next clip" },
    ],
  },
  {
    title: "Selection & editing",
    rows: [
      { keys: "Click", label: "Select a clip" },
      { keys: "Esc", label: "Clear selection" },
      { keys: "Delete / ⌫", label: "Delete the selected clip" },
      { keys: "S", label: "Split the selected clip at the playhead" },
      { keys: "⌘D / Ctrl+D", label: "Duplicate the selected clip" },
      { keys: "⇧ + Click", label: "Add a clip to the selection (multi-select)" },
    ],
  },
  {
    title: "History",
    rows: [
      { keys: "⌘Z / Ctrl+Z", label: "Undo" },
      { keys: "⇧⌘Z / ⌘Y", label: "Redo" },
    ],
  },
  {
    title: "Help",
    rows: [
      { keys: "?", label: "Show / hide this overlay" },
    ],
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsOverlay({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="kbd-overlay" onClick={onClose} role="dialog" aria-label="Keyboard shortcuts">
      <div className="kbd-modal" onClick={(e) => e.stopPropagation()}>
        <div className="kbd-head">
          <h3>Keyboard shortcuts</h3>
          <button type="button" className="kbd-close" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="kbd-body">
          {GROUPS.map((g) => (
            <section key={g.title} className="kbd-group">
              <h4>{g.title}</h4>
              <ul>
                {g.rows.map((r) => (
                  <li key={r.keys}>
                    <kbd>{r.keys}</kbd>
                    <span>{r.label}</span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
