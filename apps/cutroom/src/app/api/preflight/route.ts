// Boot-time system checks. The home page banner polls this once on mount.

import "server-only";
import { NextResponse } from "next/server";
import { runPreflight } from "@/lib/preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const checks = await runPreflight();
  const missing = checks.filter((c) => !c.ok);
  return NextResponse.json(
    {
      ok: missing.length === 0,
      checks,
      missing_count: missing.length,
    },
    {
      headers: {
        // Banner is fine showing slightly stale info — this gates server
        // restart cost, not user expectation. 30 s.
        "Cache-Control": "public, max-age=30, stale-while-revalidate=120",
      },
    },
  );
}
