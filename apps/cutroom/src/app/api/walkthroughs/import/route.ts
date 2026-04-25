// Import a captured walkthrough from the Foley Recorder Chrome extension.
// Writes the same on-disk shape the director produces: walkthrough.yaml,
// brand.yaml, and one PNG per step under steps/. The detail page at
// /walkthroughs/<id> picks it up immediately — no rebuild needed.

import { NextResponse } from "next/server";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

const SelectorsSchema = z.object({
  primary: z.string(),
  candidates: z.array(z.string()).default([]),
});

const ActionSchema = z.object({
  kind: z.enum(["click", "fill", "hover"]),
  selectors: SelectorsSchema,
  label: z.string().nullable().optional(),
  role: z.string().nullable().optional(),
  value: z.string().optional(),
});

const StepSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string().optional().nullable(),
  timestamp: z.number().optional(),
  action: ActionSchema,
  screenshot: z.string().nullable().optional(),
});

const PayloadSchema = z.object({
  version: z.literal(1),
  captured_at: z.string().nullable().optional(),
  start_url: z.string().nullable().optional(),
  duration_ms: z.number().optional(),
  steps: z.array(StepSchema),
  viewport: z
    .object({ width: z.number().int().positive(), height: z.number().int().positive() })
    .optional(),
  // Optional overrides from the popup form.
  display_name: z.string().trim().min(1).max(120).optional(),
  target_id: z.string().regex(/^[a-z0-9_-]+$/).max(64).optional(),
});

type Payload = z.infer<typeof PayloadSchema>;
type ImportedStep = z.infer<typeof StepSchema>;

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

export async function POST(req: Request) {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    return jsonError(400, "invalid_json");
  }

  const parsed = PayloadSchema.safeParse(json);
  if (!parsed.success) {
    return jsonError(400, "invalid_payload", parsed.error.flatten());
  }
  const payload = parsed.data;
  if (!payload.steps.length) {
    return jsonError(400, "no_steps");
  }

  const viewport = payload.viewport ?? { width: 1440, height: 900 };

  // Append mode: drop the captured steps into an existing walkthrough.
  if (payload.target_id) {
    return appendToExisting(payload, viewport);
  }

  // New walkthrough.
  const id = generateWalkthroughId(payload.start_url);
  const dir = path.join(WALKTHROUGHS_DIR, id);
  const stepsDir = path.join(dir, "steps");
  await mkdir(stepsDir, { recursive: true });

  const stepIdMap = new Map<string, string>(); // captured id -> stable slug
  payload.steps.forEach((s, i) => {
    stepIdMap.set(s.id, uniqueSlug(slugForIndex(i, s), new Set()));
  });

  for (const captured of payload.steps) {
    const stableId = stepIdMap.get(captured.id)!;
    await writeScreenshot(stepsDir, stableId, captured.screenshot);
  }

  const target = deriveTarget(payload.start_url);
  const displayName =
    payload.display_name ?? defaultDisplayName(payload.start_url, payload.captured_at);

  const walkthroughDoc = {
    version: 1,
    display_name: displayName,
    target_app: target,
    brand_ref: "brand.yaml",
    steps: payload.steps.map((s) =>
      buildYamlStep(s, stepIdMap.get(s.id)!, viewport, payload.start_url ?? null),
    ),
  };

  await writeFile(
    path.join(dir, "walkthrough.yaml"),
    [
      `# Imported by Foley Recorder on ${new Date().toISOString()}`,
      payload.start_url ? `# Source: ${payload.start_url}` : null,
      "",
      yaml.dump(walkthroughDoc, { lineWidth: 100, noRefs: true }),
    ]
      .filter(Boolean)
      .join("\n"),
    "utf8",
  );

  await writeFile(path.join(dir, "brand.yaml"), defaultBrandYaml(), "utf8");

  const url = `/walkthroughs/${id}/edit`;
  return NextResponse.json({ ok: true, id, url, mode: "new" }, { headers: corsHeaders() });
}

async function appendToExisting(payload: Payload, viewport: { width: number; height: number }) {
  const targetId = payload.target_id!;
  const dir = path.join(WALKTHROUGHS_DIR, targetId);
  const stepsDir = path.join(dir, "steps");
  const yamlPath = path.join(dir, "walkthrough.yaml");

  let existing: Record<string, unknown>;
  try {
    existing = (yaml.load(await readFile(yamlPath, "utf8")) ?? {}) as Record<string, unknown>;
  } catch {
    return jsonError(404, "target_not_found");
  }

  await mkdir(stepsDir, { recursive: true });

  const existingSteps = (existing.steps as Array<Record<string, unknown>>) ?? [];
  const usedIds = new Set(existingSteps.map((s) => String(s.id)));

  // Resolve start_url for goto-path stripping. Prefer the existing walkthrough's
  // dev_url so paths in this batch stay consistent with the rest of the file.
  const targetApp = existing.target_app as { dev_url?: string } | undefined;
  const baseUrl = targetApp?.dev_url ?? payload.start_url ?? null;

  const stepIdMap = new Map<string, string>();
  payload.steps.forEach((s, i) => {
    const wantedIndex = existingSteps.length + i + 1;
    const proposed = slugForIndex(wantedIndex - 1, s);
    stepIdMap.set(s.id, uniqueSlug(proposed, usedIds));
  });

  for (const captured of payload.steps) {
    const stableId = stepIdMap.get(captured.id)!;
    await writeScreenshot(stepsDir, stableId, captured.screenshot);
  }

  const newSteps = payload.steps.map((s) =>
    buildYamlStep(s, stepIdMap.get(s.id)!, viewport, baseUrl),
  );

  // Optionally rename the walkthrough if a display_name was provided.
  if (payload.display_name) {
    existing.display_name = payload.display_name;
  }
  existing.steps = [...existingSteps, ...newSteps];

  await writeFile(
    yamlPath,
    [
      `# Steps appended by Foley Recorder on ${new Date().toISOString()}`,
      payload.start_url ? `# Source: ${payload.start_url}` : null,
      "",
      yaml.dump(existing, { lineWidth: 100, noRefs: true }),
    ]
      .filter(Boolean)
      .join("\n"),
    "utf8",
  );

  return NextResponse.json(
    {
      ok: true,
      id: targetId,
      url: `/walkthroughs/${targetId}/edit`,
      mode: "append",
      appended: payload.steps.length,
    },
    { headers: corsHeaders() },
  );
}

