import { NextResponse } from "next/server";
import { setTakeStatus } from "@/lib/fs";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const take = await setTakeStatus("v1", params.id, "rejected");
  return NextResponse.json(take);
}
