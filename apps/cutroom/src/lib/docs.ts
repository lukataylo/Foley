// Documentation pages for a project. A walkthrough_id contains many docs of
// varying kinds. Stored at walkthroughs/<id>/docs.json. If absent, the loader
// synthesizes a single "tour" doc from walkthrough.yaml.

import "server-only";
import { readFile } from "fs/promises";
import path from "path";
import { listTakes, loadWalkthrough } from "./fs";

const REPO_ROOT = path.resolve(process.cwd(), "../..");

export type DocKind = "text" | "steps" | "video";

export interface DocPageBase {
  id: string;
  title: string;
  kind: DocKind;
  summary: string;
  updated_at: string;       // ISO
  group?: string;           // optional grouping in the sidebar tree
}

export interface VideoDoc extends DocPageBase {
  kind: "video";
  video_take_id: string;    // which take is canonical
  duration_s: number;
  step_count: number;
}

export interface StepsDoc extends DocPageBase {
  kind: "steps";
  steps: { caption: string; image_url: string }[];
}

export interface TextDoc extends DocPageBase {
  kind: "text";
  body?: string;             // markdown
  word_count: number;
}

export type DocPage = VideoDoc | StepsDoc | TextDoc;

interface DocsFile {
  docs: DocPage[];
}

export async function loadDocs(walkthroughId: string): Promise<DocPage[]> {
  const file = path.join(REPO_ROOT, "walkthroughs", walkthroughId, "docs.json");
  try {
    const raw = await readFile(file, "utf8");
    const parsed = JSON.parse(raw) as DocsFile;
    return parsed.docs ?? [];
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    return synthesizeFromWalkthrough(walkthroughId);
  }
}

/** Backwards compat: when there's no docs.json yet, expose the existing
 *  walkthrough.yaml as a single "tour" video doc so the page never goes
 *  empty after a fresh checkout. */
async function synthesizeFromWalkthrough(walkthroughId: string): Promise<DocPage[]> {
  try {
    const wt = await loadWalkthrough(walkthroughId);
    const takes = await listTakes(walkthroughId);
    const master = takes.find((t) => t.id === "master") ?? takes[0];
    const totalMs = wt.steps.reduce((n, s) => n + s.duration_ms, 0);
    const tour: VideoDoc = {
      id: "tour",
      title: `Tour of ${wt.target_app.repo.split("/")[1] ?? wt.id}`,
      kind: "video",
      summary: `A ${Math.round(totalMs / 1000)}-second tour, narrated by ${wt.brand.voice_name}.`,
      duration_s: totalMs / 1000,
      step_count: wt.steps.length,
      video_take_id: master?.id ?? "master",
      updated_at: master?.created_at ?? new Date().toISOString(),
    };
    return [tour];
  } catch {
    return [];
  }
}

export function groupBy<T, K extends string>(items: T[], key: (t: T) => K): Record<K, T[]> {
  const out = {} as Record<K, T[]>;
  for (const it of items) {
    const k = key(it);
    if (!out[k]) out[k] = [];
    out[k].push(it);
  }
  return out;
}
