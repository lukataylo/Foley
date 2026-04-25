// PATCH or DELETE a single step in walkthrough.yaml.

import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteStepScreenshot, readRaw, writeRaw } from "@/lib/walkthrough-mutate";
import { isValidStepId, isValidWalkthroughId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PatchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  narration: z.string().trim().min(1).max(2000).optional(),
  duration_ms: z.number().int().positive().max(60_000).optional(),
});

function badId(params: { id: string; stepId: string }) {
  if (!isValidWalkthroughId(params.id)) return "invalid_id";
  if (!isValidStepId(params.stepId)) return "invalid_step_id";
  return null;
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string; stepId: string } },
) {
  const idErr = badId(params);
  if (idErr) return NextResponse.json({ ok: false, error: idErr }, { status: 400 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "invalid_payload", detail: parsed.error.flatten() },
      { status: 400 },
    );
  }

  // Bail out before the YAML round-trip if the caller sent an empty patch
  // (an editor blur with no real change).
  const wantsChange =
    parsed.data.title !== undefined ||
    parsed.data.narration !== undefined ||
    parsed.data.duration_ms !== undefined;
  if (!wantsChange) {
    return NextResponse.json({ ok: true, noop: true });
  }

  let raw;
  try {
    raw = await readRaw(params.id);
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const idx = raw.steps.findIndex((s) => s.id === params.stepId);
  if (idx < 0) {
    return NextResponse.json({ ok: false, error: "step_not_found" }, { status: 404 });
  }

  const step = raw.steps[idx];
  let changed = false;
  if (parsed.data.title !== undefined && step.title !== parsed.data.title) {
    step.title = parsed.data.title;
    changed = true;
  }
  if (parsed.data.narration !== undefined && step.narration !== parsed.data.narration) {
    step.narration = parsed.data.narration;
    changed = true;
  }
  if (
    parsed.data.duration_ms !== undefined &&
    step.duration_ms !== parsed.data.duration_ms
  ) {
    step.duration_ms = parsed.data.duration_ms;
    changed = true;
  }

  if (changed) await writeRaw(params.id, raw);
  return NextResponse.json({ ok: true, step, noop: !changed });
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string; stepId: string } },
) {
  const idErr = badId(params);
  if (idErr) return NextResponse.json({ ok: false, error: idErr }, { status: 400 });

  let raw;
  try {
    raw = await readRaw(params.id);
  } catch {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const before = raw.steps.length;
  raw.steps = raw.steps.filter((s) => s.id !== params.stepId);
  if (raw.steps.length === before) {
    return NextResponse.json({ ok: false, error: "step_not_found" }, { status: 404 });
  }

  await writeRaw(params.id, raw);
  await deleteStepScreenshot(params.id, params.stepId);
  return NextResponse.json({ ok: true, remaining: raw.steps.length });
}
