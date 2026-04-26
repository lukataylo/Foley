#!/usr/bin/env node
// Foley MCP server (stdio).
//
// Wraps the cutroom's HTTP surface so MCP-aware clients (Claude Code,
// Cursor, Windsurf, Continue) can list walkthroughs, fetch transcripts,
// and ask grounded questions without knowing the URL shape.
//
// Configure via env:
//   FOLEY_BASE_URL  default http://localhost:3000
//
// Install in Claude Code:
//   claude mcp add foley node /absolute/path/to/apps/foley-mcp/dist/index.js
//
// Tools:
//   list_walkthroughs               — { walkthroughs: [{id, display_name, ...}] }
//   ask_walkthrough(id, question)   — RAG-style answer + step citations
//   get_transcript(id)              — markdown transcript with step timestamps
//
// Resources are listed dynamically from the cutroom's /api/mcp manifest;
// each walkthrough exposes a transcript-md, captions-vtt, video-mp4, and
// transcript-json URI.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const BASE_URL = (process.env.FOLEY_BASE_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);

interface WalkthroughSummary {
  id: string;
  display_name: string;
  step_count: number;
  take_count: number;
  voice_name: string;
  total_duration_s: number;
  hidden: boolean;
}

interface AskResponse {
  ok: boolean;
  answer?: string;
  citations?: string[];
  message?: string;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new McpError(
      ErrorCode.InternalError,
      `${path} → HTTP ${res.status}: ${text.slice(0, 300)}`,
    );
  }
  return (await res.json()) as T;
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) {
    throw new McpError(
      ErrorCode.InternalError,
      `${path} → HTTP ${res.status}`,
    );
  }
  return res.text();
}

async function listWalkthroughs(): Promise<WalkthroughSummary[]> {
  const j = await fetchJson<{ ok: boolean; walkthroughs: WalkthroughSummary[] }>(
    "/api/walkthroughs",
  );
  return (j.walkthroughs ?? []).filter((w) => !w.hidden);
}

const server = new Server(
  { name: "foley", version: "0.1.0" },
  { capabilities: { resources: {}, tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_walkthroughs",
      description:
        "List every Foley walkthrough available on the connected cutroom — id, display name, step count, total duration. Use this to discover what's available before calling ask_walkthrough or get_transcript.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
    },
    {
      name: "ask_walkthrough",
      description:
        "Ask a natural-language question about a specific walkthrough. Returns Claude's grounded answer plus the step ids it drew from. Cite those step ids when relaying the answer to the user.",
      inputSchema: {
        type: "object",
        properties: {
          walkthrough_id: {
            type: "string",
            description: "id of the walkthrough (from list_walkthroughs)",
          },
          question: {
            type: "string",
            description: "free-form question",
          },
        },
        required: ["walkthrough_id", "question"],
        additionalProperties: false,
      },
    },
    {
      name: "get_transcript",
      description:
        "Fetch the full markdown transcript of a walkthrough. Each step is a `## N. <title> (mm:ss)` heading followed by the spoken narration. Step ids are stable across versions — cite them.",
      inputSchema: {
        type: "object",
        properties: {
          walkthrough_id: {
            type: "string",
            description: "id of the walkthrough",
          },
        },
        required: ["walkthrough_id"],
        additionalProperties: false,
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  if (name === "list_walkthroughs") {
    const summaries = await listWalkthroughs();
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ walkthroughs: summaries }, null, 2),
        },
      ],
    };
  }

  if (name === "ask_walkthrough") {
    const id = (args?.walkthrough_id as string | undefined)?.trim();
    const question = (args?.question as string | undefined)?.trim();
    if (!id || !question) {
      throw new McpError(
        ErrorCode.InvalidParams,
        "walkthrough_id and question are required",
      );
    }
    const j = await fetchJson<AskResponse>(
      `/api/walkthroughs/${encodeURIComponent(id)}/ask`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      },
    );
    if (!j.ok) {
      throw new McpError(
        ErrorCode.InternalError,
        j.message ?? "ask endpoint returned !ok",
      );
    }
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            { answer: j.answer ?? "", citations: j.citations ?? [] },
            null,
            2,
          ),
        },
      ],
    };
  }

  if (name === "get_transcript") {
    const id = (args?.walkthrough_id as string | undefined)?.trim();
    if (!id) {
      throw new McpError(ErrorCode.InvalidParams, "walkthrough_id is required");
    }
    const text = await fetchText(`/docs/${encodeURIComponent(id)}.md`);
    return { content: [{ type: "text", text }] };
  }

  throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
});

server.setRequestHandler(ListResourcesRequestSchema, async () => {
  const summaries = await listWalkthroughs();
  const resources = summaries.flatMap((s) => [
    {
      uri: `foley://${s.id}/transcript.md`,
      name: `${s.display_name} — transcript (markdown)`,
      description: `Step-by-step transcript of the ${s.display_name} walkthrough (${s.step_count} steps, ~${Math.round(s.total_duration_s)}s).`,
      mimeType: "text/markdown",
    },
    {
      uri: `foley://${s.id}/captions.vtt`,
      name: `${s.display_name} — captions (WebVTT)`,
      description: `Cue-aligned subtitles for ${s.display_name}.`,
      mimeType: "text/vtt",
    },
    {
      uri: `foley://${s.id}/transcript.json`,
      name: `${s.display_name} — transcript (JSON)`,
      description: `Per-step timing + title + narration for ${s.display_name}.`,
      mimeType: "application/json",
    },
  ]);
  return { resources };
});

server.setRequestHandler(ReadResourceRequestSchema, async (req) => {
  const uri = req.params.uri;
  const m = uri.match(/^foley:\/\/([a-z0-9_-]+)\/(transcript\.md|captions\.vtt|transcript\.json)$/);
  if (!m) {
    throw new McpError(ErrorCode.InvalidParams, `Unknown resource URI: ${uri}`);
  }
  const [, id, kind] = m;
  let path: string;
  let mimeType: string;
  if (kind === "transcript.md") {
    path = `/docs/${encodeURIComponent(id)}.md`;
    mimeType = "text/markdown";
  } else if (kind === "captions.vtt") {
    path = `/api/walkthroughs/${encodeURIComponent(id)}/captions`;
    mimeType = "text/vtt";
  } else {
    path = `/api/walkthroughs/${encodeURIComponent(id)}/transcript`;
    mimeType = "application/json";
  }
  const text = await fetchText(path);
  return { contents: [{ uri, mimeType, text }] };
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stderr is fine to log to — stdout is reserved for the MCP framing.
  process.stderr.write(
    `[foley-mcp] connected · base=${BASE_URL}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`[foley-mcp] fatal: ${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
