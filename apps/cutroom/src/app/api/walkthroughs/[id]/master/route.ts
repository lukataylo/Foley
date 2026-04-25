import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { writeJsonAtomic } from "@/lib/atomic-io";
import { isValidTakeId, isValidWalkthroughId } from "@/lib/ids";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

async function copyDir(src: string, dst: string) {
  await fs.mkdir(dst, { recursive: true });
  for (const entry of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) await copyDir(s, d);
    else await fs.copyFile(s, d);
  }
}

async function rmDir(p: string) {
  try {
    await fs.rm(p, { recursive: true, force: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
}

/** Promote a take to be the canonical master. Backs up the previous master
 *  to takes/master.prev-<ts>/ so nothing is destroyed; the user can revert
 *  by hand if they need to. */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const { take_id } = (await req.json()) as { take_id?: string };
  if (!take_id) {
    return NextResponse.json({ error: "missing take_id" }, { status: 400 });
  }
  if (take_id === "master") {
    return NextResponse.json({ error: "already master" }, { status: 400 });
  }
  if (!isValidTakeId(take_id)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }

  const wtDir = path.join(REPO_ROOT, "walkthroughs", params.id);
  const srcDir = path.join(wtDir, "takes", take_id);
  const masterDir = path.join(wtDir, "takes", "master");

  // Verify source exists.
  try {
    await fs.stat(path.join(srcDir, "master.mp4"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ error: "take has no master.mp4" }, { status: 404 });
    }
    throw err;
  }

  // Backup the existing master → takes/master.prev-<ts>/
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(wtDir, "takes", `master.prev-${ts}`);
  try {
    await fs.stat(masterDir);
    await fs.rename(masterDir, backupDir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }

  // Copy source take → master.
  await copyDir(srcDir, masterDir);

  // Patch takes/master/take.json: id="master", status="approved", parent=null.
  // Keep the rest (director_note, step_diffs, pr_title) intact so the
  // story of "this came from take-007" is preserved in the metadata.
  const takeJsonPath = path.join(masterDir, "take.json");
  try {
    const raw = await fs.readFile(takeJsonPath, "utf8");
    const take = JSON.parse(raw);
    take.id = "master";
    take.status = "approved";
    take.parent_take_id = null;
    take.promoted_from = take_id;
    await writeJsonAtomic(takeJsonPath, take);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }

  // Patch takes/master/manifest.json: take_id field
  const manifestPath = path.join(masterDir, "manifest.json");
  try {
    const raw = await fs.readFile(manifestPath, "utf8");
    const manifest = JSON.parse(raw);
    manifest.take_id = "master";
    await writeJsonAtomic(manifestPath, manifest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }

  return NextResponse.json({
    ok: true,
    promoted_from: take_id,
    backup: `takes/master.prev-${ts}`,
  });
}
