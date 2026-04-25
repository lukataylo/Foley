// Server-only filesystem helpers. The cutroom is a thin reader over the
// directory the director writes to. State of record is on disk.

import "server-only";
import { readFile, readdir, stat, writeFile } from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import type { Take, Walkthrough } from "./types";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

interface SegmentEntry {
  step_id: string;
  fingerprint: string;
  segment_path: string;
  segment_sha256: string;
  duration_ms: number;
}

export interface Manifest {
  walkthrough_id: string;
  take_id: string;
  master_path: string;
  master_sha256: string;
  segments: SegmentEntry[];
}

export async function listWalkthroughIds(): Promise<string[]> {
  const entries = await readdir(WALKTHROUGHS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

export interface WalkthroughSummary {
  id: string;
  display_name: string;
  step_count: number;
  take_count: number;
  voice_name: string;
  last_activity: string | null; // ISO from latest take
  total_duration_s: number;     // from canonical step durations
}

const TITLECASE: Record<string, string> = {
  v1: "Loop",
};

export async function listWalkthroughSummaries(): Promise<WalkthroughSummary[]> {
  const ids = await listWalkthroughIds();
  const out: WalkthroughSummary[] = [];
  for (const id of ids) {
    try {
      const wt = await loadWalkthrough(id);
      const takes = await listTakes(id);
      const last_activity = takes.length
        ? [...takes].map((t) => t.created_at).sort().reverse()[0]
        : null;
      out.push({
        id,
        display_name: wt.display_name ?? TITLECASE[id] ?? id.replace(/[-_]/g, " "),
        step_count: wt.steps.length,
        take_count: takes.length,
        voice_name: wt.brand.voice_name,
        last_activity,
        total_duration_s: wt.steps.reduce((n, s) => n + s.duration_ms / 1000, 0),
      });
    } catch {
      /* skip broken walkthroughs */
    }
  }
  return out;
}

export async function loadWalkthrough(id: string): Promise<Walkthrough> {
  const dir = path.join(WALKTHROUGHS_DIR, id);
  const wtRaw = yaml.load(await readFile(path.join(dir, "walkthrough.yaml"), "utf8")) as Record<string, unknown>;
  const brandRef = (wtRaw.brand_ref as string | undefined) ?? "brand.yaml";
  const brand = yaml.load(await readFile(path.join(dir, brandRef), "utf8")) as Walkthrough["brand"];
  delete wtRaw.brand_ref;
  return { ...(wtRaw as Omit<Walkthrough, "id" | "brand">), id, brand } as Walkthrough;
}

export async function listTakes(walkthroughId: string): Promise<Take[]> {
  const takesDir = path.join(WALKTHROUGHS_DIR, walkthroughId, "takes");
  let entries;
  try {
    entries = await readdir(takesDir, { withFileTypes: true });
  } catch {
    return [];
  }
  const takes: Take[] = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    try {
      const t = await loadTake(walkthroughId, e.name);
      takes.push(t);
    } catch {
      // ignore broken takes
    }
  }
  // master first, then by created_at desc.
  takes.sort((a, b) => {
    if (a.id === "master") return -1;
    if (b.id === "master") return 1;
    return b.created_at.localeCompare(a.created_at);
  });
  return takes;
}

export async function loadTake(walkthroughId: string, takeId: string): Promise<Take> {
  const file = path.join(WALKTHROUGHS_DIR, walkthroughId, "takes", takeId, "take.json");
  const raw = JSON.parse(await readFile(file, "utf8"));
  return raw as Take;
}

export async function loadManifest(walkthroughId: string, takeId: string): Promise<Manifest> {
  const file = path.join(WALKTHROUGHS_DIR, walkthroughId, "takes", takeId, "manifest.json");
  const raw = JSON.parse(await readFile(file, "utf8"));
  return raw as Manifest;
}

export async function setTakeStatus(
  walkthroughId: string,
  takeId: string,
  status: Take["status"],
): Promise<Take> {
  const file = path.join(WALKTHROUGHS_DIR, walkthroughId, "takes", takeId, "take.json");
  const take = JSON.parse(await readFile(file, "utf8")) as Take;
  take.status = status;
  await writeFile(file, JSON.stringify(take, null, 2));
  return take;
}

export interface StepWaveform {
  duration_s: number;
  sample_rate: number;
  peaks: number[];
}

export async function loadStepWaveform(
  walkthroughId: string,
  stepId: string,
): Promise<StepWaveform | null> {
  const file = path.join(
    WALKTHROUGHS_DIR,
    walkthroughId,
    "steps",
    `${stepId}.waveform.json`,
  );
  try {
    const raw = await readFile(file, "utf8");
    return JSON.parse(raw) as StepWaveform;
  } catch {
    return null;
  }
}

// Public path under /walkthroughs/... served by Next from public/walkthroughs.
export function publicPath(walkthroughId: string, ...rest: string[]): string {
  return "/" + path.posix.join("walkthroughs", walkthroughId, ...rest);
}

export function takePublicPath(walkthroughId: string, takeId: string, file: string): string {
  return publicPath(walkthroughId, "takes", takeId, file);
}

export function stepFramePath(walkthroughId: string, stepId: string): string {
  return publicPath(walkthroughId, "steps", `${stepId}.png`);
}
