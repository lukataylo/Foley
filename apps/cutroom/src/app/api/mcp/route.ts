// MCP-style manifest. Not a full Model Context Protocol stdio server —
// that lives in services/director or runs locally — but a lightweight
// HTTP description that an MCP client (Claude Code, Cursor, Windsurf)
// can discover what walkthroughs are available, their canonical URIs,
// and the read-only tools Foley exposes.
//
// Spec reference (loosely): https://modelcontextprotocol.io/

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

  const resources = summaries.flatMap((s) => [
    {
      uri: `${base}/docs/${s.id}.md`,
      name: `${s.display_name} — transcript`,
      description: `Step-by-step Markdown transcript of the ${s.display_name} walkthrough (${s.step_count} steps, ~${s.total_duration_s.toFixed(0)}s).`,
      mimeType: "text/markdown",
    },
    {
      uri: `${base}/api/walkthroughs/${s.id}/transcript`,
      name: `${s.display_name} — transcript JSON`,
      description: `Per-step timing + title + narration for ${s.display_name}.`,
      mimeType: "application/json",
    },
    {
      uri: `${base}/api/walkthroughs/${s.id}/captions`,
      name: `${s.display_name} — WebVTT captions`,
      description: `Cue-aligned subtitles for the master video.`,
      mimeType: "text/vtt",
    },
    {
      uri: `${base}/walkthroughs/${s.id}/takes/master/master.mp4`,
      name: `${s.display_name} — master video`,
      description: `Concatenated walkthrough video.`,
      mimeType: "video/mp4",
    },
  ]);

  const tools = [
    {
      name: "ask_walkthrough",
      description:
        "Ask a natural-language question about a specific walkthrough. " +
        "Returns Claude's answer plus the step ids it drew from.",
      inputSchema: {
        type: "object",
        properties: {
          walkthrough_id: { type: "string", description: "id of the walkthrough" },
          question: { type: "string", description: "free-form user question" },
        },
        required: ["walkthrough_id", "question"],
      },
      // Hint: clients can POST to this URL with the inputSchema body.
      endpoint: `${base}/api/walkthroughs/{walkthrough_id}/ask`,
      method: "POST",
    },
  ];

  return NextResponse.json(
    {
      protocolVersion: "2024-11-05",
      serverInfo: {
        name: "foley",
        version: "0.1.0",
        description:
          "Read-only HTTP MCP-style manifest for Foley — an auto-maintained walkthrough-video pipeline. Resources are the per-walkthrough markdown transcripts, captions, and videos. The single tool wraps the `Ask this walkthrough` endpoint.",
        documentation: `${base}/skill.md`,
      },
      capabilities: {
        resources: { listChanged: false },
        tools: { listChanged: false },
      },
      resources,
      tools,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=120, stale-while-revalidate=600",
      },
    },
  );
}
