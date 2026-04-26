import { NextResponse } from "next/server";
import { findTakeWalkthroughId, setTakeStatus } from "@/lib/fs";
import { isValidTakeId } from "@/lib/ids";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isValidTakeId(params.id)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }
  const wtHint = new URL(req.url).searchParams.get("wt");
  const wtId = await findTakeWalkthroughId(params.id, wtHint);
  if (!wtId) {
    return NextResponse.json({ error: "take not found" }, { status: 404 });
  }
  try {
    const take = await setTakeStatus(wtId, params.id, "rejected");
    return NextResponse.json(take);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ error: "take not found" }, { status: 404 });
    }
    throw err;
  }
}
