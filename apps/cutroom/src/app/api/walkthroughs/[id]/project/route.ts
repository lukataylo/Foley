import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { loadWalkthrough } from "@/lib/fs";
import { isValidTakeId, isValidWalkthroughId } from "@/lib/ids";
import { migrateOverlay } from "@/lib/timeline";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

/** Project bundle: a single JSON file containing the walkthrough spec, the
 *  current overlay (timeline.json), and the take's transitions.json. Lets
 *  the user save the editorial state and re-import or share it without
 *  re-running the entire bake pipeline.
 *
 *  GET ?take_id=<tid> → application/json with Content-Disposition so the
 *  browser triggers a download. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const takeId = req.nextUrl.searchParams.get("take_id") ?? "master";
  if (!isValidTakeId(takeId)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }

  let walkthrough: Awaited<ReturnType<typeof loadWalkthrough>> | null = null;
  try {
    walkthrough = await loadWalkthrough(params.id);
  } catch {
    return NextResponse.json({ error: "walkthrough_not_found" }, { status: 404 });
  }

  // Overlay is optional — newly-created walkthroughs may not have one yet.
  let overlay: unknown = null;
  try {
    const raw = await readFile(
      path.join(REPO_ROOT, "walkthroughs", params.id, "timeline.json"),
      "utf8",
    );
    overlay = migrateOverlay(JSON.parse(raw));
  } catch { /* none */ }

  // Transitions for this take. Probe both the proper path and the legacy
  // /v1/ location for backwards-compat with takes that were saved before
  // the API path bug was fixed.
  let transitions: unknown = null;
  for (const p of [
    path.join(REPO_ROOT, "walkthroughs", params.id, "takes", takeId, "transitions.json"),
    path.join(REPO_ROOT, "walkthroughs", "v1", "takes", takeId, "transitions.json"),
  ]) {
    try {
      const raw = await readFile(p, "utf8");
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.transitions)) {
        transitions = parsed;
        break;
      }
    } catch { /* try next */ }
  }

  const bundle = {
    schema: "foley.project/1",
    walkthrough_id: params.id,
    take_id: takeId,
    exported_at: new Date().toISOString(),
    walkthrough,
    overlay,
    transitions,
  };

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${params.id}-${takeId}.foley.json"`,
    },
  });
}
