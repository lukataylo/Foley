// Server-only helpers for mutating walkthrough.yaml in place.
// Imported walkthroughs (and v1) are edited from the cutroom UI; this module
// is the single funnel for those writes so we keep YAML round-trip predictable.

import "server-only";
import { readFile, unlink } from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { isValidStepId, isValidWalkthroughId } from "./ids";
import { writeFileAtomic } from "./atomic-io";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

function assertWalkthroughId(id: string): void {
  if (!isValidWalkthroughId(id)) throw new Error(`invalid walkthrough id: ${id}`);
}

function assertStepId(id: string): void {
  if (!isValidStepId(id)) throw new Error(`invalid step id: ${id}`);
}

export interface RawStep {
  id: string;
  title?: string;
  narration?: string;
  duration_ms?: number;
  viewport?: { width: number; height: number };
  actions?: Array<Record<string, unknown>>;
  [k: string]: unknown;
}

export interface RawWalkthrough {
  version?: number;
  display_name?: string;
  target_app?: { repo?: string; dev_url?: string };
  brand_ref?: string;
  steps: RawStep[];
  [k: string]: unknown;
}

function walkthroughPath(id: string): string {
  assertWalkthroughId(id);
  return path.join(WALKTHROUGHS_DIR, id, "walkthrough.yaml");
}

function stepScreenshotPath(id: string, stepId: string): string {
  assertWalkthroughId(id);
  assertStepId(stepId);
  return path.join(WALKTHROUGHS_DIR, id, "steps", `${stepId}.png`);
}

// Capture the leading run of `#` comment lines (plus the blank line that
// usually follows) so PATCH/DELETE round-trips don't strip the import header.
function leadingHeader(text: string): string {
  const lines = text.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("#")) {
      i++;
      continue;
    }
    if (line.trim() === "") {
      // Consume one blank line if it comes after at least one comment line —
      // that's the conventional spacer between header and YAML body.
      if (i > 0 && lines[i - 1].startsWith("#")) {
        i++;
      }
      break;
    }
    break;
  }
  return lines.slice(0, i).join("\n");
}

export async function readRaw(id: string): Promise<RawWalkthrough> {
  const text = await readFile(walkthroughPath(id), "utf8");
  const raw = (yaml.load(text) ?? {}) as RawWalkthrough;
  if (!Array.isArray(raw.steps)) raw.steps = [];
  return raw;
}

export async function writeRaw(id: string, raw: RawWalkthrough): Promise<void> {
  // Re-read the existing file just to extract its leading comment block, so
  // header preservation is stateless across server restarts and route handlers.
  let header = "";
  try {
    const existing = await readFile(walkthroughPath(id), "utf8");
    header = leadingHeader(existing);
  } catch {
    /* new file, no header to preserve */
  }
  const dumped = yaml.dump(raw, { lineWidth: 100, noRefs: true });
  const out = header
    ? header.endsWith("\n")
      ? `${header}${dumped}`
      : `${header}\n${dumped}`
    : dumped;
  await writeFileAtomic(walkthroughPath(id), out);
}

export async function deleteStepScreenshot(id: string, stepId: string): Promise<void> {
  try {
    await unlink(stepScreenshotPath(id, stepId));
  } catch {
    /* missing file is fine */
  }
}
