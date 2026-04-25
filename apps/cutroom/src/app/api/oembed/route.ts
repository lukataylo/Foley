// oEmbed responder for /docs/<id> URLs.
//
// Slack/Notion/Discord look for an `<link rel="alternate" type="application/
// json+oembed">` on the page and call this endpoint to get a video player
// embed they can render inline.
//
// We answer with a video-type oEmbed payload pointing at the master.mp4 +
// the poster image we already build for /api/walkthroughs/<id>/poster.

import "server-only";
import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { isValidWalkthroughId } from "@/lib/ids";
import { loadWalkthrough } from "@/lib/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

function dashboardBaseUrl(req: Request): string {
  const env =
    process.env.NEXT_PUBLIC_DASHBOARD_URL ?? process.env.PUBLIC_DASHBOARD_URL;
  if (env) return env.replace(/\/$/, "");
  // Best-effort fallback: derive from the request's Host header.
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const target = url.searchParams.get("url");
  if (!target) {
    return NextResponse.json(
      { error: "missing_url", message: "Pass ?url=<docs URL>." },
      { status: 400 },
    );
  }

  // Extract /docs/<walkthrough> from any reasonable absolute URL form.
  let id: string | null = null;
  try {
    const parsed = new URL(target);
    const m = parsed.pathname.match(/^\/docs\/([^/]+)/);
    if (m) id = m[1];
  } catch {
    // ignore — fall through to 404 below
  }
  if (!id || !isValidWalkthroughId(id)) {
    return NextResponse.json(
      { error: "unsupported_url", message: "Only /docs/<id> URLs are supported." },
      { status: 404 },
    );
  }

  let walkthrough;
  try {
    walkthrough = await loadWalkthrough(id);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const masterPath = path.join(
    WALKTHROUGHS_DIR,
    id,
    "takes",
    "master",
    "master.mp4",
  );
  let hasMaster = false;
  try {
    const s = await fs.stat(masterPath);
    hasMaster = s.isFile() && s.size > 0;
  } catch {
    // ignore
  }

  const base = dashboardBaseUrl(req);
  const product = walkthrough.target_app.repo.split("/")[1] ?? walkthrough.id;
  const masterMp4 = `${base}/walkthroughs/${id}/takes/master/master.mp4`;
  const poster = `${base}/api/walkthroughs/${id}/poster`;
  const pageUrl = `${base}/docs/${id}`;

  if (!hasMaster) {
    // Still answer — Slack will render the title + description even
    // without a player.
    return NextResponse.json({
      version: "1.0",
      type: "link",
      provider_name: "Foley",
      provider_url: base,
      title: `A tour of ${product} · Foley`,
      author_name: walkthrough.brand.voice_name,
      author_url: pageUrl,
    });
  }

  // Width/height match the canonical viewport (1440x900) — Slack scales it
  // to fit, but we declare the natural size so aspect ratio is right.
  const html = `<video controls poster="${poster}" width="720" height="450" style="border-radius:8px"><source src="${masterMp4}" type="video/mp4"></video>`;

  return NextResponse.json(
    {
      version: "1.0",
      type: "video",
      provider_name: "Foley",
      provider_url: base,
      title: `A tour of ${product} · Foley`,
      author_name: walkthrough.brand.voice_name,
      author_url: pageUrl,
      width: 1440,
      height: 900,
      html,
      thumbnail_url: poster,
      thumbnail_width: 1440,
      thumbnail_height: 900,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
      },
    },
  );
}
