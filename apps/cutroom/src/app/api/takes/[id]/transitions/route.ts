import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { writeJsonAtomic } from "@/lib/atomic-io";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

function file(takeId: string): string {
  return path.join(REPO_ROOT, "walkthroughs", "v1", "takes", takeId, "transitions.json");
}

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const raw = await fs.readFile(file(params.id), "utf8");
    return NextResponse.json(JSON.parse(raw));
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code === "ENOENT") {
      return NextResponse.json({ transitions: [] });
    }
    throw err;
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json();
  const out = file(params.id);
  await fs.mkdir(path.dirname(out), { recursive: true });
  await writeJsonAtomic(out, body);
  return NextResponse.json({ ok: true });
}
