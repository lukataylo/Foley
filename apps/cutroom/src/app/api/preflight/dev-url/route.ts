// Liveness probe for the user's dev URL. Returns ok + parsed <title> when
// the URL responds with HTML, or a friendly error when it doesn't. Used by
// OnboardWizard's "Test" button so users see "this isn't running" before
// they spend Claude credits drafting against an unreachable server.

import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function looksLikeHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([^<]{0,200})<\/title>/i);
  return m ? m[1].trim() : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url).searchParams.get("url");
  if (!url) {
    return NextResponse.json({ ok: false, error: "url required" }, { status: 400 });
  }
  if (!looksLikeHttpUrl(url)) {
    return NextResponse.json(
      { ok: false, error: "not a valid http(s) URL" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(5_000),
    });
    if (res.status >= 400) {
      return NextResponse.json({
        ok: false,
        error: `responded ${res.status}`,
      });
    }
    const text = await res.text().catch(() => "");
    const title = extractTitle(text);
    return NextResponse.json({ ok: true, status: res.status, title });
  } catch (err) {
    const message =
      err instanceof Error
        ? err.name === "TimeoutError" || /aborted|timeout/i.test(err.message)
          ? "no response within 5s"
          : err.message
        : "network error";
    return NextResponse.json({ ok: false, error: message });
  }
}
