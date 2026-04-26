// Read + persist API keys to /.env so users don't have to drop into a
// terminal to bootstrap. GET returns each key's masked value + configured
// flag. POST upserts only the keys we care about, preserving other lines
// and trailing comments.
//
// Disabled when NODE_ENV=production — this is a localhost dev convenience.

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { writeFileAtomic } from "@/lib/atomic-io";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const ENV_PATH = path.join(REPO_ROOT, ".env");
const ENV_EXAMPLE = path.join(REPO_ROOT, ".env.example");

const EDITABLE_KEYS = [
  "ANTHROPIC_API_KEY",
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "GOOGLE_API_KEY",
  "GITHUB_TOKEN",
  "GITHUB_WEBHOOK_SECRET",
] as const;
type Key = (typeof EDITABLE_KEYS)[number];

const VALUE_PATTERN = /^[\x20-\x7E]*$/; // printable ASCII, no newlines

function maskValue(v: string): string {
  if (!v) return "";
  if (v.length <= 8) return "•".repeat(v.length);
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}

interface ParsedEnv {
  text: string;
  values: Record<string, string>;
}

async function readEnv(): Promise<ParsedEnv> {
  let text = "";
  try {
    text = await fs.readFile(ENV_PATH, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  const values: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    values[m[1]] = v;
  }
  return { text, values };
}

function upsertEnvLine(text: string, key: string, value: string): string {
  const escaped = /[\s"#=]/.test(value)
    ? `"${value.replace(/"/g, '\\"')}"`
    : value;
  const re = new RegExp(`^${key}\\s*=.*$`, "m");
  if (re.test(text)) return text.replace(re, `${key}=${escaped}`);
  const sep = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}${key}=${escaped}\n`;
}

export async function GET() {
  const { values } = await readEnv();
  const status: Record<Key, { configured: boolean; masked: string }> = {} as Record<
    Key,
    { configured: boolean; masked: string }
  >;
  for (const k of EDITABLE_KEYS) {
    const v = values[k] ?? "";
    status[k] = { configured: v.length > 0, masked: maskValue(v) };
  }
  return NextResponse.json({
    ok: true,
    status,
    env_path_exists: !!(await fs.stat(ENV_PATH).catch(() => null)),
  });
}

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        ok: false,
        error: "production_disabled",
        message: "Editing .env from the UI is disabled in production builds.",
      },
      { status: 403 },
    );
  }

  const body = (await req.json().catch(() => null)) as Partial<Record<Key, string>> | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const updates: Array<[Key, string]> = [];
  for (const [k, v] of Object.entries(body)) {
    if (!EDITABLE_KEYS.includes(k as Key)) continue;
    if (typeof v !== "string") {
      return NextResponse.json(
        { ok: false, error: "invalid_value", key: k },
        { status: 400 },
      );
    }
    if (!VALUE_PATTERN.test(v)) {
      return NextResponse.json(
        { ok: false, error: "invalid_chars", key: k },
        { status: 400 },
      );
    }
    updates.push([k as Key, v]);
  }

  // Seed from .env.example if .env doesn't exist yet — preserves the
  // README's documented variable list so users see other env vars they
  // might want to set later (LOGFIRE_TOKEN, DEMO_APP_*, etc.).
  let { text } = await readEnv();
  if (text === "") {
    try {
      text = await fs.readFile(ENV_EXAMPLE, "utf8");
    } catch {
      /* fine */
    }
  }
  for (const [k, v] of updates) {
    text = upsertEnvLine(text, k, v);
  }
  if (text.length > 0 && !text.endsWith("\n")) text += "\n";

  await writeFileAtomic(ENV_PATH, text);

  return NextResponse.json({
    ok: true,
    written: updates.map(([k]) => k),
    note:
      "Director subprocess picks the new keys up immediately. Routes that read process.env directly need a dev-server restart.",
  });
}
