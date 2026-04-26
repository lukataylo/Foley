// PATCH a walkthrough's top-level metadata (display_name, target_app).
// DELETE removes the walkthrough directory + any takes/segments wholesale.

import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { z } from "zod";
import { readRaw, writeRaw } from "@/lib/walkthrough-mutate";
import { isValidWalkthroughId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

const PatchSchema = z.object({
  display_name: z.string().trim().min(1).max(120).optional(),
  target_app: z
    .object({
      repo: z.string().optional(),
      dev_url: z.string().url().optional(),
    })
    .optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Skip the read/write if there's nothing actually to change.
  const hasChanges =
    parsed.data.display_name !== undefined || parsed.data.target_app !== undefined;
  if (!hasChanges) {
    return NextResponse.json({ ok: true, walkthrough: { id: params.id }, noop: true });
  }

  let raw;
  try {
    raw = await readRaw(params.id);
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (parsed.data.display_name !== undefined) {
    raw.display_name = parsed.data.display_name;
  }
  if (parsed.data.target_app) {
    raw.target_app = { ...(raw.target_app ?? {}), ...parsed.data.target_app };
  }

  await writeRaw(params.id, raw);
  return NextResponse.json({ ok: true, walkthrough: { id: params.id, display_name: raw.display_name } });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const dir = path.join(WALKTHROUGHS_DIR, params.id);
  // Make sure we're really inside the walkthroughs/ tree before recursive
  // delete — defense in depth on top of isValidWalkthroughId.
  const resolved = path.resolve(dir);
  if (
    !resolved.startsWith(WALKTHROUGHS_DIR + path.sep) ||
    resolved === WALKTHROUGHS_DIR
  ) {
    return NextResponse.json({ ok: false, error: "invalid_path" }, { status: 400 });
  }
  try {
    const stat = await fs.stat(resolved);
    if (!stat.isDirectory()) {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
    }
    throw err;
  }
  await fs.rm(resolved, { recursive: true, force: true });
  return NextResponse.json({ ok: true, deleted: params.id });
}
