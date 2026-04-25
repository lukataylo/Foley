import "server-only";
import { spawn } from "child_process";
import crypto from "crypto";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const SECRET = process.env.GITHUB_WEBHOOK_SECRET ?? "";
const REPO_ROOT = path.resolve(process.cwd(), "../..");

function verify(body: string, header: string | null): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = crypto.createHmac("sha256", SECRET).update(body).digest("hex");
  const provided = header.slice("sha256=".length);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(provided, "hex"));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  // Refuse to act when no shared secret is configured. The previous "no
  // secret = accept all" behaviour was a foot-gun: a judge who pointed a
  // GitHub webhook at this endpoint without setting GITHUB_WEBHOOK_SECRET
  // in .env would silently let any POST trigger a director review job
  // (and burn API credits). Better to fail loud.
  if (!SECRET) {
    return NextResponse.json(
      {
        ok: false,
        error: "webhook_not_configured",
        message:
          "GITHUB_WEBHOOK_SECRET is not set in .env. Generate a random string, paste it both into .env and into the GitHub webhook config, then restart the dev server.",
      },
      { status: 503 },
    );
  }

  const body = await req.text();
  if (!verify(body, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ ok: false, error: "bad signature" }, { status: 401 });
  }

  const event = req.headers.get("x-github-event") ?? "unknown";
  if (event === "ping") return NextResponse.json({ ok: true, pong: true });
  if (event !== "pull_request") return NextResponse.json({ ok: true, ignored: event });

  const payload = JSON.parse(body);
  const action: string = payload.action;
  const number: number | undefined = payload.pull_request?.number;
  if (!number || !["opened", "synchronize", "reopened"].includes(action)) {
    return NextResponse.json({ ok: true, ignored_action: action });
  }

  // Spawn the director review job, detached. We return immediately so GitHub
  // doesn't time out; the cutroom polls for new takes.
  const child = spawn(
    "uv",
    ["--directory", "services/director", "run", "director", "review", String(number)],
    {
      cwd: REPO_ROOT,
      detached: true,
      stdio: "ignore",
      env: { ...process.env },
    },
  );
  child.unref();

  return NextResponse.json({ ok: true, enqueued: { action, pr: number } });
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "webhook/github",
    secret_configured: !!SECRET,
  });
}
