// Regenerate the continuous narration for a walkthrough.
//
// Wraps `director synth-continuous <id>`, which joins each step's narration
// text into a single ElevenLabs request (so prosody carries across step
// boundaries) and writes:
//   walkthroughs/<id>/narration.mp3
//   walkthroughs/<id>/narration.timing.json
//   walkthroughs/<id>/narration.waveform.json
//
// On success we return the loaded ContinuousNarration so the editor can
// switch from the synthesized fallback to the real take without a refresh.

import "server-only";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, stat } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";
import { isValidWalkthroughId } from "@/lib/ids";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const execFileP = promisify(execFile);

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

interface TimingDoc {
  duration_ms: number;
  steps: Array<{ step_id: string; start_ms: number; end_ms: number }>;
}

interface WaveformDoc {
  duration_s: number;
  sample_rate: number;
  peaks: number[];
}

async function loadIfExists<T>(file: string): Promise<T | null> {
  try {
    const txt = await readFile(file, "utf8");
    return JSON.parse(txt) as T;
  } catch {
    return null;
  }
}

async function masterMp3Url(id: string): Promise<string | null> {
  const file = path.join(WALKTHROUGHS_DIR, id, "narration.mp3");
  try {
    const s = await stat(file);
    if (s.isFile() && s.size > 0) return `/walkthroughs/${id}/narration.mp3`;
  } catch {
    /* fall through */
  }
  return null;
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const pythonPath = path.join(REPO_ROOT, "services", "director", "src");
  const env = {
    ...process.env,
    PYTHONPATH: process.env.PYTHONPATH
      ? `${pythonPath}:${process.env.PYTHONPATH}`
      : pythonPath,
  };

  // Run synchronously — TTS + waveform generation is in the seconds range,
  // not minutes, so a single HTTP request is fine. The director writes its
  // outputs idempotently so a retry is safe.
  try {
    await execFileP(
      "uv",
      ["--directory", "services/director", "run", "director", "synth-continuous", params.id],
      { cwd: REPO_ROOT, env, maxBuffer: 8 * 1024 * 1024 },
    );
  } catch (err) {
    const e = err as { stderr?: Buffer | string; message?: string };
    const stderr = typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "";
    return NextResponse.json(
      { ok: false, error: "synth_failed", detail: stderr.slice(-2000) || e.message },
      { status: 500 },
    );
  }

  const dir = path.join(WALKTHROUGHS_DIR, params.id);
  const timing = await loadIfExists<TimingDoc>(path.join(dir, "narration.timing.json"));
  const waveform = await loadIfExists<WaveformDoc>(path.join(dir, "narration.waveform.json"));
  const audio_url = await masterMp3Url(params.id);

  if (!timing || !waveform) {
    return NextResponse.json(
      { ok: false, error: "missing_outputs" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    narration: {
      duration_ms: timing.duration_ms,
      peaks: waveform.peaks,
      audio_url,
      steps: timing.steps,
      source: "real",
    },
  });
}
