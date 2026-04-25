import Link from "next/link";
import { notFound } from "next/navigation";
import {
  loadManifest,
  loadTake,
  loadWalkthrough,
  takePublicPath,
} from "@/lib/fs";

export const dynamic = "force-dynamic";

export default async function ComparePage({
  params,
}: {
  params: { id: string; other: string };
}) {
  let aTake, bTake, aManifest, bManifest, walkthrough;
  try {
    aTake = await loadTake("v1", params.id);
    bTake = await loadTake("v1", params.other);
    aManifest = await loadManifest("v1", params.id);
    bManifest = await loadManifest("v1", params.other);
    walkthrough = await loadWalkthrough("v1");
  } catch {
    notFound();
  }

  const aById = Object.fromEntries(aManifest.segments.map((s) => [s.step_id, s]));
  const bById = Object.fromEntries(bManifest.segments.map((s) => [s.step_id, s]));
  const stepIds = walkthrough.steps.map((s) => s.id);
  const identical = stepIds.filter((id) => aById[id]?.segment_sha256 === bById[id]?.segment_sha256).length;

  return (
    <main className="cutroom">
      <Link href={`/takes/${params.id}`} className="back">← {params.id}</Link>
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
          <video src={takePublicPath("v1", params.id, "master.mp4")} controls preload="metadata" />
          <div className="player-meta">sha {aManifest.master_sha256.slice(0, 16)}…</div>
        </div>
        <div>
          <h3>{params.other}</h3>
          <video src={takePublicPath("v1", params.other, "master.mp4")} controls preload="metadata" />
          <div className="player-meta">sha {bManifest.master_sha256.slice(0, 16)}…</div>
        </div>
      </div>

      <h2 style={{ marginTop: 28 }}>Per-segment identity</h2>
      <div>
        {stepIds.map((id) => {
          const a = aById[id];
          const b = bById[id];
          const same = a && b && a.segment_sha256 === b.segment_sha256;
          const step = walkthrough.steps.find((s) => s.id === id);
          return (
            <div key={id} className="identity-row">
              <span style={{ flex: 1 }}>{step?.title ?? id}</span>
              <span className={same ? "ok" : "bad"} style={{ width: 220, textAlign: "right" }}>
                {same ? `byte-identical · ${a.segment_sha256.slice(0, 12)}…` : "different"}
              </span>
            </div>
          );
        })}
      </div>
    </main>
  );
}
