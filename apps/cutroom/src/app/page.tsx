import Link from "next/link";
import { Folder } from "@/components/Folder";
import { ThemeToggle } from "@/components/ThemeToggle";
import { listWalkthroughSummaries } from "@/lib/fs";

export const dynamic = "force-dynamic";

interface FolderItem {
  id: string;
  name: string;
  caption: string;
  sub: string;
  meta: string;
  href: string | null;        // null → not navigable
  variant: "default" | "muted";
  tag?: "sample" | "soon";
}

const PLACEHOLDERS: FolderItem[] = [
  {
    id: "acme-cloud",
    name: "Acme Cloud",
    caption: "ACME · v1",
    sub: "12 steps · 1 take",
    meta: "George · Last 09:14",
    href: null,
    variant: "muted",
    tag: "sample",
  },
  {
    id: "beam",
    name: "Beam",
    caption: "BEAM · v1",
    sub: "9 steps · 0 takes",
    meta: "Charlotte · not bootstrapped",
    href: null,
    variant: "muted",
    tag: "soon",
  },
];

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
  const summaries = await listWalkthroughSummaries();
  const real: FolderItem[] = summaries.map((s) => {
    const dur = `${s.total_duration_s.toFixed(0)}s`;
    return {
      id: s.id,
      name: s.display_name,
      caption: `${s.id.toUpperCase()} · ${dur}`,
      sub: `${s.step_count} steps · ${s.take_count} takes`,
      meta: `${s.voice_name} · Last ${relativeTime(s.last_activity)}`,
      href: `/walkthroughs/${s.id}`,
      variant: "default",
    };
  });

  const items: FolderItem[] = [...real, ...PLACEHOLDERS];

  return (
    <main className="home">
      <div className="home-inner">
        <header className="home-header">
          <div className="brand-mark">Foley</div>
          <ThemeToggle />
        </header>

        <h1 className="home-section-title">Walkthroughs</h1>

        <div className="folder-grid">
          {items.map((item) => {
            const card = (
              <div className={`folder-card ${item.variant === "muted" ? "placeholder" : ""}`}>
                <Folder
                  caption={item.caption}
                  label={item.name}
                  variant={item.variant}
                />
                <div className="folder-meta">
                  <div className="folder-title">{item.name}</div>
                  <div className="folder-sub">{item.sub}</div>
                  <div className="folder-sub">{item.meta}</div>
                  {item.tag ? (
                    <div className="folder-tag">{item.tag === "sample" ? "sample" : "coming soon"}</div>
                  ) : null}
                </div>
              </div>
            );
            return item.href ? (
              <Link href={item.href} key={item.id}>{card}</Link>
            ) : (
              <div key={item.id}>{card}</div>
            );
          })}

          <Link href="/walkthroughs/new" className="folder-card placeholder">
            <Folder caption="" label="+" variant="muted" />
            <div className="folder-meta">
              <div className="folder-title">New walkthrough</div>
              <div className="folder-sub">Bootstrap from a repo</div>
            </div>
          </Link>
        </div>
      </div>
    </main>
  );
}
