// Re-run a single step's Playwright capture + narration synth from the
// editor. Wraps `director retake <step_id> <walkthrough_id>` synchronously.
//
// Single-step capture is fast (typically 5-15 s). We block on it so the UI
// can refresh the step thumbnail immediately on success.

import "server-only";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isValidStepId, isValidWalkthroughId } from "@/lib/ids";
import { directorErrorResponse } from "@/lib/director-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileP = promisify(execFile);
const REPO_ROOT = path.resolve(process.cwd(), "../..");

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string; stepId: string } },
) {
  if (!isValidWalkthroughId(params.id) || !isValidStepId(params.stepId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const pythonPath = path.join(REPO_ROOT, "services", "director", "src");
  const env = {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH
      ? `${pythonPath}:${process.env.PYTHONPATH}`
      : pythonPath,
  };

  try {
    const { stdout } = await execFileP(
      "uv",
      [
        "--directory",
        "services/director",
        "run",
        "director",
        "retake",
        params.stepId,
        params.id,
      ],
      {
        cwd: REPO_ROOT,
        env,
        // Single-step retake is fast; cap at 90s for safety.
        timeout: 90_000,
        maxBuffer: 8 * 1024 * 1024,
      },
    );
    return NextResponse.json({ ok: true, log: stdout.slice(-2000) });
  } catch (err) {
    return directorErrorResponse(err, "retake_failed");
  }
}
