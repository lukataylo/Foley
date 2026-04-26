import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { writeJsonAtomic } from "@/lib/atomic-io";
import { findTakeWalkthroughId } from "@/lib/fs";
import { isValidTakeId, isValidWalkthroughId } from "@/lib/ids";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

function file(walkthroughId: string, takeId: string): string {
  return path.join(REPO_ROOT, "walkthroughs", walkthroughId, "takes", takeId, "transitions.json");
}

function readWidQuery(req: NextRequest): string | null {
  const wid = req.nextUrl.searchParams.get("wt") ?? req.nextUrl.searchParams.get("walkthrough_id");
  if (!wid) return null;
  if (!isValidWalkthroughId(wid)) return null;
  return wid;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isValidTakeId(params.id)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }
  const wid = readWidQuery(req) ?? (await findTakeWalkthroughId(params.id));
  if (!wid) {
    return NextResponse.json({ transitions: [] });
  }
  try {
    const raw = await fs.readFile(file(wid, params.id), "utf8");
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
  const body = await req.json();
  const bodyWid = typeof body?.walkthrough_id === "string" ? body.walkthrough_id : null;
  const wid =
    readWidQuery(req) ??
    (bodyWid && isValidWalkthroughId(bodyWid) ? bodyWid : null) ??
    (await findTakeWalkthroughId(params.id));
  if (!wid) {
    return NextResponse.json(
      { error: "missing walkthrough_id (pass as ?wt= / ?walkthrough_id= or in body)" },
      { status: 400 },
    );
  }
  // Strip walkthrough_id before persisting so it doesn't pollute the spec file.
  const { walkthrough_id: _wid, ...persistable } = body;
  const out = file(wid, params.id);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await writeJsonAtomic(out, persistable);
  return NextResponse.json({ ok: true });
}
