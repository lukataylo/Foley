// Append a new step to a walkthrough. Used by the editor's "+ Add step"
// button so users can extend a draft beyond what the proposer wrote
// without hand-editing walkthrough.yaml.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { isValidWalkthroughId } from "@/lib/ids";
import { appendStep } from "@/lib/walkthrough-mutate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PostBody {
  title?: string;
  narration?: string;
  duration_ms?: number;
  step_id?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as PostBody;

  try {
    const step = await appendStep(params.id, {
      title: body.title,
      narration: body.narration,
      duration_ms: body.duration_ms,
      step_id: body.step_id,
    });
    return NextResponse.json({ ok: true, step });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "append_failed",
        message: err instanceof Error ? err.message : "Failed to append step.",
      },
      { status: 500 },
    );
  }
}
