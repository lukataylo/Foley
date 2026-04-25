import "server-only";
import crypto from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // ElevenLabs music can take ~30-60s

const REPO_ROOT = path.resolve(process.cwd(), "../..");

interface Body {
  walkthrough_id: string;
  prompt: string;
  duration_ms?: number;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "ELEVENLABS_API_KEY not set" }, { status: 500 });
  }
  const body = (await req.json().catch(() => null)) as Body | null;
  if (!body?.walkthrough_id || !body?.prompt) {
    return NextResponse.json({ error: "walkthrough_id and prompt required" }, { status: 400 });
  }

  // ElevenLabs music API: 10s minimum, ~5min max. Default to 30s if unset.
  const durationMs = Math.max(10_000, Math.min(300_000, body.duration_ms ?? 30_000));

  // Hash cache so identical prompts hit the same file. Idempotent re-runs are
  // cheap, and the user can see the same track come back instantly.
  const hash = crypto
    .createHash("sha256")
    .update(`${body.prompt}|${durationMs}`)
    .digest("hex")
    .slice(0, 12);
  const dir = path.join(REPO_ROOT, "walkthroughs", body.walkthrough_id, "music");
  const filePath = path.join(dir, `${hash}.mp3`);
  const publicUrl = `/walkthroughs/${body.walkthrough_id}/music/${hash}.mp3`;

  // If we already have it, short-circuit.
  try {
    const { stat } = await import("fs/promises");
    await stat(filePath);
    return NextResponse.json({ ok: true, url: publicUrl, cached: true });
  } catch {
    /* not cached, generate */
  }

  await mkdir(dir, { recursive: true });

  const res = await fetch("https://api.elevenlabs.io/v1/music", {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      prompt: body.prompt,
      music_length_ms: durationMs,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json(
      { error: `ElevenLabs music ${res.status}: ${text.slice(0, 400)}` },
      { status: 502 },
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 1000) {
    return NextResponse.json({ error: "music response too small" }, { status: 502 });
  }
  await writeFile(filePath, buf);

  return NextResponse.json({
    ok: true,
    url: publicUrl,
    bytes: buf.length,
    duration_ms: durationMs,
    prompt: body.prompt,
  });
}
