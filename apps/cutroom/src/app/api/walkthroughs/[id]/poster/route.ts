// JPEG poster image extracted from the walkthrough's master.mp4. Used by
// the README, OG image previews, and Slack/Twitter unfurls.
//
// Lazy: built on first GET via ffmpeg, cached at walkthroughs/<id>/poster.jpg.

import "server-only";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { isValidWalkthroughId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileP = promisify(execFile);
const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

async function statOk(file: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const s = await fs.stat(file);
    if (s.isFile() && s.size > 0) return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    // ignore
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const masterPath = path.join(
    WALKTHROUGHS_DIR,
    params.id,
    "takes",
    "master",
    "master.mp4",
  );
  const posterPath = path.join(WALKTHROUGHS_DIR, params.id, "poster.jpg");

  const masterStat = await statOk(masterPath);
  if (!masterStat) {
    return NextResponse.json(
      {
        ok: false,
        error: "no_master",
        message:
          "Render the master video first — onboard a project and click Render in the editor.",
      },
      { status: 404 },
    );
  }

  // Reuse the cache if the poster is newer than the master file.
  const posterStat = await statOk(posterPath);
  const cached = posterStat && posterStat.mtimeMs >= masterStat.mtimeMs;

  if (!cached) {
    try {
      await execFileP(
        "ffmpeg",
        [
          "-y",
          // Seek a second in to avoid black-frame intros, then grab one
          // frame.
          "-ss", "1",
          "-i", masterPath,
          "-frames:v", "1",
          "-q:v", "3",
          posterPath,
        ],
        { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 },
      );
    } catch (err) {
      const e = err as { stderr?: Buffer | string; message?: string };
      const stderr =
        typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "";
      return NextResponse.json(
        {
          ok: false,
          error: "ffmpeg_failed",
          message: (stderr || e.message || "ffmpeg failed").slice(-1000),
        },
        { status: 500 },
      );
    }
  }

  const bytes = await fs.readFile(posterPath);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/jpeg",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Length": String(bytes.length),
    },
  });
}
