// llms.txt — AI-discovery index. Lists every walkthrough on the dashboard
// with its title, summary, and a pointer at the per-walkthrough markdown
// export. Tools that respect the llms.txt spec (Anthropic, OpenAI tooling,
// MCP clients) follow the .md links to ingest content cleanly.
//
// Spec reference: https://llmstxt.org/

import "server-only";
import { NextResponse } from "next/server";
import { listWalkthroughSummaries, loadWalkthrough } from "@/lib/fs";

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
  lines.push("# Foley");
  lines.push("");
  lines.push(
    "> Auto-maintained product walkthrough videos from pull requests. " +
      "Each walkthrough below has a markdown transcript at the linked URL — " +
      "drop it into Claude/ChatGPT to ask questions about the product.",
  );
  lines.push("");
  lines.push("## Walkthroughs");
  lines.push("");

  for (const s of summaries) {
    let summary = "";
    try {
      const wt = await loadWalkthrough(s.id);
      const product = wt.target_app.repo.split("/")[1] ?? s.id;
      summary = `${s.step_count} steps · ${s.total_duration_s.toFixed(0)} s · narrated by ${wt.brand.voice_name} · source ${wt.target_app.repo}`;
      lines.push(`- [${product} — ${s.display_name}](${base}/docs/${s.id}.md): ${summary}`);
    } catch {
      lines.push(`- [${s.display_name}](${base}/docs/${s.id}.md): ${s.step_count} steps`);
    }
  }

  lines.push("");
  lines.push("## Optional");
  lines.push("");
  lines.push(`- [Source repository](https://github.com/lukataylo/Foley)`);
  lines.push(`- [Dashboard](${base}/)`);
  lines.push("");

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
    },
  });
}
