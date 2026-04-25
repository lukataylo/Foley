// Auto-generated sitemap. Lists every public surface so search engines
// (and AI crawlers) can find walkthroughs without hand-maintaining a
// list. Mintlify ships this for free; we now do too.

import "server-only";
import { NextResponse } from "next/server";
import { listWalkthroughSummaries } from "@/lib/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dashboardBase(req: Request): string {
  const env =
    process.env.NEXT_PUBLIC_DASHBOARD_URL ?? process.env.PUBLIC_DASHBOARD_URL;
  if (env) return env.replace(/\/$/, "");
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;");
}

export async function GET(req: Request) {
  const base = dashboardBase(req);
  const summaries = await listWalkthroughSummaries();
  const now = new Date().toISOString().slice(0, 10);

  const urls: Array<{ loc: string; lastmod?: string; priority?: string }> = [
    { loc: `${base}/`, priority: "0.8" },
    { loc: `${base}/welcome`, priority: "0.7" },
    { loc: `${base}/onboard`, priority: "0.5" },
  ];

  for (const s of summaries) {
    const lastmod = s.last_activity?.slice(0, 10) ?? now;
    urls.push({ loc: `${base}/docs/${s.id}`, lastmod, priority: "0.9" });
    urls.push({ loc: `${base}/walkthroughs/${s.id}`, lastmod, priority: "0.6" });
  }

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n` +
          `    <loc>${escapeXml(u.loc)}</loc>\n` +
          (u.lastmod ? `    <lastmod>${u.lastmod}</lastmod>\n` : "") +
          (u.priority ? `    <priority>${u.priority}</priority>\n` : "") +
          `  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;

  return new NextResponse(xml, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=600, stale-while-revalidate=3600",
    },
  });
}
