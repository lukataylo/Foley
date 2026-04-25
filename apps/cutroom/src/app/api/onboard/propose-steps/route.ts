// Draft the first cut of a walkthrough's steps for a freshly onboarded
// project. Wraps `director propose-steps <id> --dev-url <url>`, which calls
// Claude Sonnet 4.6 to write 3–8 grounded Steps into walkthrough.yaml,
// replacing the stub `intro` step that bootstrap created.
//
// This is the centerpiece of the onboarding demo: judges click "Pick a repo"
// and a few seconds later land in the studio with a full draft they can
// retake, edit, or render.

import "server-only";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { NextResponse } from "next/server";
import { isValidWalkthroughId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileP = promisify(execFile);

const REPO_ROOT = path.resolve(process.cwd(), "../..");

interface ProposeBody {
  walkthrough_id: string;
  dev_url?: string;
  description?: string;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as ProposeBody | null;
  if (!body || !body.walkthrough_id) {
    return NextResponse.json({ ok: false, error: "walkthrough_id required" }, { status: 400 });
  }
  if (!isValidWalkthroughId(body.walkthrough_id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const pythonPath = path.join(REPO_ROOT, "services", "director", "src");
  const env = {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH
      ? `${pythonPath}:${process.env.PYTHONPATH}`
      : pythonPath,
  };

  const args = [
    "--directory",
    "services/director",
    "run",
    "director",
    "propose-steps",
    body.walkthrough_id,
  ];
  if (body.dev_url) {
    args.push("--dev-url", body.dev_url);
  }
  if (body.description) {
    args.push("--description", body.description);
  }

  try {
    const { stdout } = await execFileP("uv", args, {
      cwd: REPO_ROOT,
      env,
      // Claude with adaptive thinking + HTML fetch can take 20-40s.
      timeout: 90_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    return NextResponse.json({ ok: true, log: stdout.slice(-2000) });
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr = typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "";
    return NextResponse.json(
      {
        ok: false,
        error: "propose_failed",
        detail: stderr.slice(-2000) || e.message || "unknown",
      },
      { status: 500 },
    );
  }
}
