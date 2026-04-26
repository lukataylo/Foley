# foley-mcp

Stdio MCP server that wraps Foley's cutroom HTTP surface so MCP-aware
agents (Claude Code, Cursor, Windsurf, Continue, Zed) can list
walkthroughs, fetch transcripts, and ask grounded questions.

## What it exposes

**Tools**

- `list_walkthroughs` — every walkthrough on the connected cutroom with
  id, display name, step count, total duration, last activity.
- `ask_walkthrough(walkthrough_id, question)` — RAG-style answer with
  step-id citations. Wraps `POST /api/walkthroughs/<id>/ask`.
- `get_transcript(walkthrough_id)` — full markdown transcript with
  per-step timestamps. Wraps `GET /docs/<id>.md`.

**Resources** (one set per walkthrough)

- `foley://<id>/transcript.md` — markdown transcript
- `foley://<id>/captions.vtt` — WebVTT captions
- `foley://<id>/transcript.json` — per-step timing + narration

## Configure

The server points at `http://localhost:3000` by default. Override with
the `FOLEY_BASE_URL` environment variable (e.g. when the cutroom is
deployed somewhere stable).

## Install in Claude Code

```sh
pnpm --filter foley-mcp build
claude mcp add foley node "$(pwd)/apps/foley-mcp/dist/index.js"
```

If your cutroom is hosted somewhere besides localhost:

```sh
claude mcp add foley node "$(pwd)/apps/foley-mcp/dist/index.js" \
  --env FOLEY_BASE_URL=https://your-foley.example.com
```

Then in any Claude Code session, the `mcp__foley__list_walkthroughs`,
`mcp__foley__ask_walkthrough`, and `mcp__foley__get_transcript` tools
will be available.

## Install in Cursor / Windsurf / Continue

Each editor has its own MCP config file but the shape is the same —
`command: node`, `args: [/abs/path/to/dist/index.js]`, optional
`env: { FOLEY_BASE_URL: ... }`. See the
[MCP docs](https://modelcontextprotocol.io/quickstart/user) for the
exact path.

## Develop

```sh
pnpm --filter foley-mcp dev   # tsx, watches src/
pnpm --filter foley-mcp build # → dist/index.js
```

Quick smoke test (with cutroom running on :3000):

```sh
(echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"x","version":"0"}}}'
 sleep 0.3
 echo '{"jsonrpc":"2.0","method":"notifications/initialized"}'
 sleep 0.3
 echo '{"jsonrpc":"2.0","id":2,"method":"tools/list"}') \
| node apps/foley-mcp/dist/index.js
```

You should see the server announce itself on stderr and stream JSON-RPC
responses on stdout.
