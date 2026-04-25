"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { DocPage, DocKind } from "@/lib/docs";

interface Props {
  walkthroughId: string;
  walkthroughTitle: string;
  walkthroughVersion: number;
  docs: DocPage[];
  /** The pinned project cards stack — server-rendered. */
  projectStrip: React.ReactNode;
  /** Header right-side: theme toggle, share, etc. */
  headerActions: React.ReactNode;
}

const KIND_LABEL: Record<DocKind, string> = {
  video: "Video",
  steps: "Steps",
  text: "Text",
};

export function WalkthroughLayout({
  walkthroughId,
  walkthroughTitle,
  walkthroughVersion,
  docs,
  projectStrip,
  headerActions,
}: Props) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<Record<DocKind, boolean>>({
    video: true,
    steps: true,
    text: true,
  });
  const [search, setSearch] = useState("");

  const visibleDocs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return docs.filter((d) => {
      if (!filter[d.kind]) return false;
      if (q && !`${d.title} ${d.summary}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [docs, filter, search]);

  const groups = useMemo(() => {
    const out: Record<string, DocPage[]> = {};
    for (const d of docs) {
      const k = d.group ?? "Other";
      if (!out[k]) out[k] = [];
      out[k].push(d);
    }
    return out;
  }, [docs]);

  return (
    <div className={`wt ${open ? "wt-sidebar-open" : ""}`}>
      <header className="wt-header">
        <div className="wt-header-left">
          <button
            type="button"
            className="wt-burger"
            onClick={() => setOpen((o) => !o)}
            aria-label="Toggle docs sidebar"
            aria-pressed={open}
          >
            <span className="wt-burger-bar" />
            <span className="wt-burger-bar" />
            <span className="wt-burger-bar" />
          </button>
          <Link href="/" className="detail-back">← Walkthroughs</Link>
        </div>
        <div className="actions">{headerActions}</div>
      </header>

      <div className="wt-titleblock">
        <p className="detail-eyebrow">Project · v{walkthroughVersion}</p>
        <h1 className="detail-title">{walkthroughTitle}</h1>
      </div>

      <aside className="wt-sidebar" aria-hidden={!open}>
        <div className="wt-sidebar-inner">
          <div className="wt-sidebar-section">
            <div className="wt-sidebar-label">Search</div>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Find a doc"
              className="wt-search"
            />
          </div>
          <div className="wt-sidebar-section">
            <div className="wt-sidebar-label">Show</div>
            {(Object.keys(KIND_LABEL) as DocKind[]).map((k) => (
              <label key={k} className="wt-filter-row">
                <input
                  type="checkbox"
                  checked={filter[k]}
                  onChange={(e) => setFilter((f) => ({ ...f, [k]: e.target.checked }))}
                />
                <span className={`kind-pill kind-${k}`}>{KIND_LABEL[k]}</span>
                <span className="wt-filter-count">
                  {docs.filter((d) => d.kind === k).length}
                </span>
              </label>
            ))}
          </div>
          <div className="wt-sidebar-section">
            <div className="wt-sidebar-label">Hierarchy</div>
            {Object.entries(groups).map(([groupName, items]) => (
              <div key={groupName} className="wt-tree-group">
                <div className="wt-tree-group-label">{groupName}</div>
                {items.map((d) => (
                  <Link
                    key={d.id}
                    href={`/walkthroughs/${walkthroughId}/docs/${d.id}`}
                    className="wt-tree-item"
                  >
                    <span className={`wt-tree-glyph kind-${d.kind}`} />
                    <span className="wt-tree-title">{d.title}</span>
                  </Link>
                ))}
              </div>
            ))}
          </div>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          className="wt-scrim"
          onClick={() => setOpen(false)}
          aria-label="Close sidebar"
        />
      ) : null}

      <main className="wt-main">
        <section className="wt-project-section">
          {projectStrip}
        </section>

        <section className="wt-docs-section">
          <div className="wt-docs-header">
            <h2>Documentation</h2>
            <div className="wt-docs-meta">
              {visibleDocs.length} of {docs.length}
              {search ? <span> · "{search}"</span> : null}
            </div>
            <button className="btn-primary" type="button" disabled title="Authoring flow lands next">
              + New doc
            </button>
          </div>

          {visibleDocs.length === 0 ? (
            <div className="wt-empty">
              No docs match. Try a different filter or search.
            </div>
          ) : (
            <div className="wt-docs-grid">
              {visibleDocs.map((d) => (
                <DocCard key={d.id} doc={d} walkthroughId={walkthroughId} />
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function DocCard({ doc, walkthroughId }: { doc: DocPage; walkthroughId: string }) {
  const href = `/walkthroughs/${walkthroughId}/docs/${doc.id}`;
  const updated = relativeTime(doc.updated_at);

  // Each kind renders as its own card shape. Layout is dictated by the
  // content type, not a uniform thumbnail-then-body shell.
  if (doc.kind === "video") {
    const poster = `/walkthroughs/${walkthroughId}/steps/intro.png`;
    return (
      <Link href={href} className="doc-card doc-card-video">
        <div className="doc-video-poster" style={{ backgroundImage: `url(${poster})` }}>
          <span className="doc-video-play" aria-hidden="true">▶</span>
          <div className="doc-video-shade" />
          <div className="doc-video-meta-line">
            <span className="kind-pill kind-video">video</span>
            <span className="doc-video-time">{doc.duration_s.toFixed(0)}s · {doc.step_count} steps</span>
          </div>
        </div>
        <div className="doc-card-body">
          <div className="doc-card-title">{doc.title}</div>
          <div className="doc-card-summary">{doc.summary}</div>
          <div className="doc-card-meta">{doc.group ? `${doc.group} · ` : ""}{updated}</div>
        </div>
      </Link>
    );
  }

  if (doc.kind === "steps") {
    return (
      <Link href={href} className="doc-card doc-card-steps">
        <div className="doc-card-row">
          <span className="kind-pill kind-steps">step-by-step</span>
          {doc.group ? <span className="doc-card-group">{doc.group}</span> : null}
          <Sparkle />
        </div>
        <div className="doc-card-title">{doc.title}</div>
        <div className="doc-card-summary">{doc.summary}</div>
        <ol className="doc-steps-preview">
          {doc.steps.slice(0, 3).map((s, i) => (
            <li key={i}>
              <span className="num">{String(i + 1).padStart(2, "0")}</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.image_url} alt="" />
              <span className="caption">{s.caption}</span>
            </li>
          ))}
          {doc.steps.length > 3 ? (
            <li className="doc-steps-more">+ {doc.steps.length - 3} more</li>
          ) : null}
        </ol>
        <div className="doc-card-meta">{updated}</div>
      </Link>
    );
  }

  // text
  const body = (doc as import("@/lib/docs").TextDoc).body ?? doc.summary;
  // Extract a couple of paragraph-like lines (ignoring markdown headings
  // that live in the body) for a paper-note feel.
  const lines = body
    .split(/\n+/)
    .filter((l) => l.trim().length > 0 && !l.startsWith("#") && !l.startsWith("- "));
  return (
    <Link href={href} className="doc-card doc-card-text">
      <div className="doc-card-row">
        <span className="kind-pill kind-text">text</span>
        {doc.group ? <span className="doc-card-group">{doc.group}</span> : null}
        <Sparkle />
      </div>
      <h3 className="doc-text-title">{doc.title}</h3>
      <div className="doc-text-body">
        {lines.slice(0, 5).map((l, i) => (
          <p key={i}>{l}</p>
        ))}
      </div>
      <div className="doc-card-meta">
        {(doc as import("@/lib/docs").TextDoc).word_count} words · {updated}
      </div>
    </Link>
  );
}

function Sparkle() {
  return (
    <svg className="sparkle" width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ marginLeft: "auto" }}>
      <path
        d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const seconds = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
