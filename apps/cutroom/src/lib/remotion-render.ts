import "server-only";

// Server-side helper that turns a TransitionSpec into an MP4 file. The
// export route calls this once per transition clip on the timeline; ffmpeg
// then overlays the resulting MP4s onto the master at their start positions.
//
// Bundling Remotion is expensive (~10-30s on first run) so we memoize the
// bundle path per Node process. Subsequent renders during the same process
// reuse it; the only cost on a warm path is the headless-Chrome render.
//
// We also content-hash the inputs and reuse cached MP4s on disk — most
// re-exports of the same walkthrough don't change the transitions.

import crypto from "crypto";
import { mkdir, stat, access } from "fs/promises";
import path from "path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { TransitionSpec } from "./transitions";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;

let bundleCache: Promise<string> | null = null;

function getBundle(repoRoot: string): Promise<string> {
  if (!bundleCache) {
    const entry = path.join(repoRoot, "apps", "cutroom", "src", "remotion", "Root.tsx");
    bundleCache = bundle({ entryPoint: entry })
      .catch((e) => {
        // Drop the cache on failure so the next request can retry. Without
        // this a single boot-time error would poison every subsequent export.
        bundleCache = null;
        throw e;
      });
  }
  return bundleCache;
}

export interface RenderTransitionOpts {
  spec: TransitionSpec;
  /** step_id → absolute file URL (file:// or http://) the renderer can load. */
  framesByStepId: Record<string, string>;
  /** Output duration in ms — usually the transition clip's duration_ms on
   *  the timeline (which can differ from spec.duration_ms when the user
   *  resized the clip). */
  durationMs: number;
  /** Repo root, used to locate the Remotion entry. Pass `process.cwd() + "/../.."`
   *  from the cutroom Next route — the helper itself is path-agnostic. */
  repoRoot: string;
  /** Where rendered MP4s should be written + read from. Cached by content hash. */
  cacheDir: string;
}

export interface RenderTransitionResult {
  /** Absolute path to the rendered MP4. */
  outPath: string;
  /** True when the cache hit and we skipped renderMedia. */
  cached: boolean;
}

/** Render a single transition spec to MP4. Returns the absolute output path.
 *  Cached by sha256 of (spec + framesByStepId + duration). */
export async function renderTransition(
  opts: RenderTransitionOpts,
): Promise<RenderTransitionResult> {
  const durationFrames = Math.max(1, Math.round((opts.durationMs / 1000) * FPS));

  // Hash on the inputs that affect output bytes — the spec, the resolved
  // image URLs, and the duration. The renderer is otherwise deterministic.
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify({
      spec: opts.spec,
      frames: opts.framesByStepId,
      durationFrames,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
    }))
    .digest("hex")
    .slice(0, 16);
  const outPath = path.join(opts.cacheDir, `transition-${hash}.mp4`);

  await mkdir(opts.cacheDir, { recursive: true });
  try {
    await access(outPath);
    const s = await stat(outPath);
    if (s.size > 0) return { outPath, cached: true };
  } catch { /* miss */ }

  const serveUrl = await getBundle(opts.repoRoot);
  const inputProps = {
    spec: opts.spec,
    framesByStepId: opts.framesByStepId,
  };
  const composition = await selectComposition({
    serveUrl,
    id: "transition",
    inputProps,
  });
  await renderMedia({
    serveUrl,
    composition: {
      ...composition,
      durationInFrames: durationFrames,
      fps: FPS,
      width: WIDTH,
      height: HEIGHT,
    },
    codec: "h264",
    outputLocation: outPath,
    inputProps,
    // No audio — we lay these on top of the master's audio in ffmpeg.
    muted: true,
  });
  return { outPath, cached: false };
}
