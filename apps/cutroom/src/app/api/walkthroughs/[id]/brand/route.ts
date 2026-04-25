import "server-only";
import { promises as fs } from "fs";
import path from "path";
import yaml from "js-yaml";
import { NextRequest, NextResponse } from "next/server";
import { writeFileAtomic } from "@/lib/atomic-io";
import { isValidWalkthroughId } from "@/lib/ids";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

const ALLOWED_KEYS = new Set([
  "voice_id",
  "voice_name",
  "font_family",
  "palette_bg",
  "palette_fg",
  "palette_accent",
  "pacing_wpm",
  "intro_card_ms",
]);

interface BrandPatch {
  voice_id?: string;
  voice_name?: string;
  font_family?: string;
  palette_bg?: string;
  palette_fg?: string;
  palette_accent?: string;
  pacing_wpm?: number;
  intro_card_ms?: number;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  const patch = (await req.json()) as BrandPatch;
  const file = path.join(REPO_ROOT, "walkthroughs", params.id, "brand.yaml");

  let current: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(file, "utf8");
    current = (yaml.load(raw) ?? {}) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }

  // Only accept whitelisted keys, drop anything else.
  for (const [k, v] of Object.entries(patch)) {
    if (!ALLOWED_KEYS.has(k)) continue;
    if (k === "pacing_wpm" || k === "intro_card_ms") {
      const n = Number(v);
      if (Number.isFinite(n)) current[k] = n;
      continue;
    }
    if (typeof v === "string") current[k] = v;
  }

  const next = yaml.dump(current, { sortKeys: false, lineWidth: 100 });
  await writeFileAtomic(file, next);

  return NextResponse.json({ ok: true, brand: current });
}
