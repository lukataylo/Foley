// Project page — sticky-note masonry on top (Master / Brand / Dailies /
// Watching / Steps / Recent activity), docs grid below with content-aware
// previews (text reads like paper, video like a player, steps like a tutorial).

import Link from "next/link";
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  listTakes,
  loadManifest,
  loadWalkthrough,
  takePublicPath,
} from "@/lib/fs";
import { loadDocs } from "@/lib/docs";
import { WalkthroughLayout } from "./WalkthroughLayout";
import { EditableBrand } from "./EditableBrand";
import { MasterCard } from "./MasterCard";
import { PublishButton } from "./PublishButton";

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
  let wt, takes, masterManifest, docs;
  try {
    wt = await loadWalkthrough(params.id);
    takes = await listTakes(params.id);
    docs = await loadDocs(params.id);
    try { masterManifest = await loadManifest(params.id, "master"); }
    catch { masterManifest = null; }
  } catch {
    notFound();
  }

  const master = takes.find((t) => t.id === "master");
  const otherTakes = takes.filter((t) => t.id !== "master");
  const totalDuration = wt.steps.reduce((n, s) => n + s.duration_ms, 0);

  const masterTakeJson = master as
    | (typeof master & { promoted_from?: string | null })
    | undefined;

  // The pinned project masonry — back to the original sticky cards.
  const projectStrip = (
    <div className="sticky-grid">
      {master ? (
        <MasterCard
          walkthroughId={params.id}
          totalDurationMs={totalDuration}
          masterSha={masterManifest?.master_sha256 ?? null}
          promotedFrom={masterTakeJson?.promoted_from ?? null}
          videoUrl={takePublicPath(params.id, "master", "master.mp4")}
          takeOptions={otherTakes.map((t) => ({
            id: t.id,
            pr_title: t.pr_title,
            status: t.status,
            created_at: t.created_at,
          }))}
        />
      ) : null}

      <EditableBrand walkthroughId={params.id} brand={wt.brand} />

      <div className="sticky sticky-cream">
        <h2>Dailies</h2>
        <div className="sub-label">{otherTakes.length} in review</div>
        {otherTakes.length === 0 ? (
          <p style={{ color: "var(--muted)" }}>No takes in review.</p>
        ) : (
          otherTakes.map((t) => {
            const counts = t.step_diffs.reduce<Record<string, number>>(
              (acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }),
              {},
            );
            return (
              <Link key={t.id} href={`/takes/${t.id}`} className="sticky-mini">
                <div className="mini-row">
                  <span className="mini-id">{t.id}</span>
                  <span className={`status status-${t.status}`}>{t.status}</span>
                </div>
                <div className="mini-title">{t.pr_title}</div>
                <div className="mini-pills">
                  {(["changed", "added", "removed", "unchanged"] as const).map((s) =>
                    counts[s] ? (
                      <span key={s} className={`pill pill-${s}`}>{counts[s]} {s}</span>
                    ) : null,
                  )}
                </div>
              </Link>
            );
          })
        )}
      </div>

      <div className="sticky sticky-lavender gh-card">
        <div className="gh-card-head">
          <Octocat />
          <h2 style={{ margin: 0 }}>Watching</h2>
          <span className="gh-live"><span className="dot" /> live</span>
        </div>
        <a
          className="row gh-row"
          href={`https://github.com/${wt.target_app.repo}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <span className="k">Repo</span>
          <span className="v mono">
            {wt.target_app.repo}
            <span className="ext-arrow" aria-hidden="true">↗</span>
          </span>
        </a>
        <div className="row"><span className="k">Dev URL</span><span className="v mono">{wt.target_app.dev_url}</span></div>
        <div className="row"><span className="k">Director</span><span className="v">Sonnet 4.6</span></div>
        <div className="row"><span className="k">Webhook</span><span className="v mono">/api/webhook/github</span></div>
      </div>

      <div className="sticky sticky-rose sticky-tall">
        <h2>Recent activity <Sparkle /></h2>
        <div className="sub-label">{takes.length} entries</div>
        <ActivityTimeline takes={takes} />
        {takes.length < 4 ? (
          <p style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
            New PRs add takes here. Promoting one to master is logged on this list too.
          </p>
        ) : null}
      </div>
    </div>
  );

  const headerActions = (
    <>
      <ThemeToggle />
      <Link className="btn-secondary" href={`/docs/${params.id}`}>Public docs</Link>
      <PublishButton
        walkthroughId={params.id}
        displayName={(wt as { display_name?: string }).display_name ?? params.id}
        videoUrl={takePublicPath(params.id, "master", "master.mp4")}
      />
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

function activityBucketLabel(iso: string): { label: string; rank: number } {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { label: "—", rank: -1 };
  const today = new Date();
  const yest = new Date(today);
  yest.setDate(yest.getDate() - 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return { label: "Today", rank: 100 };
  if (sameDay(d, yest)) return { label: "Yesterday", rank: 99 };
  return {
    label: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }),
    rank: -d.getTime(),
  };
}

interface ActivityTake {
  id: string;
  status: string;
  pr_title: string | null;
  created_at: string;
  promoted_from?: string | null;
}

function ActivityTimeline({ takes }: { takes: ActivityTake[] }) {
  const sorted = [...takes].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const groups = new Map<string, { label: string; rank: number; entries: ActivityTake[] }>();
  for (const t of sorted) {
    const { label, rank } = activityBucketLabel(t.created_at);
    const g = groups.get(label) ?? { label, rank, entries: [] };
    g.entries.push(t);
    groups.set(label, g);
  }
  const buckets = Array.from(groups.values()).sort((a, b) => b.rank - a.rank);

  return (
    <div className="activity-timeline">
      {buckets.map((b) => (
        <div key={b.label} className="activity-bucket">
          <div className="activity-bucket-label">{b.label}</div>
          <ol className="activity-rail">
            {b.entries.map((t) => (
              <li key={t.id} className="activity-row">
                <span className={`activity-dot status-${t.status}`} />
                <span className="activity-when">{formatTime(t.created_at)}</span>
                <span className="activity-body">
                  <strong>{t.id}</strong>{" "}
                  <span className={`status status-${t.status}`}>{t.status}</span>
                  {t.pr_title ? <> · {t.pr_title}</> : null}
                  {t.promoted_from ? (
                    <> · <span style={{ color: "var(--muted)" }}>promoted from {t.promoted_from}</span></>
                  ) : null}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function Sparkle() {
  return (
    <svg className="sparkle" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 2 L13.5 9 L20 10.5 L13.5 12 L12 19 L10.5 12 L4 10.5 L10.5 9 Z"
        fill="currentColor"
      />
    </svg>
  );
}
