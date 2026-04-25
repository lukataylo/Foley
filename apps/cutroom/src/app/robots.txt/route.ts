// robots.txt — allow public surfaces, disallow API + onboard wizard,
// point at the auto-generated sitemap.

import "server-only";
import { NextResponse } from "next/server";

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

export async function GET(req: Request) {
  const base = dashboardBase(req);
  const body = [
    "User-agent: *",
    "Allow: /",
    "Allow: /docs/",
    "Allow: /walkthroughs/",
    "Allow: /welcome",
    "Disallow: /api/",
    "Disallow: /onboard",
    "Disallow: /takes/",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
