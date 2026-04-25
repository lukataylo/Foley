import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { listTakes } from "@/lib/fs";

export const dynamic = "force-dynamic";

interface ProposedStep {
  id: string;
  title?: string;
  narration?: string;
  duration_ms?: number;
  actions?: unknown[];
}

interface StepDiffEntry {
  step_id: string;
  status: string;
  reason?: string;
  proposed_step?: ProposedStep | null;
}

interface Suggestion {
  id: string;             // take_id + step_id
  take_id: string;
  pr_title: string | null;
  pr_number: number | null;
  status: "added" | "changed";
  step_id: string;
  title: string;
  narration: string;
  reason: string;
  duration_ms: number;
  /** convention: walkthroughs/<id>/steps/<step_id>.png if present, else null */
  frame_url: string | null;
  proposed_step: ProposedStep | null;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  let takes;
  try {
    takes = await listTakes(params.id);
  } catch {
    return NextResponse.json({ suggestions: [] });
  }

  const out: Suggestion[] = [];
  for (const t of takes) {
    if (t.id === "master") continue;
    if (t.status === "rejected") continue;
    for (const d of (t.step_diffs ?? []) as StepDiffEntry[]) {
      if (d.status !== "added" && d.status !== "changed") continue;
      const ps = d.proposed_step ?? null;
      const stepId = ps?.id ?? d.step_id;
      const title = ps?.title ?? stepId;
      const narration = (ps?.narration ?? "").trim();
      out.push({
        id: `${t.id}-${stepId}`,
        take_id: t.id,
        pr_title: t.pr_title ?? null,
        pr_number: t.pr_number ?? null,
        status: d.status as "added" | "changed",
        step_id: stepId,
        title,
        narration,
        reason: d.reason ?? "",
        duration_ms: ps?.duration_ms ?? 5000,
        frame_url: `/walkthroughs/${params.id}/steps/${stepId}.png`,
        proposed_step: ps,
      });
    }
  }
  // Newest takes first.
  out.sort((a, b) => (b.take_id > a.take_id ? 1 : -1));
  return NextResponse.json({ suggestions: out });
}
