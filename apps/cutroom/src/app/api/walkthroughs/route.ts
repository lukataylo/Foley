// List walkthroughs — used by the recorder extension's "Add to existing folder"
// dropdown. Returns the minimum needed to pick one.

import { NextResponse } from "next/server";
import { listWalkthroughSummaries } from "@/lib/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function GET() {
  const summaries = await listWalkthroughSummaries();
  return NextResponse.json(
    {
      ok: true,
      walkthroughs: summaries.map((s) => ({
        id: s.id,
        display_name: s.display_name,
        step_count: s.step_count,
        take_count: s.take_count,
        voice_name: s.voice_name,
        total_duration_s: s.total_duration_s,
        last_activity: s.last_activity,
        hidden: s.hidden,
      })),
    },
    { headers: corsHeaders() },
  );
}
