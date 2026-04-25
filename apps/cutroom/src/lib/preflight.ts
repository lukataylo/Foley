// Boot-time system checks. Surfaced via /api/preflight + a banner on the
// home page. Lets a judge see "ffmpeg not on PATH — see README quickstart"
// at a glance instead of discovering the issue mid-render.

import "server-only";
import { execFile } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const execFileP = promisify(execFile);

const REPO_ROOT = path.resolve(process.cwd(), "../..");

export interface PreflightCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  /** What to do about it — surfaced as the banner's actionable text. */
  hint?: string;
}

async function which(cmd: string): Promise<string | null> {
  try {
    const { stdout } = await execFileP("which", [cmd]);
    return stdout.trim() || null;
  } catch {
    return null;
  }
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function runPreflight(): Promise<PreflightCheck[]> {
  const ffmpegPath = await which("ffmpeg");
  const uvPath = await which("uv");

  const venv = path.join(REPO_ROOT, "services", "director", ".venv");
  const venvExists = await pathExists(venv);

  // Playwright caches Chromium under ~/Library/Caches/ms-playwright (mac)
  // or ~/.cache/ms-playwright (linux). Just look for either.
  const home = os.homedir();
  const playwrightDirs = [
    path.join(home, "Library", "Caches", "ms-playwright"),
    path.join(home, ".cache", "ms-playwright"),
  ];
  let playwrightFound = false;
  for (const d of playwrightDirs) {
    if (await pathExists(d)) {
      try {
        const entries = await fs.readdir(d);
        if (entries.some((name) => name.startsWith("chromium"))) {
          playwrightFound = true;
          break;
        }
      } catch {
        // ignore
      }
    }
  }

  const envFile = path.join(REPO_ROOT, ".env");
  const envExists = await pathExists(envFile);

  return [
    {
      id: "ffmpeg",
      label: "ffmpeg",
      ok: !!ffmpegPath,
      detail: ffmpegPath ?? "not on PATH",
      hint: ffmpegPath ? undefined : "Install with `brew install ffmpeg` (macOS) or your distro's package manager.",
    },
    {
      id: "uv",
      label: "uv (Python)",
      ok: !!uvPath,
      detail: uvPath ?? "not on PATH",
      hint: uvPath ? undefined : "Install: `curl -LsSf https://astral.sh/uv/install.sh | sh`",
    },
    {
      id: "director_venv",
      label: "Director venv",
      ok: venvExists,
      detail: venvExists ? venv : `${venv} (missing)`,
      hint: venvExists ? undefined : "Run `pnpm bootstrap` from the repo root.",
    },
    {
      id: "playwright_chromium",
      label: "Playwright Chromium",
      ok: playwrightFound,
      detail: playwrightFound ? "found" : "not installed",
      hint: playwrightFound
        ? undefined
        : "Run `uv --directory services/director run playwright install chromium` (or `pnpm bootstrap`).",
    },
    {
      id: "env_file",
      label: ".env",
      ok: envExists,
      detail: envExists ? envFile : "missing — `pnpm bootstrap` will create one from .env.example",
      hint: envExists ? undefined : "Run `pnpm bootstrap`, then paste your API keys into `.env`.",
    },
  ];
}
