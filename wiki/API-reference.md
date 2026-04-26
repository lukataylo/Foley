# API reference

All routes live under `apps/cutroom/src/app/api/`. Filesystem-backed; no auth.

## Walkthrough lifecycle

| Method · Path | Body | Returns |
|---|---|---|
| `POST /api/onboard/bootstrap` | `{full_name, default_branch?, description?, dev_url?}` | `{id, display_name, href}` (href is `/walkthroughs/<id>/edit`). Writes the scaffold. |
| `POST /api/onboard/propose-steps` | `{walkthrough_id, dev_url, description?}` | `{ok, log}`. Calls Claude, writes steps into `walkthrough.yaml`. ~30 s. **412** when `ANTHROPIC_API_KEY` missing; **422** when YAML invalid. |
| `POST /api/walkthroughs/[id]/render` | `{skip_narration?}` | `{ok, status}`. Detached spawn of `director ingest && director master`. Status writes to `.render-status.json`. |
| `GET /api/walkthroughs/[id]/render` | — | `{ok, status, completed_clips, has_master, master_url, log_tail?}`. Long-poll for in-flight render. |
| `POST /api/walkthroughs/[id]/master` | `{take_id}` | Promotes a take to master. |
| `POST /api/walkthroughs/[id]/steps` | `{title?, narration?, duration_ms?, step_id?}` | `{ok, step}`. Appends a default step. |
| `POST /api/walkthroughs/[id]/steps/reorder` | `{ids: string[]}` | `{ok, ids}`. Rewrites step order in YAML. |
| `POST /api/walkthroughs/[id]/steps/[stepId]/retake` | — | `{ok, log}`. Synchronous re-capture, 90 s timeout. |
| `PATCH /api/walkthroughs/[id]/steps/[stepId]` | `{title?, narration?, duration_ms?}` | Edits the step in YAML. |
| `DELETE /api/walkthroughs/[id]/steps/[stepId]` | — | Deletes the step. |
| `POST /api/walkthroughs/[id]/narration/regenerate` | — | `{ok, narration}`. Synth-continuous; ~30–40 s. |
| `PUT /api/walkthroughs/[id]/brand` | partial brand | Edits `brand.yaml`. |
| `POST /api/walkthroughs/[id]/brand/voice` | multipart `file` | `{ok, voice_id, voice_name}`. ElevenLabs IVC clone. |

## Public docs surfaces

| Method · Path | Returns |
|---|---|
| `GET /docs/[id]` | The branded docs page (HTML). |
| `GET /docs/[id].md` | Plain Markdown export (rewrite → `/api/docs/[id]`). |
| `GET /api/docs/[id]` | Same as above (the rewrite target). |
| `GET /api/walkthroughs/[id]/captions` | WebVTT subtitles (lazily generated). |
| `GET /api/walkthroughs/[id]/transcript` | JSON `{ok, source, duration_ms, cues[]}`. |
| `GET /api/walkthroughs/[id]/poster` | JPEG poster image (lazily built via ffmpeg). |
| `GET /api/walkthroughs/[id]/preview.gif` | Looping GIF preview, first 5 s. |
| `GET /api/walkthroughs/[id]/changelog.rss` | RSS 2.0 feed of takes. |

## AI surfaces

| Method · Path | Body | Returns |
|---|---|---|
| `POST /api/walkthroughs/[id]/ask` | `{question}` | `{ok, answer, citations: [step_id]}`. Claude with the transcript as context. |
| `GET /llms.txt` | — | `text/plain` discovery index per llmstxt.org. |
| `GET /skill.md` | — | Skill manifest for AI agents (Markdown). |
| `GET /api/mcp` | — | HTTP MCP-style manifest with resources + tools. |

## Sharing

| Method · Path | Returns |
|---|---|
| `GET /api/oembed?url=<docs-url>` | oEmbed JSON; supports `/docs/<id>` URLs. |
| `GET /sitemap.xml` | Auto-generated. Filters `hidden: true` walkthroughs. |
| `GET /robots.txt` | Allows public surfaces, disallows /api, /onboard, /takes. |

## Feedback & telemetry

| Method · Path | Body | Returns |
|---|---|---|
| `POST /api/walkthroughs/[id]/feedback` | `{rating: "up"\|"down", note?}` | `{ok}`. Appends a JSONL line. |
| `GET /api/walkthroughs/[id]/feedback` | — | `{ok, total, up, down, entries[20]}`. |

## System

| Method · Path | Returns |
|---|---|
| `GET /api/preflight` | `{ok, checks[], missing_count}` — ffmpeg / uv / Chromium / .env presence. |
| `GET /api/webhook/github` | `{ok, route, secret_configured}`. |
| `POST /api/webhook/github` | `{ok, enqueued}`. **503** when `GITHUB_WEBHOOK_SECRET` unset. |

## Static export

| Method · Path | Body | Returns |
|---|---|---|
| `GET /api/publish/static?id=<id>` | — | Single-file HTML with the master video base64-embedded. |

## Error mapping (Mintlify-parity)

Routes that shell to the director use a single mapper at `apps/cutroom/src/lib/director-error.ts`:

- **412 Precondition Failed** → `{error: "missing_api_key", missing_keys, message}`. Triggered by `MISSING_API_KEY:` in stderr.
- **422 Unprocessable Entity** → `{error: "walkthrough_yaml_invalid", message}`. Triggered by `WALKTHROUGH_LOAD_ERROR:`.
- **500** → `{error: <code>, message: <first stderr line>}`. Catch-all.

The cutroom UI prefers `data.message` over `data.error` when rendering, so user-visible text is consistent regardless of which director command failed.
