import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { listTakes } from "@/lib/fs";
import { isValidWalkthroughId } from "@/lib/ids";

export const dynamic = "force-dynamic";

/** Light list of takes for the editor's Changes timeline — id, status,
 *  PR ref, created_at. */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ takes: [] });
  }
  try {
    const takes = await listTakes(params.id);
    return NextResponse.json({
      takes: takes.map((t) => ({
        id: t.id,
        status: t.status,
        pr_title: t.pr_title ?? null,
        pr_number: t.pr_number ?? null,
        created_at: t.created_at,
        director_note: t.director_note ?? null,
      })),
    });
  } catch {
    return NextResponse.json({ takes: [] });
  }
}
