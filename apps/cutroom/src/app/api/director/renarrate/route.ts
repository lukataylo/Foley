import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { writeJsonAtomic } from "@/lib/atomic-io";
import { isValidStepId, isValidTakeId } from "@/lib/ids";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

// Re-narrate a step. If `narration` is present in the body we update the
// proposed_step on the take.json (so the director picks up the new text on
// next retake), then call director retake. Otherwise it's a "synth-only"
// pass and we just kick the director.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as {
    take_id?: string;
    step_id?: string;
    narration?: string;
  };
  const { take_id, step_id, narration } = body;
  if (!take_id || !step_id) {
    return NextResponse.json({ error: "missing take_id or step_id" }, { status: 400 });
  }
  if (!isValidTakeId(take_id)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }
  if (!isValidStepId(step_id)) {
    return NextResponse.json({ error: "invalid_step_id" }, { status: 400 });
  }

  if (typeof narration === "string") {
    const takeFile = path.join(
      REPO_ROOT,
      "walkthroughs",
      "v1",
      "takes",
      take_id,
      "take.json",
    );
    try {
      const raw = await fs.readFile(takeFile, "utf8");
      const take = JSON.parse(raw);
      const diff = take.step_diffs.find((d: { step_id: string }) => d.step_id === step_id);
      if (diff && diff.proposed_step) {
        diff.proposed_step.narration = narration;
        diff.proposed_step.narration_hash = null;
      }
      await writeJsonAtomic(takeFile, take);
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
        return NextResponse.json({ error: "take not found" }, { status: 404 });
      }
      throw err;
    }
  }

  const child = spawn(
    "uv",
    ["--directory", "services/director", "run", "director", "retake", step_id, "v1"],
    {
      cwd: REPO_ROOT,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    },
  );
  child.unref();

  return NextResponse.json({ ok: true, enqueued: { action: "renarrate", step_id } });
}
