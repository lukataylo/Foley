import { NextResponse } from "next/server";
import { setTakeStatus } from "@/lib/fs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const take = await setTakeStatus("v1", params.id, "approved");
    return NextResponse.json(take);
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ error: "take not found" }, { status: 404 });
    }
    throw err;
  }
}
