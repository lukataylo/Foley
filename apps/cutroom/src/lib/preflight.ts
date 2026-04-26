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

/** Read a single key from .env. Exported so other server-side routes
 *  (e.g. the render preflight) can do the same check without depending
 *  on dotenv being loaded into process.env. */
export async function readEnvKey(envPath: string, key: string): Promise<string> {
  try {
    const text = await fs.readFile(envPath, "utf8");
    const re = new RegExp(`^${key}\\s*=\\s*(.*)$`, "m");
    const m = text.match(re);
    if (!m) return "";
    let v = m[1].trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    return v;
  } catch {
    return "";
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

  // Look inside .env for the two keys Foley actually needs at runtime.
  // We don't validate them against the live API here — that's `/api/keys/test`'s
  // job — but we do flag a configured-vs-blank state so the home banner
  // can route the user to /welcome#keys instead of asking them to read
  // the README.
  const anthropicKey = envExists
    ? await readEnvKey(envFile, "ANTHROPIC_API_KEY")
    : "";
  const elevenKey = envExists
    ? await readEnvKey(envFile, "ELEVENLABS_API_KEY")
    : "";

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
      detail: envExists ? envFile : "missing — the welcome page can create one for you",
      hint: envExists
        ? undefined
        : "Open /welcome and paste your API keys; we'll bootstrap .env for you.",
    },
    {
      id: "anthropic_api_key",
      label: "Anthropic API key",
      ok: !!anthropicKey,
      detail: anthropicKey ? "set" : "blank in .env",
      hint: anthropicKey
        ? undefined
        : "Open /welcome#keys to paste it. We'll validate before saving.",
    },
    {
      id: "elevenlabs_api_key",
      label: "ElevenLabs API key",
      ok: !!elevenKey,
      detail: elevenKey ? "set" : "blank in .env",
      hint: elevenKey
        ? undefined
        : "Open /welcome#keys to paste it. We'll validate before saving.",
    },
  ];
}
