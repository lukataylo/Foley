// Cheap key validation. Hits the smallest live endpoint each provider
// exposes and returns ok / not — so the user sees "✓ valid" inline before
// committing keys to .env. Prevents the "paste a typo, find out 30s later
// when render fails" pattern.

import "server-only";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TestBody {
  ANTHROPIC_API_KEY?: string;
  ELEVENLABS_API_KEY?: string;
  GITHUB_TOKEN?: string;
}

interface KeyResult {
  ok: boolean;
  error?: string;
  meta?: Record<string, string>;
}

async function testAnthropic(key: string): Promise<KeyResult> {
  if (!key) return { ok: false, error: "empty key" };
  if (!key.startsWith("sk-ant-")) {
    return { ok: false, error: "expected key to start with sk-ant-" };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200) return { ok: true };
    if (res.status === 401) return { ok: false, error: "invalid key (401)" };
    if (res.status === 403) return { ok: false, error: "key valid but no access (403)" };
    if (res.status === 429) return { ok: true, error: "rate-limited but key works" };
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

async function testElevenLabs(key: string): Promise<KeyResult> {
  if (!key) return { ok: false, error: "empty key" };
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200) {
      const json = (await res.json().catch(() => ({}))) as {
        subscription?: { tier?: string };
      };
      const meta: Record<string, string> = {};
      if (json.subscription?.tier) meta.tier = json.subscription.tier;
      return { ok: true, meta };
    }
    if (res.status === 401) return { ok: false, error: "invalid key (401)" };
    const txt = await res.text().catch(() => "");
    return { ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 200)}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

async function testGithub(key: string): Promise<KeyResult> {
  if (!key) return { ok: false, error: "empty key" };
  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${key}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 200) {
      const json = (await res.json().catch(() => ({}))) as { login?: string };
      return { ok: true, meta: json.login ? { login: json.login } : {} };
    }
    if (res.status === 401) return { ok: false, error: "invalid token (401)" };
    return { ok: false, error: `HTTP ${res.status}` };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "network error" };
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as TestBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }
  const results: Record<string, KeyResult> = {};
  const tasks: Promise<void>[] = [];
  if (typeof body.ANTHROPIC_API_KEY === "string") {
    tasks.push(
      testAnthropic(body.ANTHROPIC_API_KEY).then((r) => {
        results.ANTHROPIC_API_KEY = r;
      }),
    );
  }
  if (typeof body.ELEVENLABS_API_KEY === "string") {
    tasks.push(
      testElevenLabs(body.ELEVENLABS_API_KEY).then((r) => {
        results.ELEVENLABS_API_KEY = r;
      }),
    );
  }
  if (typeof body.GITHUB_TOKEN === "string" && body.GITHUB_TOKEN) {
    tasks.push(
      testGithub(body.GITHUB_TOKEN).then((r) => {
        results.GITHUB_TOKEN = r;
      }),
    );
  }
  await Promise.all(tasks);
  const allOk =
    Object.keys(results).length > 0 &&
    Object.values(results).every((r) => r.ok);
  return NextResponse.json({ ok: allOk, results });
}
