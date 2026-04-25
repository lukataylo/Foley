import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile, mkdir } from "fs/promises";
import path from "path";
import { loadWalkthrough } from "@/lib/fs";
import { synthesizeOverlay, type EditOverlay } from "@/lib/timeline";

export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

function pathFor(id: string): string {
  return path.join(REPO_ROOT, "walkthroughs", id, "timeline.json");
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const file = pathFor(params.id);
  try {
    const raw = await readFile(file, "utf8");
    const overlay = JSON.parse(raw) as EditOverlay;
    return NextResponse.json({ overlay, source: "disk" });
  } catch {
    // Synthesize lazily from the walkthrough's authored steps.
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
  const body = (await req.json().catch(() => null)) as { overlay?: EditOverlay } | null;
  if (!body?.overlay) {
    return NextResponse.json({ error: "overlay required" }, { status: 400 });
  }
  const overlay = body.overlay;
  if (overlay.version !== 1) {
    return NextResponse.json({ error: "unsupported version" }, { status: 400 });
  }
  const file = pathFor(params.id);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(overlay, null, 2), "utf8");
  return NextResponse.json({ ok: true });
}
