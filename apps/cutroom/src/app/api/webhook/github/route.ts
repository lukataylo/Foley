// GitHub webhook receiver. Wired in Phase 7.

import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  // TODO Phase 7: verify X-Hub-Signature-256, branch on event type,
  //               enqueue a director review job for opened/synchronize PR events.
  const event = req.headers.get("x-github-event") ?? "unknown";
  return NextResponse.json({ ok: true, received: event });
}

export async function GET() {
  return NextResponse.json({ ok: true, route: "webhook/github" });
}
