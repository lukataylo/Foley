// Translate a `director` CLI process error into a structured Next.js
// response. Routes that shell out to `uv run director ...` use this so the
// UI gets a friendly message ("Anthropic API key not set") instead of a raw
// Python stack trace.

import { NextResponse } from "next/server";

const KEY_LABELS: Record<string, string> = {
  ANTHROPIC_API_KEY: "Anthropic API key",
  ELEVENLABS_API_KEY: "ElevenLabs API key",
  GITHUB_TOKEN: "GitHub token",
  ELEVENLABS_VOICE_ID: "ElevenLabs voice id",
  GITHUB_WEBHOOK_SECRET: "GitHub webhook secret",
};

function friendlyKeyName(key: string): string {
  return KEY_LABELS[key] ?? key;
}

export interface DirectorErrorPayload {
  ok: false;
  error: string;
  /** Trimmed stderr tail for debugging — never empty if we got any output. */
  detail: string;
  /** Friendly one-liner safe to show in a toast / banner. */
  message: string;
  /** Set when the failure was a missing-API-key precondition. */
  missing_keys?: string[];
}

/**
 * Map a child-process error from `execFile`/`execFileP` into a NextResponse.
 *
 * Codes returned:
 * - **412 Precondition Failed** — director raised `MISSING_API_KEY: <names>`.
 *   The UI should prompt the user to fill in `.env` and restart.
 * - **422 Unprocessable Entity** — director raised `WALKTHROUGH_LOAD_ERROR:`.
 *   The walkthrough.yaml on disk is malformed; UI surfaces the hint inline.
 * - **500 Internal Server Error** — anything else.
 */
export function directorErrorResponse(
  err: unknown,
  errorCode: string,
): NextResponse<DirectorErrorPayload> {
  const e = err as { stderr?: Buffer | string; message?: string };
  const stderr =
    typeof e.stderr === "string" ? e.stderr : e.stderr?.toString() ?? "";
  const detail = (stderr || e.message || "unknown").slice(-3000);

  // Look for `MISSING_API_KEY: KEY1, KEY2` anywhere in the stderr tail.
  const missingMatch = detail.match(/MISSING_API_KEY:\s*([A-Z0-9_,\s]+?)(?:\.|\n|$)/);
  if (missingMatch) {
    const keys = missingMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    const labels = keys.map(friendlyKeyName).join(" + ");
    return NextResponse.json(
      {
        ok: false as const,
        error: "missing_api_key",
        detail,
        message: `${labels} not set. Open .env at the repo root, paste the value(s), then restart the dev server.`,
        missing_keys: keys,
      },
      { status: 412 },
    );
  }

  // Walkthrough YAML schema error.
  const yamlMatch = detail.match(/WALKTHROUGH_LOAD_ERROR:\s*(.+?)(?:\n|$)/);
  if (yamlMatch) {
    return NextResponse.json(
      {
        ok: false as const,
        error: "walkthrough_yaml_invalid",
        detail,
        message: yamlMatch[1].trim(),
      },
      { status: 422 },
    );
  }

  return NextResponse.json(
    {
      ok: false as const,
      error: errorCode,
      detail,
      message:
        e.message?.split("\n")[0]?.slice(0, 300) ??
        "Director command failed — check the server logs.",
    },
    { status: 500 },
  );
}
