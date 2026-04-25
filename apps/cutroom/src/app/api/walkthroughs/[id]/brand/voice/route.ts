// Clone a custom voice into the walkthrough's brand from an audio sample.
//
// Multipart upload of a 30 s – 5 min m4a / mp3 / wav. We forward to
// ElevenLabs Instant Voice Cloning, write the returned voice_id into
// brand.yaml, and return it.

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import yaml from "js-yaml";
import { NextRequest, NextResponse } from "next/server";
import { isValidWalkthroughId } from "@/lib/ids";
import { writeFileAtomic } from "@/lib/atomic-io";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");
const ELEVENLABS_BASE = "https://api.elevenlabs.io/v1";

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB — ElevenLabs accepts up to 11 MB per file but we leave headroom.
const ALLOWED_TYPES = new Set(["audio/mpeg", "audio/mp3", "audio/m4a", "audio/x-m4a", "audio/mp4", "audio/wav", "audio/wave", "audio/x-wav", "audio/webm"]);

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const apiKey = process.env.ELEVENLABS_API_KEY ?? "";
  if (!apiKey) {
    return NextResponse.json(
      {
        ok: false,
        error: "missing_api_key",
        message:
          "ElevenLabs API key not set. Open .env at the repo root, paste your ELEVENLABS_API_KEY, then restart the dev server.",
      },
      { status: 412 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json(
      { ok: false, error: "bad_request", message: "Expected multipart/form-data with a `file` field." },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { ok: false, error: "no_file", message: "Attach an audio file under the form field `file`." },
      { status: 400 },
    );
  }
  if (file.size === 0 || file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        ok: false,
        error: "size",
        message: `Audio must be 1 byte – 25 MB. Got ${file.size} bytes.`,
      },
      { status: 400 },
    );
  }
  if (file.type && !ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        ok: false,
        error: "unsupported_type",
        message: `Audio type "${file.type}" not supported. Use mp3, m4a, wav, or webm.`,
      },
      { status: 400 },
    );
  }

  const voiceName =
    (form.get("name") as string | null) ??
    `${params.id} (custom)`;

  const upstream = new FormData();
  upstream.set("name", voiceName);
  upstream.set("files", file, file.name || "sample.mp3");
  upstream.set(
    "description",
    `Cloned via Foley for walkthrough ${params.id} on ${new Date().toISOString().slice(0, 10)}`,
  );

  let voiceId: string;
  let returnedName: string | undefined;
  try {
    const r = await fetch(`${ELEVENLABS_BASE}/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": apiKey },
      body: upstream,
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      return NextResponse.json(
        {
          ok: false,
          error: "elevenlabs_failed",
          message: `ElevenLabs rejected the clone (HTTP ${r.status}): ${detail.slice(0, 400)}`,
        },
        { status: 502 },
      );
    }
    const data = (await r.json()) as { voice_id?: string; name?: string };
    if (!data.voice_id) {
      return NextResponse.json(
        { ok: false, error: "no_voice_id", message: "ElevenLabs response missing voice_id." },
        { status: 502 },
      );
    }
    voiceId = data.voice_id;
    returnedName = data.name;
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: "network",
        message: err instanceof Error ? err.message : "Network error talking to ElevenLabs.",
      },
      { status: 502 },
    );
  }

  // Patch brand.yaml in place. Preserve any existing keys.
  const brandPath = path.join(WALKTHROUGHS_DIR, params.id, "brand.yaml");
  let brand: Record<string, unknown> = {};
  try {
    const raw = await fs.readFile(brandPath, "utf8");
    brand = (yaml.load(raw) ?? {}) as Record<string, unknown>;
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
  brand.voice_id = voiceId;
  brand.voice_name = returnedName ?? voiceName;
  await writeFileAtomic(
    brandPath,
    yaml.dump(brand, { sortKeys: false, lineWidth: 100 }),
  );

  return NextResponse.json({
    ok: true,
    voice_id: voiceId,
    voice_name: brand.voice_name,
  });
}
