// Looping GIF preview built from the first ~5 seconds of master.mp4. Cheap
// to embed in README badges, Slack messages, Twitter, etc. Built once and
// cached on disk; rebuilt only when master.mp4 changes mtime.

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

// Tuned to fit the README's "see it in action" frame: home grid →
// overview page → walkthrough player. The seeded foley walkthrough is
// ~26 s long with 5 steps, so 20 s spans the first three. 5 fps × 20 s ×
// 720 wide lands ~1.5–2 MB after palette+dither — acceptable for an
// inline README badge.
const GIF_DURATION_S = 20;
const GIF_FPS = 5;
const GIF_MAX_WIDTH = 720;

async function statOk(file: string): Promise<{ size: number; mtimeMs: number } | null> {
  try {
    const s = await fs.stat(file);
    if (s.isFile() && s.size > 0) return { size: s.size, mtimeMs: s.mtimeMs };
  } catch {
    // ignore
  }
  return null;
}

async function buildGif(masterPath: string, gifPath: string): Promise<void> {
  // Two-pass palette generate + apply for a sharper looking GIF. Cheap.
  const tmpPalette = `${gifPath}.palette.png`;
  const filter = `fps=${GIF_FPS},scale=${GIF_MAX_WIDTH}:-1:flags=lanczos`;
  try {
    await execFileP(
      "ffmpeg",
      [
        "-y",
        "-t", String(GIF_DURATION_S),
        "-i", masterPath,
        "-vf", `${filter},palettegen`,
        tmpPalette,
      ],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );
    await execFileP(
      "ffmpeg",
      [
        "-y",
        "-t", String(GIF_DURATION_S),
        "-i", masterPath,
        "-i", tmpPalette,
        "-lavfi", `${filter} [x]; [x][1:v] paletteuse`,
        "-loop", "0",
        gifPath,
      ],
      { timeout: 60_000, maxBuffer: 8 * 1024 * 1024 },
    );
  } finally {
    await fs.unlink(tmpPalette).catch(() => {
      /* ignore */
    });
  }
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
  const gifPath = path.join(WALKTHROUGHS_DIR, params.id, "preview.gif");

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

  const gifStat = await statOk(gifPath);
  const cached = gifStat && gifStat.mtimeMs >= masterStat.mtimeMs;

  if (!cached) {
    try {
      await buildGif(masterPath, gifPath);
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

  const bytes = await fs.readFile(gifPath);
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=3600",
      "Content-Length": String(bytes.length),
    },
  });
}
