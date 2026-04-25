// Synthesize narration audio for a step via ElevenLabs TTS, with optional
// voice override and inline narration text edit. Writes the mp3 in-place at
// walkthroughs/<id>/steps/<stepId>.narration.mp3 so the editor's LivePreview
// picks it up immediately.

import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { isValidStepId, isValidWalkthroughId } from "@/lib/ids";
import { readRaw, writeRaw } from "@/lib/walkthrough-mutate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const REPO_ROOT = path.resolve(process.cwd(), "../..");

interface Body {
  narration?: string;
  voice_id?: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; stepId: string } },
) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  if (!isValidStepId(params.stepId)) {
    return NextResponse.json({ error: "invalid_step_id" }, { status: 400 });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });
  }

  const body = (await req.json().catch(() => null)) as Body | null;
  const requested = body?.narration?.trim();
  const voiceId = body?.voice_id?.trim() || null;

  // Read the walkthrough so we can pull the current narration text and voice
  // when the caller didn't supply one. Voice falls back to brand.yaml.
  let raw;
  try {
    raw = await readRaw(params.id);
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const stepIdx = raw.steps.findIndex((s) => s.id === params.stepId);
  if (stepIdx < 0) {
    return NextResponse.json({ error: "step_not_found" }, { status: 404 });
  }
  const step = raw.steps[stepIdx];

  // If the caller passed updated narration, persist it to walkthrough.yaml
  // before we synth — the YAML is the source of truth.
  let writeBack = false;
  if (typeof requested === "string" && requested && requested !== step.narration) {
    step.narration = requested;
    writeBack = true;
  }
  if (voiceId && step.voice_id !== voiceId) {
    step.voice_id = voiceId;
    writeBack = true;
  }
  if (writeBack) await writeRaw(params.id, raw);

  const text = (step.narration ?? "").toString().trim();
  if (!text) {
    return NextResponse.json({ error: "narration_empty" }, { status: 400 });
  }

  // Resolve voice: per-step override → caller arg → brand.yaml → built-in default.
  const resolvedVoice = voiceId
    ?? (typeof step.voice_id === "string" ? step.voice_id : null)
    ?? (await readBrandVoice(params.id))
    ?? "XB0fDUnXU5powFXDhCwa";

  const modelId = "eleven_turbo_v2_5";
  const audio = await synthElevenLabs(apiKey, text, resolvedVoice, modelId);
  if ("error" in audio) {
    return NextResponse.json(
      { error: audio.error, status: audio.status },
      { status: 502 },
    );
  }

  const outPath = path.join(
    REPO_ROOT,
    "walkthroughs",
    params.id,
    "steps",
    `${params.stepId}.narration.mp3`,
  );
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, audio.bytes);

  return NextResponse.json({
    ok: true,
    voice_id: resolvedVoice,
    bytes: audio.bytes.length,
    narration: text,
  });
}

async function readBrandVoice(walkthroughId: string): Promise<string | null> {
  try {
    const brandPath = path.join(REPO_ROOT, "walkthroughs", walkthroughId, "brand.yaml");
    const txt = await fs.readFile(brandPath, "utf8");
    const m = txt.match(/^voice_id:\s*(\S+)/m);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}

async function synthElevenLabs(
  apiKey: string,
  text: string,
  voiceId: string,
  modelId: string,
): Promise<{ bytes: Buffer } | { error: string; status: number }> {
  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({ text, model_id: modelId }),
    },
  );
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    let msg = `ElevenLabs ${res.status}`;
    try {
      const parsed = JSON.parse(t) as { detail?: { message?: string } | string };
      if (typeof parsed.detail === "string") msg = parsed.detail;
      else if (parsed.detail?.message) msg = parsed.detail.message;
    } catch { /* leave default */ }
    return { error: msg, status: res.status };
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) {
    return { error: "narration response too small", status: 502 };
  }
  return { bytes: buf };
}
