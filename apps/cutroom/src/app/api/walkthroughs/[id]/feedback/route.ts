// Per-page feedback (👍 / 👎 + optional note). Logs to a JSONL file under
// walkthroughs/<id>/.feedback.jsonl. Mintlify's per-page thumbs-feedback
// pattern, minimal version. No DB required.

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isValidWalkthroughId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

interface FeedbackBody {
  rating: "up" | "down";
  note?: string;
}

function feedbackPath(id: string): string {
  return path.join(WALKTHROUGHS_DIR, id, ".feedback.jsonl");
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => ({}))) as Partial<FeedbackBody>;
  if (body.rating !== "up" && body.rating !== "down") {
    return NextResponse.json(
      { ok: false, error: "invalid_rating", message: "rating must be 'up' or 'down'" },
      { status: 400 },
    );
  }
  const note = (body.note ?? "").slice(0, 500); // hard cap, no PII risk

  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    rating: body.rating,
    note,
    ua: req.headers.get("user-agent")?.slice(0, 200) ?? null,
    referer: req.headers.get("referer")?.slice(0, 300) ?? null,
  });
  await fs.mkdir(path.join(WALKTHROUGHS_DIR, params.id), { recursive: true });
  await fs.appendFile(feedbackPath(params.id), entry + "\n", "utf8");
  return NextResponse.json({ ok: true });
}

interface FeedbackEntry {
  ts: string;
  rating: "up" | "down";
  note: string;
  ua?: string | null;
  referer?: string | null;
}

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  let raw = "";
  try {
    raw = await fs.readFile(feedbackPath(params.id), "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    return NextResponse.json({ ok: true, total: 0, up: 0, down: 0, entries: [] });
  }
  const entries: FeedbackEntry[] = raw
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as FeedbackEntry;
      } catch {
        return null;
      }
    })
    .filter((e): e is FeedbackEntry => e !== null);
  const up = entries.filter((e) => e.rating === "up").length;
  const down = entries.filter((e) => e.rating === "down").length;
  return NextResponse.json({
    ok: true,
    total: entries.length,
    up,
    down,
    entries: entries.slice(-20).reverse(), // last 20, newest first
  });
}
