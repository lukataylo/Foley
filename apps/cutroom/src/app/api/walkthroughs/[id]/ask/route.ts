// "Ask this walkthrough" — RAG over the walkthrough's narration. Calls
// Claude Sonnet 4.6 with the full step-by-step transcript as context and
// returns a JSON object with `answer` (string) plus `citations` (array of
// step ids the answer drew from). The /docs/<id> page renders the answer
// and turns the cited step ids into click-to-jump links.
//
// We use a forced tool call (`submit_answer`) for clean structured output
// — same pattern as the proposer and PR-review agents.

import "server-only";
import { execFile } from "child_process";
import { promisify } from "util";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isValidWalkthroughId } from "@/lib/ids";
import { directorErrorResponse } from "@/lib/director-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileP = promisify(execFile);
const REPO_ROOT = path.resolve(process.cwd(), "../..");

interface PostBody {
  question: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Partial<PostBody>;
  const question = (body.question ?? "").trim();
  if (!question) {
    return NextResponse.json(
      { ok: false, error: "no_question", message: "Pass { question: string }." },
      { status: 400 },
    );
  }
  if (question.length > 500) {
    return NextResponse.json(
      { ok: false, error: "too_long", message: "Question must be ≤ 500 chars." },
      { status: 400 },
    );
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
        "ask",
        params.id,
        "--question",
        question,
      ],
      { cwd: REPO_ROOT, env, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
    );
    // CLI prints a single-line JSON envelope after a logfire status line;
    // grab the last JSON object.
    const lastBrace = stdout.lastIndexOf("{");
    const trailing = lastBrace >= 0 ? stdout.slice(lastBrace) : stdout;
    const parsed = JSON.parse(trailing) as {
      answer: string;
      citations: string[];
    };
    return NextResponse.json({ ok: true, ...parsed });
  } catch (err) {
    return directorErrorResponse(err, "ask_failed");
  }
}
