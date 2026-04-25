// Walkthrough detail — pastel sticky-note layout, semi-skeuomorphic.
// Each card is its own colored note pinned on a warm paper backdrop.

import Link from "next/link";
import { notFound } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  listTakes,
  loadManifest,
  loadWalkthrough,
  takePublicPath,
} from "@/lib/fs";

export const dynamic = "force-dynamic";

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
  let wt, takes, masterManifest;
  try {
    wt = await loadWalkthrough(params.id);
    takes = await listTakes(params.id);
    try {
      masterManifest = await loadManifest(params.id, "master");
    } catch {
      masterManifest = null;
    }
  } catch {
    notFound();
  }

  const master = takes.find((t) => t.id === "master");
  const otherTakes = takes.filter((t) => t.id !== "master");
  const totalDuration = wt.steps.reduce((n, s) => n + s.duration_ms, 0);

  return (
    <main className="detail">
      <div className="detail-inner">
        <header className="detail-header">
          <div>
            <Link href="/" className="detail-back">← Walkthroughs</Link>
            <p className="detail-eyebrow" style={{ marginTop: 12 }}>Walkthrough · v{wt.version}</p>
            <h1 className="detail-title">A tour of {wt.target_app.repo.split("/")[1] ?? wt.id}</h1>
          </div>
          <div className="actions" style={{ display: "flex", gap: 10 }}>
            <ThemeToggle />
            <Link className="btn-secondary" href={`/docs/${params.id}`}>Docs page</Link>
          </div>
        </header>

        <div className="sticky-grid">
          {/* Master video — sky */}
          {master ? (
            <div className="sticky sticky-sky">
              <h2>Master</h2>
              <video
                controls
                preload="metadata"
                src={takePublicPath(params.id, "master", "master.mp4")}
              />
              <div className="meta">
                {(totalDuration / 1000).toFixed(1)}s
                {masterManifest ? <> · sha {masterManifest.master_sha256.slice(0, 12)}…</> : null}
              </div>
              <div style={{ marginTop: 12, display: "flex", gap: 6 }}>
                <Link href={`/takes/master`} className="btn-secondary">Open in editor</Link>
              </div>
            </div>
          ) : null}

          {/* Brand — mint */}
          <div className="sticky sticky-mint">
            <h2>Brand</h2>
            <div className="row"><span className="k">Voice</span><span className="v">{wt.brand.voice_name} · en-GB</span></div>
            <div className="row"><span className="k">Pacing</span><span className="v">{wt.brand.pacing_wpm} wpm</span></div>
            <div className="row"><span className="k">Intro card</span><span className="v">{(wt.brand.intro_card_ms / 1000).toFixed(1)}s</span></div>
            <div className="row"><span className="k">Font</span><span className="v">{wt.brand.font_family}</span></div>
            <div className="row"><span className="k">Palette</span>
              <span className="palette-dots">
                <span style={{ background: wt.brand.palette_bg }} />
                <span style={{ background: wt.brand.palette_fg }} />
                <span style={{ background: wt.brand.palette_accent }} />
              </span>
            </div>
            <div className="voice-locked">🔒 voice locked at the walkthrough level</div>
          </div>

          {/* Dailies — cream */}
          <div className="sticky sticky-cream">
            <h2>Dailies</h2>
            {otherTakes.length === 0 ? (
              <p style={{ color: "var(--muted)" }}>No takes in review.</p>
            ) : (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {otherTakes.map((t) => {
                  const counts = t.step_diffs.reduce<Record<string, number>>(
                    (acc, d) => ({ ...acc, [d.status]: (acc[d.status] ?? 0) + 1 }),
                    {},
                  );
                  return (
                    <li key={t.id} style={{ padding: "10px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                      <Link href={`/takes/${t.id}`} style={{ display: "block" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span className="mono" style={{ color: "var(--fg)" }}>{t.id}</span>
                          <span className={`status status-${t.status}`}>{t.status}</span>
                        </div>
                        <div style={{ color: "var(--fg)", fontSize: 13, marginTop: 4 }}>
                          {t.pr_title}
                        </div>
                        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
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
          </div>

          {/* Watching — lavender */}
          <div className="sticky sticky-lavender">
            <h2>Watching</h2>
            <div className="row"><span className="k">Repo</span><span className="v mono">{wt.target_app.repo}</span></div>
            <div className="row"><span className="k">Dev URL</span><span className="v mono">{wt.target_app.dev_url}</span></div>
            <div className="row"><span className="k">Director</span><span className="v">Sonnet 4.6</span></div>
            <div className="row"><span className="k">Webhook</span><span className="v" style={{ color: "var(--diff-added)" }}>● live</span></div>
          </div>

          {/* Steps — peach */}
          <div className="sticky sticky-peach">
            <h2>Steps</h2>
            <ul className="step-list">
              {wt.steps.map((s, i) => (
                <li key={s.id}>
                  <span className="num">{String(i + 1).padStart(2, "0")}</span>
                  <span>{s.title}</span>
                  <span className="dur">{(s.duration_ms / 1000).toFixed(1)}s</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Recent activity — rose */}
          <div className="sticky sticky-rose">
            <h2>Recent activity</h2>
            {takes
              .slice()
              .sort((a, b) => b.created_at.localeCompare(a.created_at))
              .slice(0, 5)
              .map((t) => (
                <div key={t.id} className="activity">
                  <span className="when">{formatTime(t.created_at)}</span>
                  <span>
                    <strong>{t.id}</strong> <span style={{ color: "var(--muted)" }}>{t.status}</span>
                    {t.pr_title ? <> · {t.pr_title}</> : null}
                  </span>
                </div>
              ))}
          </div>

          {/* Docs page — paper */}
          <div className="sticky sticky-paper">
            <h2>Docs page</h2>
            <p style={{ color: "var(--muted)", marginBottom: 10 }}>
              The same walkthrough as scrollable, branded prose. One YAML, two outputs.
            </p>
            <Link href={`/docs/${params.id}`} className="btn-secondary">
              Open page →
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
