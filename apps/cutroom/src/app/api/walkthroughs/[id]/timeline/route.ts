import { NextRequest, NextResponse } from "next/server";
import { readFile, mkdir } from "fs/promises";
import path from "path";
import { loadWalkthrough } from "@/lib/fs";
import { migrateOverlay, synthesizeOverlay, type EditOverlay } from "@/lib/timeline";
import { writeJsonAtomic } from "@/lib/atomic-io";
import { isValidWalkthroughId } from "@/lib/ids";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

function pathFor(id: string): string {
  return path.join(REPO_ROOT, "walkthroughs", id, "timeline.json");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const file = pathFor(params.id);
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw);
    const overlay = migrateOverlay(parsed);
    return NextResponse.json({ overlay, source: "disk" });
  } catch {
    try {
      const wt = await loadWalkthrough(params.id);
      const overlay = synthesizeOverlay(wt);
      return NextResponse.json({ overlay, source: "synthesized" });
    } catch {
      return NextResponse.json({ error: "walkthrough not found" }, { status: 404 });
    }
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as { overlay?: EditOverlay } | null;
  if (!body?.overlay) {
    return NextResponse.json({ error: "overlay required" }, { status: 400 });
  }
  // Defensive migrate so the client can PUT either v1 or v2 — we always
  // persist v2.
  const overlay = migrateOverlay(body.overlay);
  if (overlay.version !== 2) {
    return NextResponse.json({ error: "unsupported version" }, { status: 400 });
  }
  const file = pathFor(params.id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeJsonAtomic(file, overlay);
  return NextResponse.json({ ok: true });
}
