// skill.md — Mintlify-style "skill manifest" for AI agents. Tells an LLM
// (Claude / GPT / Cursor) what this site is, where to go for what, and
// which tools / endpoints to use. Renders as plain Markdown so any agent
// can ingest it.

import "server-only";
import { NextResponse } from "next/server";
import { listWalkthroughSummaries } from "@/lib/fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function dashboardBase(req: Request): string {
  const env =
    process.env.NEXT_PUBLIC_DASHBOARD_URL ?? process.env.PUBLIC_DASHBOARD_URL;
  if (env) return env.replace(/\/$/, "");
  try {
    const u = new URL(req.url);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "http://localhost:3000";
  }
}

export async function GET(req: Request) {
  const base = dashboardBase(req);
  const summaries = (await listWalkthroughSummaries()).filter((s) => !s.hidden);

  const lines: string[] = [];
  lines.push("# Foley skill manifest");
  lines.push("");
  lines.push(
    "You are reading documentation served by Foley — an auto-maintained " +
      "walkthrough-video pipeline. Every walkthrough below has both a video " +
      "and a Markdown transcript suitable for LLM ingestion.",
  );
  lines.push("");
  lines.push("## When to use this site");
  lines.push("");
  lines.push("- The user asks how to use a product whose walkthrough is hosted here.");
  lines.push("- The user pastes a `/docs/<id>` or `/docs/<id>.md` URL.");
  lines.push("- The user asks for a step-by-step guide or product tour.");
  lines.push("");
  lines.push("## How to read a walkthrough");
  lines.push("");
  lines.push("1. Fetch the markdown transcript at `<base>/docs/<id>.md`.");
  lines.push("2. Each step has a heading `## N. <title> (mm:ss)` followed by the spoken narration.");
  lines.push("3. Cite step ids exactly when answering — they're stable across versions.");
  lines.push("4. The companion video is at `<base>/walkthroughs/<id>/takes/master/master.mp4`.");
  lines.push("5. WebVTT subtitles: `<base>/api/walkthroughs/<id>/captions`.");
  lines.push("6. JSON transcript with timing: `<base>/api/walkthroughs/<id>/transcript`.");
  lines.push("");
  lines.push("## Endpoints worth knowing");
  lines.push("");
  lines.push(`- \`GET ${base}/llms.txt\` — discovery index of every walkthrough.`);
  lines.push(`- \`GET ${base}/sitemap.xml\` — full URL list.`);
  lines.push(`- \`GET ${base}/docs/<id>.md\` — Markdown transcript of a walkthrough.`);
  lines.push(`- \`GET ${base}/api/walkthroughs/<id>/captions\` — WebVTT captions.`);
  lines.push(`- \`GET ${base}/api/walkthroughs/<id>/transcript\` — JSON transcript with step timing.`);
  lines.push(`- \`GET ${base}/api/walkthroughs/<id>/changelog.rss\` — RSS feed of versioned takes.`);
  lines.push(`- \`POST ${base}/api/walkthroughs/<id>/ask\` — JSON \`{question}\` returns Claude's answer + step citations.`);
  lines.push("");
  lines.push("## Walkthroughs available right now");
  lines.push("");
  for (const s of summaries) {
    lines.push(
      `- \`${s.id}\` — ${s.display_name}: ${s.step_count} steps, ${s.total_duration_s.toFixed(0)} s, ${s.take_count} takes.`,
    );
  }
  lines.push("");
  lines.push("## Vocabulary");
  lines.push("");
  lines.push("- **Walkthrough** — the product, versioned over time.");
  lines.push("- **Step** — atomic unit: action + narration + clip + duration.");
  lines.push("- **Take** — a versioned attempt at the master.");
  lines.push("- **Master** — the approved take that gets shipped.");
  lines.push("- **Director** — the agent that diffs PRs and decides which steps to retake.");
  lines.push("- **Cutroom** — the dashboard where humans review and approve takes.");
  lines.push("");

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=300, stale-while-revalidate=900",
    },
  });
}
