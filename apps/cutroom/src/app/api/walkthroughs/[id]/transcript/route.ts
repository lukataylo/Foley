// JSON transcript with per-step start/end ms + title + narration. Used by
// the transcript panel in MasterCard for click-to-jump scrubbing.

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { isValidWalkthroughId } from "@/lib/ids";
import { loadWalkthrough } from "@/lib/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

interface TimingDoc {
  duration_ms: number;
  steps: Array<{ step_id: string; start_ms: number; end_ms: number }>;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const timingFile = path.join(
    WALKTHROUGHS_DIR,
    params.id,
    "narration.timing.json",
  );

  let timing: TimingDoc | null = null;
  try {
    const raw = await fs.readFile(timingFile, "utf8");
    timing = JSON.parse(raw) as TimingDoc;
  } catch {
    timing = null;
  }

  let walkthrough;
  try {
    walkthrough = await loadWalkthrough(params.id);
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  if (!timing) {
    // Fall back to declared durations summed cumulatively. Less accurate but
    // still a usable transcript when no continuous narration take exists.
    const cues = [];
    let cursor = 0;
    for (const step of walkthrough.steps) {
      cues.push({
        step_id: step.id,
        start_ms: cursor,
        end_ms: cursor + step.duration_ms,
        title: step.title,
        narration: step.narration,
      });
      cursor += step.duration_ms;
    }
    return NextResponse.json({
      ok: true,
      source: "declared",
      duration_ms: cursor,
      cues,
    });
  }

  const stepById = new Map(walkthrough.steps.map((s) => [s.id, s]));
  const cues = timing.steps.map((t) => {
    const step = stepById.get(t.step_id);
    return {
      step_id: t.step_id,
      start_ms: t.start_ms,
      end_ms: t.end_ms,
      title: step?.title ?? t.step_id,
      narration: step?.narration ?? "",
    };
  });

  return NextResponse.json({
    ok: true,
    source: "timing",
    duration_ms: timing.duration_ms,
    cues,
  });
}
