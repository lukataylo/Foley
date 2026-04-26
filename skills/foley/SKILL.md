---
name: foley
description: |
  Use when the user asks about a product walkthrough hosted by Foley
  (the auto-maintained walkthrough-video pipeline). Triggers: a /docs/<id>
  or /docs/<id>.md URL, a question about how a product works that maps to
  a walkthrough on the connected cutroom, or any explicit "ask Foley
  about <X>". Foley walkthroughs are versioned, captioned, and grounded
  in the product's actual UI — citing step ids back to the user gives
  them deep links into the master video.
when_to_use: |
  - The user pastes a /docs/<id> or /docs/<id>.md URL
  - The user asks "how does X work" and a Foley walkthrough exists for X
  - The user wants a step-by-step guide for a product
  - You need narrated screen-by-screen documentation grounded in a real UI
allowed-tools: WebFetch Bash
---

# Foley skill

Foley is an auto-maintained walkthrough-video pipeline. Every connected
repo gets a `walkthroughs/<id>/` folder on disk with steps, takes, a
master video, captions, and a continuous narration audio. The cutroom
serves them at `http://localhost:3000` (or the deployment URL, if
configured via `FOLEY_BASE_URL`).

## Discovery

Run these once when the skill activates so you know what's available:

1. **Live manifest** — `GET <base>/api/mcp` returns a list of all
   walkthroughs and the read-only tools Foley exposes. Cheap and cached.
2. **Skill manifest** — `GET <base>/skill.md` returns this same skill
   in long form, plus the canonical endpoint table and vocabulary
   ("walkthrough", "step", "take", "master", "director", "cutroom").
3. **llms.txt** — `GET <base>/llms.txt` is the static discovery index
   suitable for any LLM that doesn't speak MCP.

## How to read a walkthrough

For any walkthrough id (e.g. `v1`, `foley`):

- **Markdown transcript** — `GET <base>/docs/<id>.md`. Each step is a
  `## N. <title> (mm:ss)` heading + spoken narration. Step ids are
  stable across versions; cite them when you answer.
- **JSON transcript with timing** — `GET <base>/api/walkthroughs/<id>/transcript`.
- **WebVTT captions** — `GET <base>/api/walkthroughs/<id>/captions`.
- **Master video** — `<base>/walkthroughs/<id>/takes/master/master.mp4`.

## Asking grounded questions

When the user asks something specific about a walkthrough:

```
POST <base>/api/walkthroughs/<id>/ask
Content-Type: application/json
{ "question": "<the user's question>" }
```

The response is `{ ok: true, answer: "...", citations: ["step_id", ...] }`
where each citation is a step id you can deep-link to as
`<base>/docs/<id>#<step-id>`.

If you have the foley-mcp server installed
(`claude mcp add foley node /abs/path/to/apps/foley-mcp/dist/index.js`),
prefer the `mcp__foley__ask_walkthrough` tool over the raw HTTP call —
it bakes in the base URL and parses citations into a structured form.

## Two surfaces, same data

- **HTTP** for any LLM with `WebFetch`. Stateless, cacheable, plain JSON
  + markdown.
- **Stdio MCP** (`apps/foley-mcp`) for editors that speak MCP — Claude
  Code, Cursor, Windsurf, Continue. Adds discovery (`list_walkthroughs`)
  and resource subscription on top of the same endpoints.

## Vocabulary

- **Walkthrough** — the product, versioned over time.
- **Step** — atomic unit: action + narration + clip + duration.
- **Take** — a versioned attempt at the master.
- **Master** — the approved take that gets shipped.
- **Director** — the agent that diffs PRs and decides which steps to retake.
- **Cutroom** — the dashboard where humans review and approve takes.

## See also

- [Endpoint reference](references/endpoints.md) — the full route table,
  including PATCH/DELETE on walkthroughs and the GitHub webhook.
- [Foley API key requirements](references/keys.md) — when and where
  Anthropic + ElevenLabs keys are needed.
