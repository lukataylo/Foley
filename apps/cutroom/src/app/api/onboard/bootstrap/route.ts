import { NextRequest, NextResponse } from "next/server";
import { mkdir, readdir } from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { writeFileAtomic, writeJsonAtomic } from "@/lib/atomic-io";

export const dynamic = "force-dynamic";

interface BootstrapBody {
  full_name: string; // e.g. "yourname/loop"
  default_branch: string;
  description: string | null;
  /** Where the user's product is running locally. The proposer fetches this
   *  URL to ground its draft actions in the real DOM. */
  dev_url?: string;
}

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

async function uniqueSlug(base: string): Promise<string> {
  const existing = new Set(await readdir(WALKTHROUGHS_DIR).catch(() => []));
  if (!existing.has(base)) return base;
  for (let i = 2; i < 50; i++) {
    const cand = `${base}-${i}`;
    if (!existing.has(cand)) return cand;
  }
  return `${base}-${Date.now()}`;
}

const SEED_BRAND = `# Bootstrapped brand for a new walkthrough.
voice_id: XB0fDUnXU5powFXDhCwa     # ElevenLabs Charlotte (en-GB, soft)
voice_name: Charlotte
font_family: "SF Pro Text"
palette_bg: "#0a0a0a"
palette_fg: "#f5f5f5"
palette_accent: "#f5b94a"
pacing_wpm: 168
intro_card_ms: 1500
`;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as BootstrapBody | null;
  if (!body || !body.full_name) {
    return NextResponse.json({ error: "full_name required" }, { status: 400 });
  }

  const repoName = body.full_name.split("/").pop() ?? "walkthrough";
  const baseSlug = slugify(repoName) || "walkthrough";
  const slug = await uniqueSlug(baseSlug);
  const dir = path.join(WALKTHROUGHS_DIR, slug);
  await mkdir(dir, { recursive: true });
  await mkdir(path.join(dir, "steps"), { recursive: true });
  await mkdir(path.join(dir, "takes"), { recursive: true });

  const display_name = repoName
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());

  const walkthrough = {
    version: 1,
    display_name,
    target_app: {
      repo: body.full_name,
      dev_url: body.dev_url || "http://localhost:3001",
    },
    brand_ref: "brand.yaml",
    steps: [
      {
        id: "intro",
        title: `Welcome to ${display_name}`,
        narration: body.description
          ? `Here's a quick tour of ${display_name}. ${body.description}`
          : `Here's a quick tour of ${display_name} in under a minute.`,
        duration_ms: 5000,
        actions: [
          { kind: "goto", url: "/" },
          { kind: "wait", ms: 4500 },
        ],
      },
    ],
  };

  await writeFileAtomic(
    path.join(dir, "walkthrough.yaml"),
    "# Bootstrapped by Foley onboarding.\n" + yaml.dump(walkthrough, { lineWidth: 100 }),
  );
  await writeFileAtomic(path.join(dir, "brand.yaml"), SEED_BRAND);

  // Stamp a tiny "watching" config so the studio's pill knows what to display.
  await writeJsonAtomic(path.join(dir, "watching.json"), {
    repo: body.full_name,
    branch: body.default_branch || "main",
    connected_at: new Date().toISOString(),
    last_check: new Date().toISOString(),
  });

  return NextResponse.json({
    id: slug,
    display_name,
    // Land in the step editor so the user immediately sees the drafted
    // walkthrough and the "Render clips" button. The plain detail view at
    // /walkthroughs/<id> is empty until a master take exists.
    href: `/walkthroughs/${slug}/edit`,
  });
}
