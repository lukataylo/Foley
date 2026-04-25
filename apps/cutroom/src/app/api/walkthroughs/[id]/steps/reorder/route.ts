// Reorder a walkthrough's steps. Accepts the full ordered id list and
// rewrites walkthrough.yaml to match. Reuses cached clips: the next render
// will reuse byte-identical segments and just re-run concat.

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { isValidWalkthroughId } from "@/lib/ids";
import { reorderSteps } from "@/lib/walkthrough-mutate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PostBody {
  ids: string[];
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Partial<PostBody>;
  if (!Array.isArray(body.ids) || !body.ids.every((s) => typeof s === "string")) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", message: "Expected { ids: string[] }." },
      { status: 400 },
    );
  }

  try {
    const ids = await reorderSteps(params.id, body.ids);
    return NextResponse.json({ ok: true, ids });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "reorder_failed",
        message: err instanceof Error ? err.message : "Failed to reorder steps.",
      },
      { status: 400 },
    );
  }
}
