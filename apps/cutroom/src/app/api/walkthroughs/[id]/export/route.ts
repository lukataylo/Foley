import "server-only";
import crypto from "crypto";
import { spawn } from "child_process";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { migrateOverlay, type EditOverlay, type MusicClip } from "@/lib/timeline";
import { publicPath } from "@/lib/fs";
import { isValidTakeId, isValidWalkthroughId } from "@/lib/ids";
import { publicAssetPath } from "@/lib/path-security";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // ffmpeg can take a while

const REPO_ROOT = path.resolve(process.cwd(), "../..");

interface Body {
  take_id?: string; // defaults to "master"
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", ["-y", ...args], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (b) => { stderr += b.toString(); });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(-1500)}`));
    });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as Body;
  const takeId = body.take_id ?? "master";
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ error: "invalid_id" }, { status: 400 });
  }
  if (!isValidTakeId(takeId)) {
    return NextResponse.json({ error: "invalid_take_id" }, { status: 400 });
  }

  const takeDir = path.join(REPO_ROOT, "walkthroughs", params.id, "takes", takeId);
  const masterPath = path.join(takeDir, "master.mp4");
  try {
    await stat(masterPath);
  } catch {
    return NextResponse.json({ error: `master.mp4 missing at ${takeId}` }, { status: 404 });
  }

  // Load overlay so we can mix in any music clips. If no overlay on disk,
  // there are no music tracks to mix and the export equals the master.
  const overlayPath = path.join(REPO_ROOT, "walkthroughs", params.id, "timeline.json");
  let overlay: EditOverlay | null = null;
  try {
    const raw = await readFile(overlayPath, "utf8");
    overlay = migrateOverlay(JSON.parse(raw));
  } catch {
    /* no overlay */
  }
  const musicClips: MusicClip[] =
    overlay?.clips.filter((c): c is MusicClip => c.kind === "music" && !!c.asset_url) ?? [];

  const exportsDir = path.join(REPO_ROOT, "walkthroughs", params.id, "exports");
  await mkdir(exportsDir, { recursive: true });

  // Hash on inputs so identical exports short-circuit.
  const hashInput = JSON.stringify({
    takeId,
    music: musicClips.map((c) => ({
      url: c.asset_url, start: c.start_ms, dur: c.duration_ms, vol: c.volume,
      fi: c.fade_in_ms, fo: c.fade_out_ms,
    })),
  });
  const hash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 12);
  const outPath = path.join(exportsDir, `${takeId}-${hash}.mp4`);
  const publicUrl = publicPath(params.id, "exports", `${takeId}-${hash}.mp4`);

  try {
    const s = await stat(outPath);
    return NextResponse.json({
      ok: true, url: publicUrl, bytes: s.size, cached: true,
      music_tracks: musicClips.length,
    });
  } catch { /* not cached, render */ }

  if (musicClips.length === 0) {
    // No music to mix — copy the master as the export.
    const buf = await readFile(masterPath);
    await writeFile(outPath, buf);
    return NextResponse.json({
      ok: true, url: publicUrl, bytes: buf.length, music_tracks: 0,
    });
  }

  // Build ffmpeg args. Inputs: master + each music asset. Use amix to combine
  // master audio with the music tracks (each delayed to its start_ms).
  // The master video stream is copied through; only audio is re-encoded.
  const inputs: string[] = ["-i", masterPath];
  for (const m of musicClips) {
    const localPath = publicAssetPath(REPO_ROOT, m.asset_url);
    if (!localPath) {
      return NextResponse.json({ error: "invalid_music_asset" }, { status: 400 });
    }
    inputs.push("-i", localPath);
  }

  // Filter complex:
  // [0:a] master narration (label "narr")
  // [1:a]..[Na:a] music tracks → adelay → volume → label "m1","m2",...
  // amix all of them → "mixout"
  const filterParts: string[] = [];
  filterParts.push(`[0:a]volume=1.0[narr]`);
  const mixLabels = ["narr"];
  musicClips.forEach((c, i) => {
    const idx = i + 1; // 0 is master
    const delayMs = Math.max(0, c.start_ms);
    const fadeIn = c.fade_in_ms / 1000;
    const fadeOut = c.fade_out_ms / 1000;
    const dur = c.duration_ms / 1000;
    const fadeOutStart = Math.max(0, dur - fadeOut);
    let chain = `[${idx}:a]atrim=0:${dur.toFixed(3)},asetpts=PTS-STARTPTS`;
    if (fadeIn > 0.01) chain += `,afade=t=in:st=0:d=${fadeIn.toFixed(3)}`;
    if (fadeOut > 0.01) chain += `,afade=t=out:st=${fadeOutStart.toFixed(3)}:d=${fadeOut.toFixed(3)}`;
    chain += `,volume=${c.volume.toFixed(3)}`;
    if (delayMs > 0) chain += `,adelay=${delayMs}|${delayMs}`;
    chain += `[m${idx}]`;
    filterParts.push(chain);
    mixLabels.push(`m${idx}`);
  });
  const inputsForMix = mixLabels.map((l) => `[${l}]`).join("");
  filterParts.push(`${inputsForMix}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0,volume=1.5[mixout]`);

  try {
    await runFfmpeg([
      ...inputs,
      "-filter_complex", filterParts.join(";"),
      "-map", "0:v",
      "-map", "[mixout]",
      "-c:v", "copy",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-movflags", "+faststart",
      "-shortest",
      outPath,
    ]);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ffmpeg failed" },
      { status: 500 },
    );
  }

  const s = await stat(outPath);
  return NextResponse.json({
    ok: true,
    url: publicUrl,
    bytes: s.size,
    music_tracks: musicClips.length,
  });
}
