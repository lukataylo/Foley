// WebVTT subtitles for a walkthrough's master narration.
// Lazily generated on first GET via `director captions`. Cached on disk at
// walkthroughs/<id>/captions.vtt.

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

async function readIfExists(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, "utf8");
  } catch {
    return null;
  }
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const captionsPath = path.join(WALKTHROUGHS_DIR, params.id, "captions.vtt");

  let vtt = await readIfExists(captionsPath);

  if (!vtt) {
    // Lazy build. Needs narration.timing.json on disk.
    const timingPath = path.join(WALKTHROUGHS_DIR, params.id, "narration.timing.json");
    const timing = await readIfExists(timingPath);
    if (!timing) {
      return NextResponse.json(
        {
          ok: false,
          error: "no_timing",
          message:
            "Continuous narration hasn't been synthesised yet. Click 'regenerate voice' on the timeline or run `director synth-continuous <id>`.",
        },
        { status: 404 },
      );
    }

    const pythonPath = path.join(REPO_ROOT, "services", "director", "src");
    try {
      await execFileP(
        "uv",
        ["--directory", "services/director", "run", "director", "captions", params.id],
        {
          cwd: REPO_ROOT,
          env: { ...process.env, PYTHONPATH: pythonPath },
          timeout: 15_000,
          maxBuffer: 4 * 1024 * 1024,
        },
      );
      vtt = await readIfExists(captionsPath);
    } catch (err) {
      const e = err as { stderr?: Buffer | string; message?: string };
      const stderr =
        typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "";
      return NextResponse.json(
        {
          ok: false,
          error: "captions_failed",
          message: (stderr || e.message || "captions generation failed").slice(-1000),
        },
        { status: 500 },
      );
    }
  }

  if (!vtt) {
    return NextResponse.json(
      { ok: false, error: "not_found" },
      { status: 404 },
    );
  }

  return new NextResponse(vtt, {
    status: 200,
    headers: {
      "Content-Type": "text/vtt; charset=utf-8",
      // Captions don't change unless you re-synth; safe to cache for a few
      // minutes. Tools that consume the file usually request once.
      "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
    },
  });
}
