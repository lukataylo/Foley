import "server-only";
import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { findTakeWalkthroughId } from "@/lib/fs";
import { isValidTakeId } from "@/lib/ids";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

// "Re-run review" from the editor's AI tile. Reads the take's step_diffs and
// kicks `director retake <step>` for every CHANGED/ADDED step. The director's
// fingerprint cache short-circuits anything that hasn't actually drifted.
// Detached + stdio:ignore so the request returns immediately.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as { take_id?: string; walkthrough_id?: string };
  const { take_id } = body;
  if (!take_id) {
    return NextResponse.json({ error: "missing take_id" }, { status: 400 });
  }
  if (!isValidTakeId(take_id)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }

  const wtId = await findTakeWalkthroughId(take_id, body.walkthrough_id ?? null);
  if (!wtId) {
    return NextResponse.json({ error: "take not found" }, { status: 404 });
  }

  const takeFile = path.join(
    REPO_ROOT,
    "walkthroughs",
    wtId,
    "takes",
    take_id,
    "take.json",
  );
  let take: { step_diffs: { step_id: string; status: string }[] };
  try {
    take = JSON.parse(await fs.readFile(takeFile, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ error: "take not found" }, { status: 404 });
    }
    throw err;
  }

  const targets = take.step_diffs
    .filter((d) => d.status === "changed" || d.status === "added")
    .map((d) => d.step_id);

  if (targets.length === 0) {
    return NextResponse.json({ ok: true, retook: 0, note: "no changed/added steps" });
  }

  for (const step_id of targets) {
    const child = spawn(
      "uv",
      ["--directory", "services/director", "run", "director", "retake", step_id, wtId],
      {
        cwd: REPO_ROOT,
        detached: true,
        stdio: "ignore",
        env: { ...process.env },
      },
    );
    child.unref();
  }

  return NextResponse.json({ ok: true, retook: targets.length, step_ids: targets, walkthrough_id: wtId });
}
