import { NextResponse } from "next/server";
import { setTakeStatus } from "@/lib/fs";
import { isValidTakeId } from "@/lib/ids";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!isValidTakeId(params.id)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }
  try {
    const take = await setTakeStatus("v1", params.id, "rejected");
    return NextResponse.json(take);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ error: "take not found" }, { status: 404 });
    }
    throw err;
  }
}
