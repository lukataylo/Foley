import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { writeJsonAtomic } from "@/lib/atomic-io";
import { findTakeWalkthroughId } from "@/lib/fs";
import { isValidTakeId } from "@/lib/ids";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

function file(wtId: string, takeId: string): string {
  return path.join(REPO_ROOT, "walkthroughs", wtId, "takes", takeId, "transitions.json");
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isValidTakeId(params.id)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }
  const wtHint = req.nextUrl.searchParams.get("wt");
  const wtId = await findTakeWalkthroughId(params.id, wtHint);
  if (!wtId) {
    return NextResponse.json({ transitions: [] });
  }
  try {
    const raw = await fs.readFile(file(wtId, params.id), "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ transitions: [] });
    }
    throw err;
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isValidTakeId(params.id)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }
  const wtHint = req.nextUrl.searchParams.get("wt");
  const wtId = await findTakeWalkthroughId(params.id, wtHint);
  if (!wtId) {
    return NextResponse.json({ error: "take not found" }, { status: 404 });
  }
  const body = await req.json();
  const out = file(wtId, params.id);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await writeJsonAtomic(out, body);
  return NextResponse.json({ ok: true });
}
