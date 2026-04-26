// Render a captured walkthrough into master.mp4 by chaining
//   director ingest <id> [--skip-narration]
//   director master <id>
// The job runs detached; status is written to walkthroughs/<id>/.render-status.json.

import "server-only";
import { spawn } from "child_process";
import { execFile } from "child_process";
import { promisify } from "util";
import { readFile, writeFile, readdir, stat } from "fs/promises";
import path from "path";
import yaml from "js-yaml";
import { NextResponse } from "next/server";
import { z } from "zod";
import { isValidWalkthroughId } from "@/lib/ids";
import { writeJsonAtomic } from "@/lib/atomic-io";
import { readEnvKey } from "@/lib/preflight";

const execFileP = promisify(execFile);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO_ROOT = path.resolve(process.cwd(), "../..");
const WALKTHROUGHS_DIR = path.join(REPO_ROOT, "walkthroughs");

interface RenderStatus {
  status: "running" | "completed" | "failed";
  started_at: string;
  finished_at?: string;
  pid?: number;
  skip_narration: boolean;
  total_steps: number;
  step_ids: string[];
  current_phase: "ingest" | "master" | "done";
  log_path: string;
  error?: string;
}

function statusPath(id: string) {
  return path.join(WALKTHROUGHS_DIR, id, ".render-status.json");
}

function logPath(id: string) {
  return path.join(WALKTHROUGHS_DIR, id, ".render.log");
}

function masterPath(id: string) {
  return path.join(WALKTHROUGHS_DIR, id, "takes", "master", "master.mp4");
}

async function readStatus(id: string): Promise<RenderStatus | null> {
  try {
    return JSON.parse(await readFile(statusPath(id), "utf8")) as RenderStatus;
  } catch {
    return null;
  }
}

async function writeStatus(id: string, s: RenderStatus): Promise<void> {
  await writeJsonAtomic(statusPath(id), s);
}

async function countMp4Steps(id: string): Promise<number> {
  try {
    const entries = await readdir(path.join(WALKTHROUGHS_DIR, id, "steps"));
    return entries.filter((f) => f.endsWith(".mp4")).length;
  } catch {
    return 0;
  }
}

async function masterExists(id: string): Promise<boolean> {
  try {
    const s = await stat(masterPath(id));
    return s.isFile() && s.size > 0;
  } catch {
    return false;
  }
}

// True only when master.mp4 was written after `since`. Stops the running →
// completed flip from firing on the previous render's master.mp4 the moment
// a re-render starts.
async function masterFreshSince(id: string, since: string): Promise<boolean> {
  try {
    const s = await stat(masterPath(id));
    if (!s.isFile() || s.size === 0) return false;
    const startedMs = new Date(since).getTime();
    if (!Number.isFinite(startedMs)) return false;
    return s.mtime.getTime() >= startedMs;
  } catch {
    return false;
  }
}

async function loadStepIds(id: string): Promise<string[]> {
  try {
    const text = await readFile(
      path.join(WALKTHROUGHS_DIR, id, "walkthrough.yaml"),
      "utf8",
    );
    const doc = (yaml.load(text) ?? {}) as { steps?: Array<{ id?: unknown }> };
    if (!Array.isArray(doc.steps)) return [];
    return doc.steps
      .map((s) => (typeof s?.id === "string" ? s.id : null))
      .filter((s): s is string => !!s);
  } catch {
    return [];
  }
}

// Defend against PID reuse — kill(pid, 0) returns true for any live process,
// including ones that took our slot after the render exited. Read /proc-style
// process info and require the command line to look like ours.
async function isOurRenderAlive(pid: number): Promise<boolean> {
  try {
    process.kill(pid, 0);
  } catch {
    return false; // not alive at all
  }
  try {
    const { stdout } = await execFileP("ps", ["-p", String(pid), "-o", "command="]);
    const cmd = stdout.trim();
    // Spawn was `bash -lc 'uv … director ingest … && uv … director master …'`
    // — depending on which child we caught, the command line may show bash, uv,
    // or python. Match any of those when paired with our marker.
    return /director/.test(cmd) || /\buv\b/.test(cmd);
  } catch {
    // ps failed for some reason — fall back to "alive but uncertain": treat
    // as alive so we don't spuriously mark a real render as failed.
    return true;
  }
}