async function writeScreenshot(
  stepsDir: string,
  stableId: string,
  dataUrl: string | null | undefined,
): Promise<void> {
  if (!dataUrl) return;
  const png = decodeDataUrl(dataUrl);
  if (png) await writeFile(path.join(stepsDir, `${stableId}.png`), png);
}

function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}_${n}`)) n++;
  const out = `${base}_${n}`;
  used.add(out);
  return out;
}

// ---------------------------------------------------------------------------

function jsonError(status: number, code: string, detail?: unknown) {
  return NextResponse.json(
    { ok: false, error: code, detail },
    { status, headers: corsHeaders() },
  );
}

function generateWalkthroughId(startUrl: string | null | undefined): string {
  const ts = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const ms = String(ts.getMilliseconds()).padStart(3, "0");
  // Two imports in the same second won't collide on the millisecond suffix.
  const stamp = `${ts.getFullYear()}${pad(ts.getMonth() + 1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}-${ms}`;
  const host = (() => {
    if (!startUrl) return null;
    try {
      return new URL(startUrl).hostname.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
    } catch {
      return null;
    }
  })();
  const prefix = host ? `rec-${host}` : "rec";
  return `${prefix}-${stamp}`;
}

function slugForIndex(index: number, step: ImportedStep): string {
  // Director's pydantic schema enforces ^[a-z0-9_]+$ on step ids.
  const base = step.action?.label
    ? step.action.label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")
    : "";
  const suffix = base ? `_${base}` : "";
  return `step_${String(index + 1).padStart(2, "0")}${suffix}`.slice(0, 60);
}

function decodeDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  try {
    return Buffer.from(m[2], "base64");
  } catch {
    return null;
  }
}

function defaultDisplayName(
  startUrl: string | null | undefined,
  capturedAt: string | null | undefined,
): string {
  const host = (() => {
    if (!startUrl) return null;
    try {
      return new URL(startUrl).hostname;
    } catch {
      return null;
    }
  })();
  const date = capturedAt ? new Date(capturedAt) : new Date();
  const stamp = date.toLocaleString("en-GB", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  return host ? `${host} · ${stamp}` : `Captured ${stamp}`;
}

function deriveTarget(startUrl: string | null | undefined) {
  let dev_url = "http://localhost:3000";
  let host = "imported";
  if (startUrl) {
    try {
      const u = new URL(startUrl);
      // Special schemes (chrome://, file://, about:) report origin "null".
      if (u.origin && u.origin !== "null") dev_url = u.origin;
      if (u.hostname) host = u.hostname;
    } catch {
      /* keep defaults */
    }
  }
  return {
    repo: `imported/${host}`,
    dev_url,
  };
}

function stripOrigin(url: string | null | undefined, startUrl: string | null): string {
  if (!url) return "/";
  try {
    const u = new URL(url);
    if (startUrl) {
      const base = new URL(startUrl);
      if (u.origin === base.origin) return u.pathname + u.search + u.hash;
    }
    return url;
  } catch {
    return url;
  }
}

function buildYamlStep(
  s: ImportedStep,
  stableId: string,
  viewport: { width: number; height: number },
  startUrl: string | null,
) {
  const path = stripOrigin(s.url ?? null, startUrl);
  const actions: Array<Record<string, unknown>> = [];
  actions.push({ kind: "goto", url: path });
  actions.push({ kind: "wait", ms: 800 });

  const sel = s.action.selectors.primary;
  if (s.action.kind === "click" && sel) {
    actions.push({ kind: "click", selector: sel });
  } else if (s.action.kind === "fill" && sel) {
    actions.push({ kind: "fill", selector: sel, value: s.action.value ?? "" });
  } else if (s.action.kind === "hover" && sel) {
    actions.push({ kind: "hover", selector: sel });
  }
  actions.push({ kind: "wait", ms: 1500 });

  return {
    id: stableId,
    title: s.title,
    narration: s.title,
    duration_ms: 4000,
    viewport,
    actions,
  };
}

function defaultBrandYaml(): string {
  return [
    "# Default brand for imported walkthroughs.",
    "# Edit voice, palette, and pacing to taste.",
    "voice_id: XB0fDUnXU5powFXDhCwa",
    "voice_name: Charlotte",
    'font_family: "SF Pro Text"',
    'palette_bg: "#0a0a0a"',
    'palette_fg: "#f5f5f5"',
    'palette_accent: "#5b8cff"',
    "pacing_wpm: 168",
    "intro_card_ms: 1500",
    "",
  ].join("\n");
}
