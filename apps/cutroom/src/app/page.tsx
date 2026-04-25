// Cutroom — Dailies. Lists takes for the v1 walkthrough.

import Link from "next/link";
import { listTakes, loadWalkthrough } from "@/lib/fs";

export const dynamic = "force-dynamic";

export default async function CutroomPage() {
  const walkthrough = await loadWalkthrough("v1");
  const takes = await listTakes("v1");

  return (
    <main className="cutroom">
      <header className="cutroom-header">
        <div>
          <h1>Cutroom</h1>
          <p className="subtitle">{walkthrough.steps.length} steps · {walkthrough.brand.voice_name}</p>
        </div>
        <Link href="/docs/v1" className="brand-tag">Docs page →</Link>
      </header>

      <section>
        <h2>Dailies</h2>
        {takes.length === 0 ? (
          <p className="empty">No takes yet. Run <code>director master v1</code>.</p>
        ) : (
          <ul className="takes">
            {takes.map((take) => {
              const counts = take.step_diffs.reduce(
                (acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }),
                {} as Record<string, number>,
              );
              return (
                <li key={take.id} className="take-row">
                  <Link href={`/takes/${take.id}`}>
                    <div className="take-id">{take.id}</div>
                    <div className="take-meta">
                      {take.pr_title ? <span className="pr">{take.pr_title}</span> : <span className="pr subtle">canonical master</span>}
                      <span className={`status status-${take.status}`}>{take.status}</span>
                    </div>
                    <div className="take-counts">
                      {(["changed", "added", "removed", "unchanged"] as const).map((s) =>
                        counts[s] ? (
                          <span key={s} className={`pill pill-${s}`}>{counts[s]} {s}</span>
                        ) : null,
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}
