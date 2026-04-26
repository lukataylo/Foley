import { ThemeToggle } from "@/components/ThemeToggle";
import { PreflightBanner } from "@/components/PreflightBanner";
import { HomeFolderGrid, type HomeItem } from "@/components/HomeFolderGrid";
import {
  listWalkthroughSummaries,
  loadWalkthrough,
  publicPath,
} from "@/lib/fs";

export const dynamic = "force-dynamic";

// No placeholder folders — the home grid only shows real walkthroughs
// from disk plus the "+ New walkthrough" tile that links to /onboard.

function relativeTime(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const seconds = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.floor(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export default async function HomePage() {
  const summaries = (await listWalkthroughSummaries()).filter((s) => !s.hidden);

  // For each real walkthrough, take the first 3 step frame paths as thumbs.
  const items: HomeItem[] = await Promise.all(
    summaries.map(async (s) => {
      let thumbs: string[] = [];
      try {
        const wt = await loadWalkthrough(s.id);
        thumbs = wt.steps
          .slice(0, 3)
          .map((step) => publicPath(s.id, "steps", `${step.id}.png`));
      } catch {
        /* leave empty */
      }
      const dur = `${s.total_duration_s.toFixed(0)}s`;
      return {
        id: s.id,
        name: s.display_name,
        mark: s.id === "v1" ? "lp—" : s.id.slice(0, 2) + "—",
        sub: `${s.step_count} steps · ${s.take_count} takes · ${dur}`,
        meta: `${s.voice_name} · ${relativeTime(s.last_activity)}`,
        href: `/walkthroughs/${s.id}`,
        variant: "default",
        tone: "amber",
        thumbs,
      };
    }),
  );

  return (
    <main className="home">
      <PreflightBanner />
      <div className="home-inner">
        <header className="home-header">
          <div className="brand-mark">Foley</div>
          <ThemeToggle />
        </header>

        <h1 className="home-section-title">Walkthroughs</h1>
        <p className="home-section-hint">Right-click any folder to delete it.</p>

        <HomeFolderGrid items={items} />
      </div>
    </main>
  );
}
