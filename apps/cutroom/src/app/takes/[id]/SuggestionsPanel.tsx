"use client";

// Replaces the old FeaturesPanel. Lists block-level suggestions derived
// from PR takes — each one is an added or changed step the director
// agent proposed. Click any to preview it on the canvas; click Insert
// to drop the proposed step into the overlay as a new video clip.

import { useEffect, useState } from "react";

interface Suggestion {
  id: string;
  take_id: string;
  pr_title: string | null;
  pr_number: number | null;
  status: "added" | "changed";
  step_id: string;
  title: string;
  narration: string;
  reason: string;
  duration_ms: number;
  frame_url: string | null;
  proposed_step: unknown;
}

interface Props {
  walkthroughId: string;
  selectedClipId: string | null;
  onPreview: (suggestion: Suggestion) => void;
  onInsert: (suggestion: Suggestion) => void;
  busy: boolean;
}

export function SuggestionsPanel(p: Props) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetch(`/api/walkthroughs/${p.walkthroughId}/suggestions`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setSuggestions(j.suggestions ?? []); })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [p.walkthroughId]);

  const added = suggestions.filter((s) => s.status === "added");
  const changed = suggestions.filter((s) => s.status === "changed");

  return (
    <div className="sgx-panel">
      <header className="sgx-header">
        <h2>Suggestions</h2>
        <p>From recent PRs. Click to preview, insert to drop into the timeline.</p>
      </header>

      {loading ? (
        <div className="sgx-empty">Loading…</div>
      ) : suggestions.length === 0 ? (
        <div className="sgx-empty">
          No suggestions yet — open a PR or run <code>director dry-review</code>.
        </div>
      ) : (
        <div className="sgx-list">
          {added.length > 0 && (
            <div className="sgx-group">
              <div className="sgx-group-label">
                <span className="sgx-dot sgx-dot-added" />
                New blocks
                <span className="sgx-group-count">{added.length}</span>
              </div>
              {added.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  active={activeId === s.id}
                  onPreview={() => { setActiveId(s.id); p.onPreview(s); }}
                  onInsert={() => p.onInsert(s)}
                  busy={p.busy}
                />
              ))}
            </div>
          )}
          {changed.length > 0 && (
            <div className="sgx-group">
              <div className="sgx-group-label">
                <span className="sgx-dot sgx-dot-changed" />
                Updates to existing blocks
                <span className="sgx-group-count">{changed.length}</span>
              </div>
              {changed.map((s) => (
                <SuggestionCard
                  key={s.id}
                  suggestion={s}
                  active={activeId === s.id}
                  onPreview={() => { setActiveId(s.id); p.onPreview(s); }}
                  onInsert={() => p.onInsert(s)}
                  busy={p.busy}
                  insertLabel="Apply update"
                />
              ))}
            </div>
          )}
        </div>
      )}

      <footer className="sgx-foot">
        <span>Selected:</span>
        <code>{p.selectedClipId ?? "—"}</code>
      </footer>
    </div>
  );
}

function SuggestionCard({
  suggestion: s,
  active,
  onPreview,
  onInsert,
  busy,
  insertLabel = "Insert into timeline",
}: {
  suggestion: Suggestion;
  active: boolean;
  onPreview: () => void;
  onInsert: () => void;
  busy: boolean;
  insertLabel?: string;
}) {
  return (
    <article className={`sgx-card ${active ? "active" : ""} status-${s.status}`}>
      <div
        className="sgx-thumb"
        style={s.frame_url ? { backgroundImage: `url(${s.frame_url})` } : undefined}
        onClick={onPreview}
        role="button"
        tabIndex={0}
      >
        <span className={`sgx-status sgx-status-${s.status}`}>
          {s.status === "added" ? "NEW" : "UPDATE"}
        </span>
        <span className="sgx-play-glyph">▶</span>
      </div>
      <div className="sgx-meta">
        <h3 className="sgx-title">{s.title}</h3>
        {s.pr_title ? (
          <div className="sgx-pr">
            {s.pr_number ? `#${s.pr_number} · ` : ""}{s.pr_title}
          </div>
        ) : null}
        <p className="sgx-narration">{s.narration || s.reason}</p>
        <div className="sgx-actions">
          <button type="button" className="sgx-btn-ghost" onClick={onPreview}>
            Preview
          </button>
          <button
            type="button"
            className="sgx-btn-primary"
            onClick={onInsert}
            disabled={busy}
          >
            {insertLabel} →
          </button>
        </div>
      </div>
    </article>
  );
}
