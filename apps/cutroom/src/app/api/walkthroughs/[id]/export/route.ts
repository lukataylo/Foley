import "server-only";
import crypto from "crypto";
import { spawn } from "child_process";
import { mkdir, readFile, stat, writeFile } from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { NextRequest, NextResponse } from "next/server";
import {
  migrateOverlay,
  type EditOverlay,
  type MusicClip,
  type TransitionClip,
  type TypedClip,
} from "@/lib/timeline";
import { publicPath } from "@/lib/fs";
import { isValidTakeId, isValidWalkthroughId } from "@/lib/ids";
import { publicAssetPath } from "@/lib/path-security";
import type { TransitionSpec } from "@/lib/transitions";
import { migrateTransition } from "@/lib/transitions";
import { renderTransition, renderTyped } from "@/lib/remotion-render";

export const dynamic = "force-dynamic";
export const maxDuration = 600; // ffmpeg + Remotion can take a while

const REPO_ROOT = path.resolve(process.cwd(), "../..");

type ExportFormat = "mp4" | "webm" | "gif" | "mp3";
const VALID_FORMATS: readonly ExportFormat[] = ["mp4", "webm", "gif", "mp3"];

interface Body {
  take_id?: string; // defaults to "master"
  format?: ExportFormat; // defaults to "mp4"
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

interface PreparedTransition {
  clip: TransitionClip;
  spec: TransitionSpec;
  videoPath: string;
}

interface PreparedTyped {
  clip: TypedClip;
  videoPath: string;
}

/** Render every typed clip on the timeline to its own MP4. Cached by clip
 *  content hash, so re-exports of the same timeline reuse bytes. */
async function prepareTypeds(opts: {
  overlay: EditOverlay;
  cacheDir: string;
  repoRoot: string;
}): Promise<PreparedTyped[]> {
  const typedClips = opts.overlay.clips.filter(
    (c): c is TypedClip => c.kind === "typed",
  );
  if (typedClips.length === 0) return [];

  const out: PreparedTyped[] = [];
  for (const clip of typedClips) {
    const { outPath } = await renderTyped({
      clip,
      durationMs: clip.duration_ms,
      repoRoot: opts.repoRoot,
      cacheDir: opts.cacheDir,
    });
    out.push({ clip, videoPath: outPath });
  }
  return out;
}

/** Render every transition clip on the timeline to its own MP4. Skips clips
 *  whose spec is missing (e.g. user deleted the spec but kept the clip) and
 *  surfaces a clear error if a screenshot path can't be resolved. */
async function prepareTransitions(opts: {
  walkthroughId: string;
  overlay: EditOverlay;
  transitions: TransitionSpec[];
  cacheDir: string;
}): Promise<PreparedTransition[]> {
  const transitionClips = opts.overlay.clips.filter(
    (c): c is TransitionClip => c.kind === "transition",
  );
  if (transitionClips.length === 0) return [];

  const specsById = new Map(opts.transitions.map((t) => [t.id, t]));
  const out: PreparedTransition[] = [];
  for (const clip of transitionClips) {
    const spec = specsById.get(clip.transition_id);
    if (!spec) continue; // orphaned clip — silently skip rather than fail export

    // Resolve every screenshot path to a file:// URL so headless Chrome can
    // load it without needing the Next dev server to be reachable.
    const framesByStepId: Record<string, string> = {};
    for (const s of spec.screenshots) {
      const localUrl = publicPath(opts.walkthroughId, "steps", `${s.step_id}.png`);
      const absPath = publicAssetPath(REPO_ROOT, localUrl);
      if (!absPath) continue;
      framesByStepId[s.step_id] = pathToFileURL(absPath).toString();
    }

    const { outPath } = await renderTransition({
      spec,
      framesByStepId,
      durationMs: clip.duration_ms,
      repoRoot: REPO_ROOT,
      cacheDir: opts.cacheDir,
    });
    out.push({ clip, spec, videoPath: outPath });
  }
  return out;
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
): Promise<NextResponse> {
  const body = (await req.json().catch(() => ({}))) as Body;
  const takeId = body.take_id ?? "master";
  const format: ExportFormat = body.format && VALID_FORMATS.includes(body.format) ? body.format : "mp4";
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

  // Load overlay so we can mix in any music clips and render any transition
  // clips. If no overlay on disk, the export equals the master.
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

  // Load transition specs from the take. Older takes don't have this file —
  // that's fine, just means no title cards to splice. We probe two
  // locations: the correct per-walkthrough path, and the legacy /v1/ path
  // that the takes/[id]/transitions PUT route still writes to. Either is a
  // valid source until that route is fixed.
  const transitionsPathPrimary = path.join(takeDir, "transitions.json");
  const transitionsPathLegacy = path.join(
    REPO_ROOT, "walkthroughs", "v1", "takes", takeId, "transitions.json",
  );
  let transitions: TransitionSpec[] = [];
  for (const p of [transitionsPathPrimary, transitionsPathLegacy]) {
    try {
      const raw = await readFile(p, "utf8");
      const parsed = JSON.parse(raw) as { transitions?: unknown[] };
      if (Array.isArray(parsed.transitions) && parsed.transitions.length > 0) {
        transitions = parsed.transitions.map((t) => migrateTransition(t as TransitionSpec));
        break;
      }
    } catch {
      /* try next */
    }
  }

  const exportsDir = path.join(REPO_ROOT, "walkthroughs", params.id, "exports");
  await mkdir(exportsDir, { recursive: true });
  const transitionCacheDir = path.join(exportsDir, "transition-cache");

  // Render every transition clip + typed clip up front. We do this before
  // computing the hash so that the hash includes the resolved video bytes —
  // a spec edit that changes the rendered MP4 should bust the cache too.
  // Audio-only exports skip the Remotion render entirely.
  let prepared: PreparedTransition[] = [];
  let preparedTypeds: PreparedTyped[] = [];
  if (overlay && format !== "mp3") {
    try {
      prepared = await prepareTransitions({
        walkthroughId: params.id,
        overlay,
        transitions,
        cacheDir: transitionCacheDir,
      });
    } catch (e) {
      return NextResponse.json(
        { error: `transition render failed: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 },
      );
    }
    try {
      preparedTypeds = await prepareTypeds({
        overlay,
        cacheDir: transitionCacheDir,
        repoRoot: REPO_ROOT,
      });
    } catch (e) {
      return NextResponse.json(
        { error: `typed-overlay render failed: ${e instanceof Error ? e.message : String(e)}` },
        { status: 500 },
      );
    }
  }

  // Hash on inputs so identical exports short-circuit. Including the
  // transition cache file basenames is enough — they're already content-
  // hashed by renderTransition().
  const hashInput = JSON.stringify({
    takeId,
    format,
    music: musicClips.map((c) => ({
      url: c.asset_url, start: c.start_ms, dur: c.duration_ms, vol: c.volume,
      fi: c.fade_in_ms, fo: c.fade_out_ms,
    })),
    transitions: prepared.map((t) => ({
      file: path.basename(t.videoPath), start: t.clip.start_ms, dur: t.clip.duration_ms,
    })),
    typeds: preparedTypeds.map((t) => ({
      file: path.basename(t.videoPath), start: t.clip.start_ms, dur: t.clip.duration_ms,
    })),
  });
  const hash = crypto.createHash("sha256").update(hashInput).digest("hex").slice(0, 12);
  const outPath = path.join(exportsDir, `${takeId}-${hash}.${format}`);
  const publicUrl = publicPath(params.id, "exports", `${takeId}-${hash}.${format}`);

  try {
    const s = await stat(outPath);
    return NextResponse.json({
      ok: true, url: publicUrl, bytes: s.size, cached: true, format,
      music_tracks: musicClips.length,
      transitions: prepared.length,
      typeds: preparedTypeds.length,
    });
  } catch { /* not cached, render */ }

  // Fast path: no music, no transitions, no typed overlays, mp4 → copy
  // master byte-for-byte. For other formats we still have to transcode below.
  if (format === "mp4" && musicClips.length === 0 && prepared.length === 0 && preparedTypeds.length === 0) {
    const buf = await readFile(masterPath);
    await writeFile(outPath, buf);
    return NextResponse.json({
      ok: true, url: publicUrl, bytes: buf.length, music_tracks: 0, transitions: 0, typeds: 0, format,
    });
  }

  // Build ffmpeg args. Inputs: master + each music asset + each transition.
  // Filter complex below assembles the final video and audio streams.
  const inputs: string[] = ["-i", masterPath];
  for (const m of musicClips) {
    const localPath = publicAssetPath(REPO_ROOT, m.asset_url);
    if (!localPath) {
      return NextResponse.json({ error: "invalid_music_asset" }, { status: 400 });
    }
    inputs.push("-i", localPath);
  }
  const transitionInputStart = 1 + musicClips.length;
  for (const t of prepared) {
    inputs.push("-i", t.videoPath);
  }
  const typedInputStart = transitionInputStart + prepared.length;
  for (const t of preparedTypeds) {
    inputs.push("-i", t.videoPath);
  }

  const filterParts: string[] = [];

  // ── Video chain ────────────────────────────────────────────────────────
  // Transitions and typed clips are layered onto the master video. Each
  // input is scaled to master dimensions, then overlaid for its clip's
  // time range. Transitions cover the full frame; typed clips also fill
  // the frame today (the bg color travels in the rendered MP4) — alpha
  // would let us key out a "transparent" bg, but h264 doesn't carry it.
  let videoOutLabel = "0:v";
  const hasOverlay = prepared.length > 0 || preparedTypeds.length > 0;
  if (hasOverlay) {
    // Scale + sanitize each overlay input.
    prepared.forEach((_t, i) => {
      const inputIdx = transitionInputStart + i;
      filterParts.push(
        `[${inputIdx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
          `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS` +
          `[t${i}]`,
      );
    });
    preparedTypeds.forEach((_t, i) => {
      const inputIdx = typedInputStart + i;
      filterParts.push(
        `[${inputIdx}:v]scale=1920:1080:force_original_aspect_ratio=decrease,` +
          `pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,setpts=PTS-STARTPTS` +
          `[ty${i}]`,
      );
    });

    // Compose overlays onto the master in timeline order. We layer
    // transitions first (full-screen takeovers usually live alone on
    // their own row) and typed clips on top of them, since the
    // editor's row 0 = front rule means typed clips above row 0
    // transitions render on top.
    const overlayOps: Array<{ label: string; startS: string; endS: string }> = [];
    prepared.forEach((t, i) => {
      overlayOps.push({
        label: `t${i}`,
        startS: (t.clip.start_ms / 1000).toFixed(3),
        endS: ((t.clip.start_ms + t.clip.duration_ms) / 1000).toFixed(3),
      });
    });
    preparedTypeds.forEach((t, i) => {
      overlayOps.push({
        label: `ty${i}`,
        startS: (t.clip.start_ms / 1000).toFixed(3),
        endS: ((t.clip.start_ms + t.clip.duration_ms) / 1000).toFixed(3),
      });
    });

    let runningLabel = "0:v";
    overlayOps.forEach((op, i) => {
      const nextLabel = i === overlayOps.length - 1 ? "vout" : `vmix${i}`;
      filterParts.push(
        `[${runningLabel}][${op.label}]overlay=enable='between(t,${op.startS},${op.endS})':` +
          `shortest=0:eof_action=pass[${nextLabel}]`,
      );
      runningLabel = nextLabel;
    });
    videoOutLabel = "vout";
  }

  // ── Audio chain ────────────────────────────────────────────────────────
  // [0:a] master narration → label "narr"
  // [k:a] music tracks (k = 1..N_music) → adelay/volume → labels "m1"…
  // amix all → "aout"
  // Skipped entirely for GIF (no audio container) — saves the music-mix work.
  let audioOutLabel = "narr";
  if (format !== "gif") {
    filterParts.push(`[0:a]volume=1.0[narr]`);
    const mixLabels = ["narr"];
    musicClips.forEach((c, i) => {
      const idx = i + 1;
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
    if (mixLabels.length > 1) {
      const inputsForMix = mixLabels.map((l) => `[${l}]`).join("");
      filterParts.push(
        `${inputsForMix}amix=inputs=${mixLabels.length}:duration=first:dropout_transition=0,` +
          `volume=1.5[aout]`,
      );
      audioOutLabel = "aout";
    }
  }

  // ── Format-specific encoder + map args ────────────────────────────────
  // mp3 has no video stream; gif has no audio. mp4/webm have both. Each
  // path picks its own codecs but reuses the same filter graph.
  let formatArgs: string[];
  if (format === "mp3") {
    formatArgs = [
      "-map", `[${audioOutLabel}]`,
      "-c:a", "libmp3lame",
      "-b:a", "192k",
      "-ar", "44100",
      "-shortest",
    ];
  } else if (format === "gif") {
    // GIF is a separate filter chain because palette generation is needed
    // for tolerable colors. We compose: scaled video → palettegen → paletteuse.
    // Audio is dropped (GIF spec doesn't carry it).
    filterParts.push(
      `[${videoOutLabel}]fps=12,scale=720:-2:flags=lanczos,split[gif1][gif2];` +
        `[gif1]palettegen=stats_mode=diff[pal];[gif2][pal]paletteuse=dither=bayer[gifout]`,
    );
    formatArgs = [
      "-map", "[gifout]",
      "-loop", "0",
    ];
  } else if (format === "webm") {
    formatArgs = [
      "-map", `[${videoOutLabel}]`,
      "-map", `[${audioOutLabel}]`,
      "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "32", "-row-mt", "1",
      "-c:a", "libopus", "-b:a", "128k",
      "-shortest",
    ];
  } else {
    // mp4 (default)
    const videoCodecArgs = hasOverlay
      ? ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p"]
      : ["-c:v", "copy"];
    formatArgs = [
      "-map", `[${videoOutLabel}]`,
      "-map", `[${audioOutLabel}]`,
      ...videoCodecArgs,
      "-c:a", "aac",
      "-b:a", "192k",
      "-ar", "44100",
      "-movflags", "+faststart",
      "-shortest",
    ];
  }

  try {
    await runFfmpeg([
      ...inputs,
      "-filter_complex", filterParts.join(";"),
      ...formatArgs,
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
    format,
    music_tracks: musicClips.length,
    transitions: prepared.length,
    typeds: preparedTypeds.length,
  });
}
