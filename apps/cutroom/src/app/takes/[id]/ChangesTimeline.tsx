"use client";

// Toggleable bottom panel: a chronological list of code-driven changes
// (PR diffs that landed against this walkthrough) grouped by Today /
// Yesterday / date. Click a change to open the suggestion preview on
// the canvas — same mechanism the SuggestionsPanel uses.

import { useEffect, useMemo, useState } from "react";

interface Change {
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
  /** ISO timestamp of the take's creation. */
  created_at?: string;
}

interface Props {
  walkthroughId: string;
  onPreview: (change: Change) => void;
  onInsert: (change: Change) => void;
}

interface Bucket {
  label: string;
  rank: number;
  changes: Change[];
}

function bucketLabel(iso: string | undefined): { label: string; rank: number } {
  if (!iso) return { label: "Earlier", rank: 0 };
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  if (sameDay(d, today)) return { label: "Today", rank: 100 };
  if (sameDay(d, yesterday)) return { label: "Yesterday", rank: 99 };
  // Older — show the date.
  return {
    label: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    rank: -d.getTime(),
  };
}

export function ChangesTimeline({ walkthroughId, onPreview, onInsert }: Props) {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void Promise.all([
      fetch(`/api/walkthroughs/${walkthroughId}/suggestions`).then((r) => r.json()),
      fetch(`/api/walkthroughs/${walkthroughId}/takes`).then((r) => r.ok ? r.json() : { takes: [] }).catch(() => ({ takes: [] })),
    ]).then(([suggJ, takesJ]: [{ suggestions: Change[] }, { takes: Array<{ id: string; created_at?: string }> }]) => {
      if (cancelled) return;
      const tsByTakeId = new Map((takesJ.takes ?? []).map((t) => [t.id, t.created_at]));
      const enriched = (suggJ.suggestions ?? []).map((s) => ({
        ...s,
        created_at: tsByTakeId.get(s.take_id),
      }));
      setChanges(enriched);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [walkthroughId]);

  const buckets = useMemo<Bucket[]>(() => {
    const map = new Map<string, Bucket>();
    for (const c of changes) {
      const { label, rank } = bucketLabel(c.created_at);
      const existing = map.get(label);
      if (existing) existing.changes.push(c);
      else map.set(label, { label, rank, changes: [c] });
    }
    return Array.from(map.values()).sort((a, b) => b.rank - a.rank);
  }, [changes]);

  return (
    <section className="changes-timeline">
      <div className="changes-header">
        <h2>Changes from your codebase</h2>
        <span className="changes-count">
          {loading ? "loading…" : `${changes.length} ${changes.length === 1 ? "change" : "changes"}`}
        </span>
      </div>
      <div className="changes-list">
        {loading ? null : buckets.length === 0 ? (
          <div className="changes-empty">
            No changes yet. Open a PR or run <code>director dry-review</code>.
          </div>
        ) : (
          buckets.map((bucket) => (
            <div key={bucket.label} className="changes-bucket">
              <div className="changes-bucket-label">{bucket.label}</div>
              <ol className="changes-rail">
                {bucket.changes.map((c) => (
                  <li
                    key={c.id}
                    className={`changes-row status-${c.status} ${activeId === c.id ? "active" : ""}`}
                    onClick={() => { setActiveId(c.id); onPreview(c); }}
                  >
                    <span className={`changes-dot status-${c.status}`} />
                    <span className="changes-row-main">
                      <span className="changes-row-title">
                        {c.status === "added" ? "Added" : "Updated"}: {c.title}
                      </span>
                      {c.pr_title ? (
                        <span className="changes-row-sub">
                          {c.pr_number ? `#${c.pr_number} · ` : ""}{c.pr_title}
                        </span>
                      ) : null}
                      <span className="changes-row-reason">{c.reason}</span>
                    </span>
                    <button
                      className="changes-row-cta"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onInsert(c); }}
                      title="Insert into timeline"
                    >
                      ↧
                    </button>
                  </li>
                ))}
              </ol>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
