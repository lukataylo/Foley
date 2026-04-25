// Project page — pinned project cards on top, doc grid below, hamburger-toggled
// sidebar with filter + tree. Hosts many docs of varying kinds.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { listTakes, loadWalkthrough } from "@/lib/fs";
import { loadDocs } from "@/lib/docs";
import { WalkthroughLayout } from "./WalkthroughLayout";

export const dynamic = "force-dynamic";

function Octocat() {
  return (
    <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden="true" className="gh-mark">
      <path
        fillRule="evenodd"
        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 4 0c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z"
      />
    </svg>
  );
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export default async function WalkthroughDetailPage({
  params,
}: {
  params: { id: string };
}) {
  let wt, takes, docs;
  try {
    wt = await loadWalkthrough(params.id);
    takes = await listTakes(params.id);
    docs = await loadDocs(params.id);
  } catch {
    notFound();
  }

  const repoShort = wt.target_app.repo;
  const recent = takes
    .slice()
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 4);

  // Compact project strip: Watching · Brand · Activity. Three sticky cards
  // with a quieter palette so the docs below get visual priority.
  const projectStrip = (
    <>
      <div className="strip-card strip-watching">
        <div className="strip-head">
          <Octocat />
          <span className="strip-title">Watching</span>
          <span className="strip-live"><span className="dot" /> live</span>
        </div>
        <a
          className="strip-row strip-link"
          href={`https://github.com/${repoShort}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="k">Repo</span>
          <span className="v mono">{repoShort} <span className="ext">↗</span></span>
        </a>
        <div className="strip-row"><span className="k">Director</span><span className="v">Sonnet 4.6</span></div>
        <div className="strip-row"><span className="k">Webhook</span><span className="v mono">/api/webhook/github</span></div>
      </div>

      <div className="strip-card strip-brand">
        <div className="strip-head">
          <span className="strip-title">Brand</span>
          <span className="strip-meta">🔒 locked</span>
        </div>
        <div className="strip-row"><span className="k">Voice</span><span className="v">{wt.brand.voice_name} · en-GB</span></div>
        <div className="strip-row"><span className="k">Pacing</span><span className="v">{wt.brand.pacing_wpm} wpm</span></div>
        <div className="strip-row"><span className="k">Font</span><span className="v">{wt.brand.font_family}</span></div>
        <div className="strip-row">
          <span className="k">Palette</span>
          <span className="palette-dots v">
            <span style={{ background: wt.brand.palette_bg }} />
            <span style={{ background: wt.brand.palette_fg }} />
            <span style={{ background: wt.brand.palette_accent }} />
          </span>
        </div>
      </div>

      <div className="strip-card strip-activity">
        <div className="strip-head">
          <span className="strip-title">Activity</span>
          <span className="strip-meta">{takes.length} takes</span>
        </div>
        {recent.length === 0 ? (
          <p style={{ color: "var(--muted)", fontSize: 13 }}>No takes yet.</p>
        ) : (
          recent.map((t) => (
            <div key={t.id} className="strip-row strip-activity-row">
              <span className="when mono">{formatTime(t.created_at)}</span>
              <Link href={`/takes/${t.id}`} className="v">
                <span className="mono">{t.id}</span>{" "}
                <span className={`status status-${t.status}`}>{t.status}</span>
              </Link>
            </div>
          ))
        )}
      </div>
    </>
  );

  const headerActions = (
    <>
      <ThemeToggle />
      <Link className="btn-secondary" href={`/docs/${params.id}`}>Public docs</Link>
    </>
  );

  const displayName = (wt as { display_name?: string }).display_name ?? (wt.id === "v1" ? "Loop" : wt.id);

  return (
    <main className="detail">
      <WalkthroughLayout
        walkthroughId={wt.id}
        walkthroughTitle={displayName}
        walkthroughVersion={wt.version}
        docs={docs}
        projectStrip={projectStrip}
        headerActions={headerActions}
      />
    </main>
  );
}
