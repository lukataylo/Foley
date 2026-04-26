import "server-only";
import { spawn } from "child_process";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isValidStepId, isValidWalkthroughId } from "@/lib/ids";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

// Spawn `director retake <step>` against the current walkthrough so the user
// can re-capture a single step from the cutroom. Detached + stdio:ignore so
// the request returns instantly; the cutroom will pick up new artifacts on
// the next refresh.
export async function POST(req: NextRequest) {
  const { step_id, walkthrough_id = "v1" } = (await req.json()) as {
    step_id?: string;
    walkthrough_id?: string;
  };
  if (!step_id) {
    return NextResponse.json({ error: "missing step_id" }, { status: 400 });
  }
  if (!isValidStepId(step_id)) {
    return NextResponse.json({ error: "invalid_step_id" }, { status: 400 });
  }
  if (!isValidWalkthroughId(walkthrough_id)) {
    return NextResponse.json({ error: "invalid_walkthrough_id" }, { status: 400 });
  }

  const child = spawn(
    "uv",
    ["--directory", "services/director", "run", "director", "retake", step_id, walkthrough_id],
    {
      cwd: REPO_ROOT,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    },
  );
  child.unref();

  return NextResponse.json({ ok: true, enqueued: { action: "retake", step_id, walkthrough_id } });
}
