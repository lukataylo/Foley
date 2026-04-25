// One YAML, two outputs.
// Same Walkthrough that drives the video also renders here as scrollable,
// branded prose. Brand colors only paint the accent line + eyebrow; bg/fg
// follow the theme so the page reads in both light and dark.

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ThemeToggle } from "@/components/ThemeToggle";
import { AskWidget } from "@/components/AskWidget";
import { OpenInLLMMenu } from "@/components/OpenInLLMMenu";
import { listTakes, loadWalkthrough, stepFramePath, takePublicPath } from "@/lib/fs";

export const dynamic = "force-dynamic";

const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_DASHBOARD_URL ??
  process.env.PUBLIC_DASHBOARD_URL ??
  "http://localhost:3000";

export async function generateMetadata({
  params,
}: {
  params: { walkthrough: string };
}): Promise<Metadata> {
  let walkthrough;
  try {
    walkthrough = await loadWalkthrough(params.walkthrough);
  } catch {
    return { title: "Foley walkthrough" };
  }
  const totalMs = walkthrough.steps.reduce((n, s) => n + s.duration_ms, 0);
  const product = walkthrough.target_app.repo.split("/")[1] ?? walkthrough.id;
  const title = `A tour of ${product} · Foley`;
  const description = `${walkthrough.steps.length} steps · ${(totalMs / 1000).toFixed(0)}s · narrated by ${walkthrough.brand.voice_name}.`;
  const poster = `${DASHBOARD_URL}/api/walkthroughs/${params.walkthrough}/poster`;
  const masterMp4 = `${DASHBOARD_URL}/walkthroughs/${params.walkthrough}/takes/master/master.mp4`;
  const pageUrl = `${DASHBOARD_URL}/docs/${params.walkthrough}`;

  return {
    title,
    description,
    robots: walkthrough.hidden
      ? { index: false, follow: false, nocache: true }
      : { index: true, follow: true },
    alternates: {
      canonical: pageUrl,
      types: {
        "application/json+oembed": `${DASHBOARD_URL}/api/oembed?url=${encodeURIComponent(pageUrl)}`,
      },
    },
    openGraph: {
      title,
      description,
      url: pageUrl,
      type: "video.other",
      images: [{ url: poster, width: 1440, height: 900, alt: title }],
      videos: [
        { url: masterMp4, type: "video/mp4", width: 1440, height: 900 },
      ],
    },
    twitter: {
      card: "player",
      title,
      description,
      images: [poster],
      players: [{ playerUrl: masterMp4, streamUrl: masterMp4, width: 1440, height: 900 }],
    },
    other: {
      // oEmbed responder lives at /api/oembed?url=<page>
      "oembed-link": `${DASHBOARD_URL}/api/oembed?url=${encodeURIComponent(pageUrl)}`,
    },
  };
}

export default async function DocsPage({ params }: { params: { walkthrough: string } }) {
  let walkthrough, masterTakeId;
  try {
    walkthrough = await loadWalkthrough(params.walkthrough);
    const takes = await listTakes(params.walkthrough);
    masterTakeId = takes.find((t) => t.id === "master")?.id ?? takes[0]?.id;
  } catch {
    notFound();
  }
  if (!masterTakeId) notFound();

  const totalMs = walkthrough.steps.reduce((n, s) => n + s.duration_ms, 0);

  return (
    <main
      className="docs"
      style={{
        // Only the accent picks up brand color; bg/fg track the theme.
        ["--brand-accent" as string]: walkthrough.brand.palette_accent,
      }}
    >
      <div className="docs-toolbar">
        <Link href={`/walkthroughs/${params.walkthrough}`} className="back" style={{ margin: 0 }}>
          ← {walkthrough.id === "v1" ? "Loop" : walkthrough.id}
        </Link>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <OpenInLLMMenu walkthroughId={params.walkthrough} />
          <ThemeToggle />
        </div>
      </div>

      <header className="docs-hero">
        <div className="brand-band" />
        <div className="docs-hero-inner">
          <p className="docs-eyebrow">Walkthrough · v{walkthrough.version}</p>
          <h1 className="docs-title">A tour of {walkthrough.target_app.repo.split("/")[1]}</h1>
          <p className="docs-meta">
            {walkthrough.steps.length} steps · {(totalMs / 1000).toFixed(0)}s · narrated by {walkthrough.brand.voice_name}
          </p>
          <Link href={`/takes/${masterTakeId}`} className="docs-cta">
            Watch the video →
          </Link>
        </div>
      </header>

      <ol className="docs-steps">
        {walkthrough.steps.map((step, i) => (
          <li key={step.id} className="docs-step" data-step-id={step.id}>
            <div className="docs-step-num">{String(i + 1).padStart(2, "0")}</div>
            <div className="docs-step-body">
              <h2>{step.title}</h2>
              <p className="narration">{step.narration}</p>
              <video
                src={takePublicPath(params.walkthrough, masterTakeId, `segments/${step.id}.mp4`)}
                poster={stepFramePath(params.walkthrough, step.id)}
                muted
                playsInline
                preload="none"
                controls
              />
              <p className="docs-step-meta">{(step.duration_ms / 1000).toFixed(1)}s</p>
            </div>
          </li>
        ))}
      </ol>

      <footer className="docs-footer">
        <p>Generated by Foley from one YAML spec.</p>
        <p className="muted">Brand voice: {walkthrough.brand.voice_name} · Locked at the walkthrough level.</p>
      </footer>

      <AskWidget walkthroughId={params.walkthrough} />
    </main>
  );
}
