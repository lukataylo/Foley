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
        <div className="wt-strip">{projectStrip}</div>

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

  return (
    <Link href={href} className={`doc-card doc-card-${doc.kind}`}>
      <div className="doc-card-preview">
        {doc.kind === "video" ? <VideoPreview doc={doc} walkthroughId={walkthroughId} /> : null}
        {doc.kind === "steps" ? <StepsPreview doc={doc} /> : null}
        {doc.kind === "text"  ? <TextPreview doc={doc} /> : null}
      </div>
      <div className="doc-card-body">
        <div className="doc-card-row">
          <span className={`kind-pill kind-${doc.kind}`}>{KIND_LABEL[doc.kind]}</span>
          {doc.group ? <span className="doc-card-group">{doc.group}</span> : null}
        </div>
        <div className="doc-card-title">{doc.title}</div>
        <div className="doc-card-summary">{doc.summary}</div>
        <div className="doc-card-meta">{updated}</div>
      </div>
    </Link>
  );
}

function VideoPreview({
  doc,
  walkthroughId,
}: { doc: import("@/lib/docs").VideoDoc; walkthroughId: string }) {
  const poster = `/walkthroughs/${walkthroughId}/steps/intro.png`;
  return (
    <div className="dp-video" style={{ backgroundImage: `url(${poster})` }}>
      <div className="dp-play">▶</div>
      <div className="dp-video-meta">
        <span>{doc.duration_s.toFixed(0)}s</span>
        <span>·</span>
        <span>{doc.step_count} steps</span>
      </div>
    </div>
  );
}

function StepsPreview({ doc }: { doc: import("@/lib/docs").StepsDoc }) {
  return (
    <div className="dp-steps">
      <div className="dp-steps-strip">
        {doc.steps.slice(0, 4).map((s, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={s.image_url} alt="" />
        ))}
      </div>
      <div className="dp-steps-meta">{doc.steps.length} steps</div>
    </div>
  );
}

function TextPreview({ doc }: { doc: import("@/lib/docs").TextDoc }) {
  return (
    <div className="dp-text">
      <div className="dp-text-glyph">Aa</div>
      <div className="dp-text-meta">{doc.word_count} words</div>
    </div>
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
