import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadManifest,
  loadTake,
  loadWalkthrough,
  stepFramePath,
  takePublicPath,
} from "@/lib/fs";
import { TakeActions } from "./TakeActions";

export const dynamic = "force-dynamic";

export default async function TakePage({ params }: { params: { id: string } }) {
  let take, manifest, walkthrough;
  try {
    take = await loadTake("v1", params.id);
    manifest = await loadManifest("v1", params.id);
    walkthrough = await loadWalkthrough("v1");
  } catch {
    notFound();
  }

  const stepById = Object.fromEntries(walkthrough.steps.map((s) => [s.id, s]));

  return (
    <main className="cutroom">
      <Link href="/" className="back">← Dailies</Link>
      <header className="cutroom-header">
        <div>
          <h1>{take.id}</h1>
          <p className="subtitle">
            {take.pr_title ?? "canonical master"}
            {" · "}
            <span className="mono">sha {manifest.master_sha256.slice(0, 12)}…</span>
          </p>
        </div>
        <span className={`status status-${take.status}`}>{take.status}</span>
      </header>

      <div className="take-detail">
        <div>
          <div className="player">
            <video src={takePublicPath("v1", params.id, "master.mp4")} controls preload="metadata" />
            <div className="player-meta">
              <span>{manifest.segments.length} segments</span>
              <span>{(manifest.segments.reduce((n, s) => n + s.duration_ms, 0) / 1000).toFixed(1)}s</span>
            </div>
          </div>

          {take.status === "ready" && (
            <TakeActions takeId={take.id} />
          )}

          {take.parent_take_id && (
            <p style={{ marginTop: 14 }}>
              <Link href={`/takes/${take.id}/compare/${take.parent_take_id}`} className="back">
                Compare with {take.parent_take_id} →
              </Link>
            </p>
          )}
        </div>

        <div>
          <div className="summary-box">
            <div className="label">Director's note</div>
            <div className="body">
              {take.pr_title ? deriveSummary(take) : "Initial canonical master."}
            </div>
          </div>

          <h2>Timeline</h2>
          <ol className="timeline">
            {take.step_diffs.map((d) => {
              const step = d.proposed_step ?? stepById[d.step_id];
              const title = step?.title ?? d.step_id;
              return (
                <li key={d.step_id} className={`step-block ${d.status}`}>
                  <img src={stepFramePath("v1", d.step_id)} alt="" className="thumb" />
                  <div>
                    <div className="step-title">{title}</div>
                    <div className="step-reason">{d.reason}</div>
                  </div>
                  <div className="step-actions">
                    <span className={`pill pill-${d.status}`}>{d.status}</span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </main>
  );
}

function deriveSummary(take: Awaited<ReturnType<typeof loadTake>>): string {
  const counts = take.step_diffs.reduce<Record<string, number>>(
    (acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }),
    {},
  );
  const parts: string[] = [];
  if (counts.changed) parts.push(`${counts.changed} changed`);
  if (counts.added) parts.push(`${counts.added} added`);
  if (counts.removed) parts.push(`${counts.removed} removed`);
  if (counts.unchanged) parts.push(`${counts.unchanged} unchanged`);
  return parts.join(" · ");
}
