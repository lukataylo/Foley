import Link from "next/link";
import { notFound } from "next/navigation";
import {
  findTakeWalkthroughId,
  loadManifest,
  loadTake,
  loadWalkthrough,
  takePublicPath,
} from "@/lib/fs";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  params,
  searchParams,
}: {
  params: { id: string; other: string };
  searchParams?: { wt?: string };
}) {
  const wtId = await findTakeWalkthroughId(params.id, searchParams?.wt);
  if (!wtId) notFound();

  let aTake, bTake, aManifest, bManifest, walkthrough;
  try {
    aTake = await loadTake(wtId, params.id);
    bTake = await loadTake(wtId, params.other);
    aManifest = await loadManifest(wtId, params.id);
    bManifest = await loadManifest(wtId, params.other);
    walkthrough = await loadWalkthrough(wtId);
  } catch {
    notFound();
  }

  const aById = Object.fromEntries(aManifest.segments.map((s) => [s.step_id, s]));
  const bById = Object.fromEntries(bManifest.segments.map((s) => [s.step_id, s]));
  const stepIds = walkthrough.steps.map((s) => s.id);
  const identical = stepIds.filter((id) => aById[id]?.segment_sha256 === bById[id]?.segment_sha256).length;

  return (
    <main className="cutroom">
      <Link href={`/takes/${params.id}?wt=${wtId}`} className="back">← {params.id}</Link>
      <header className="cutroom-header">
        <div>
          <h1>Compare</h1>
          <p className="subtitle">
            {params.id} vs {params.other} · {identical} of {stepIds.length} segments byte-identical
          </p>
        </div>
      </header>

      <div className="compare-grid">
        <div>
          <h3>{params.id}</h3>
          <video src={takePublicPath(wtId, params.id, "master.mp4")} controls preload="metadata" />
          <div className="player-meta">sha {aManifest.master_sha256.slice(0, 16)}…</div>
        </div>
        <div>
          <h3>{params.other}</h3>
          <video src={takePublicPath(wtId, params.other, "master.mp4")} controls preload="metadata" />
          <div className="player-meta">sha {bManifest.master_sha256.slice(0, 16)}…</div>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Per-segment identity</h2>
      <div className="identity-rows">
        {stepIds.map((id) => {
          const a = aById[id];
          const b = bById[id];
          const same = a && b && a.segment_sha256 === b.segment_sha256;
          const step = walkthrough.steps.find((s) => s.id === id);
          return (
            <div key={id} className="identity-row">
              <span className="name">{step?.title ?? id}</span>
              <span className={`verdict ${same ? "ok" : "bad"}`}>
                {same ? `byte-identical · ${a.segment_sha256.slice(0, 12)}…` : "different"}
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