const PostSchema = z.object({
  skip_narration: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    /* empty body OK */
  }
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "invalid_payload" }, { status: 400 });
  }
  const skipNarration = parsed.data.skip_narration ?? false;

  // Preflight key check. The director subprocess will raise MISSING_API_KEY
  // and die anyway, but the failure shows up via log-tail polling 10–30s
  // later — a frustrating delay when the user's mistake is just an empty
  // .env. Catch it here so they see a friendly callout immediately.
  const envPath = path.join(REPO_ROOT, ".env");
  const requiredKeys: string[] = ["ANTHROPIC_API_KEY"];
  if (!skipNarration) requiredKeys.push("ELEVENLABS_API_KEY");
  const missing: string[] = [];
  for (const k of requiredKeys) {
    const v = process.env[k] ?? (await readEnvKey(envPath, k));
    if (!v) missing.push(k);
  }
  if (missing.length > 0) {
    const labels: Record<string, string> = {
      ANTHROPIC_API_KEY: "Anthropic",
      ELEVENLABS_API_KEY: "ElevenLabs",
    };
    const friendly = missing.map((k) => labels[k] ?? k).join(" + ");
    return NextResponse.json(
      {
        ok: false,
        error: "missing_api_key",
        missing_keys: missing,
        message: `${friendly} API key${missing.length > 1 ? "s" : ""} not set. Open /welcome#keys to paste ${missing.length > 1 ? "them" : "it"} — Foley validates against the live provider before saving.`,
      },
      { status: 412 },
    );
  }

  // Reject if a render is already in flight for this walkthrough.
  const existing = await readStatus(params.id);
  if (existing?.status === "running" && existing.pid && (await isOurRenderAlive(existing.pid))) {
    return NextResponse.json(
      { ok: false, error: "already_running", status: existing },
      { status: 409 },
    );
  }

  const stepIds = await loadStepIds(params.id);
  if (stepIds.length === 0) {
    return NextResponse.json(
      { ok: false, error: "walkthrough_not_found_or_empty" },
      { status: 404 },
    );
  }

  const log = logPath(params.id);
  // truncate log
  await writeFile(log, "", "utf8");

  // Compose the chained pipeline: ingest [&& master] under a single shell so we
  // only need to track one PID.
  const ingestArgs = [
    "--directory", "services/director", "run", "director",
    "ingest", params.id,
    ...(skipNarration ? ["--skip-narration"] : []),
  ];
  const masterArgs = [
    "--directory", "services/director", "run", "director",
    "master", params.id,
  ];
  const cmd = [
    `uv ${ingestArgs.map(quote).join(" ")}`,
    `uv ${masterArgs.map(quote).join(" ")}`,
  ].join(" && ");

  // PYTHONPATH belt-and-braces: if the editable install's .pth doesn't get
  // processed (a known issue with some conda-based interpreters), the import
  // still resolves via PYTHONPATH.
  const pythonPath = path.join(REPO_ROOT, "services", "director", "src");
  const child = spawn("bash", ["-lc", `${cmd} >>"${log}" 2>&1`], {
    cwd: REPO_ROOT,
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      PYTHONPATH: process.env.PYTHONPATH
        ? `${pythonPath}:${process.env.PYTHONPATH}`
        : pythonPath,
    },
  });
  child.unref();
  if (typeof child.pid !== "number") {
    return NextResponse.json({ ok: false, error: "spawn_failed" }, { status: 500 });
  }

  const status: RenderStatus = {
    status: "running",
    started_at: new Date().toISOString(),
    pid: child.pid,
    skip_narration: skipNarration,
    total_steps: stepIds.length,
    step_ids: stepIds,
    current_phase: "ingest",
    log_path: path.relative(REPO_ROOT, log),
  };
  await writeStatus(params.id, status);

  return NextResponse.json({ ok: true, status });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!isValidWalkthroughId(params.id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }
  const status = await readStatus(params.id);
  if (!status) {
    return NextResponse.json({ ok: true, status: null });
  }

  // Reconcile state: count artifacts on disk and check the spawned process.
  const completedClips = await countMp4Steps(params.id);
  const hasMaster = await masterExists(params.id);
  // The master we care about is the one written by *this* render. Otherwise
  // a re-render flips to "completed" on the very first poll because the
  // previous run's master.mp4 is still on disk.
  const hasFreshMaster = await masterFreshSince(params.id, status.started_at);
  const alive = status.pid ? await isOurRenderAlive(status.pid) : false;

  let next: RenderStatus = { ...status };
  let logTail: string | null = null;

  if (status.status === "running") {
    next.current_phase = completedClips >= status.total_steps ? "master" : "ingest";

    if (hasFreshMaster) {
      next.status = "completed";
      next.finished_at = new Date().toISOString();
      next.current_phase = "done";
      await writeStatus(params.id, next);
    } else if (!alive) {
      // Process died without producing master.mp4 — surface the tail of the log.
      logTail = await readLogTail(params.id);
      next.status = "failed";
      next.finished_at = new Date().toISOString();
      next.error = logTail?.split(/\r?\n/).slice(-12).join("\n") || "process exited";
      await writeStatus(params.id, next);
    }
  }

  return NextResponse.json({
    ok: true,
    status: next,
    completed_clips: completedClips,
    has_master: hasMaster,
    master_url: hasMaster ? `/walkthroughs/${params.id}/takes/master/master.mp4` : null,
    log_tail: logTail,
  });
}

async function readLogTail(id: string): Promise<string | null> {
  try {
    const txt = await readFile(logPath(id), "utf8");
    return txt.length > 4000 ? txt.slice(-4000) : txt;
  } catch {
    return null;
  }
}

function quote(s: string): string {
  // Shell-quote values that need it. Step ids are slug-safe; this is belt-and-braces.
  if (/^[A-Za-z0-9_./-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, "'\\''")}'`;
}
