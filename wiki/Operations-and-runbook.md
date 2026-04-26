# Operations & runbook

How to run Foley in earnest, and how to recover when things go wrong.

## Boot

```bash
pnpm bootstrap     # one-shot dependency install + .env creation
pnpm dev           # cutroom on :3000
```

`pnpm bootstrap` runs `scripts/bootstrap.sh`, which:

1. Verifies `pnpm`, `uv`, `ffmpeg` are on PATH (fails loudly with install hints if not).
2. `pnpm install` at the repo root.
3. `uv --directory services/director sync`.
4. `uv --directory services/director run playwright install chromium`.
5. Copies `.env.example` → `.env` if absent.

Visit <http://localhost:3000>. The home shows a yellow banner from `/api/preflight` if any of those checks goes red.

## API keys

Required for the demo flow:

- `ANTHROPIC_API_KEY` — used by proposer, agent, ask. Friendly HTTP 412 if unset.
- `ELEVENLABS_API_KEY` — used by narrator, continuous narration, voice cloning. Friendly HTTP 412 if unset.

Optional:

- `ELEVENLABS_VOICE_ID` — default voice when `brand.yaml:voice_id` isn't set. Default = Charlotte.
- `GITHUB_TOKEN` — for `director review` (`gh pr diff/view/comment`). Without this, `gh` falls back to its own auth.
- `GITHUB_PAT` — used by `/api/github/repos` to fetch real repos in the onboard wizard. Without it, mock examples appear.
- `GITHUB_WEBHOOK_SECRET` — required for `/api/webhook/github` to accept POSTs. Empty value → HTTP 503.
- `LOGFIRE_TOKEN` — Logfire telemetry. Disabled by default if unset.
- `PUBLIC_DASHBOARD_URL` — absolute URL Foley uses when generating PR comment / oEmbed / OG meta links. Defaults to `http://localhost:3000`.

## Files Foley writes (every one is atomic)

Every state-bearing file goes through `atomic_io.py` (Python) or `atomic-io.ts` (TS). Mid-process kills can never leave a partial JSON for the next reader. Covered:

| File | Writer |
|---|---|
| `walkthroughs/<id>/walkthrough.yaml` | `bootstrap`, `proposer`, `walkthrough-mutate`, `import` |
| `walkthroughs/<id>/brand.yaml` | `bootstrap`, `brand` PUT, `voice` POST, `import` |
| `walkthroughs/<id>/watching.json` | `bootstrap` |
| `walkthroughs/<id>/narration.{mp3,timing.json,waveform.json}` | `synth-continuous` |
| `walkthroughs/<id>/captions.vtt` | `captions` (CLI or lazy via `/api/.../captions`) |
| `walkthroughs/<id>/steps/<sid>.{narration.mp3,waveform.json,meta.json}` | `narrator`, `waveform`, `playwright_runner` |
| `walkthroughs/<id>/takes/<tid>/{master.mp4,manifest.json,take.json,segments/}` | `concat.assemble_master`, `bake_master` |
| `walkthroughs/<id>/.render-status.json` | `/api/walkthroughs/[id]/render` |

Files explicitly NOT atomic (binary blobs, pure replace-on-write):

- `walkthroughs/<id>/steps/<sid>.{mp4,png}` — produced by ffmpeg into a tempdir, then `shutil.move`d.
- `walkthroughs/<id>/{poster.jpg,preview.gif}` — ffmpeg writes directly; if it fails the cache is just stale.
- `walkthroughs/<id>/.feedback.jsonl` — append-only, gitignored.

## Re-baking the demo (Loop)

```bash
PYTHONPATH=services/director/src \
  uv --directory services/director run director ingest v1
PYTHONPATH=services/director/src \
  uv --directory services/director run director master v1
PYTHONPATH=services/director/src \
  uv --directory services/director run director synth-continuous v1
PYTHONPATH=services/director/src \
  uv --directory services/director run director captions v1
```

Or, the all-at-once via the API:

```bash
curl -s -X POST http://localhost:3000/api/walkthroughs/v1/render -H "Content-Type: application/json" -d '{}'
curl -s http://localhost:3000/api/walkthroughs/v1/render   # poll until status:"completed"
curl -s -X POST http://localhost:3000/api/walkthroughs/v1/narration/regenerate
```

Note: the API render route reconciles status against `master.mp4` mtime; an existing master can flip the poll to "completed" before the new run actually finishes. Wait for the detached `director` process to exit (`pgrep -f 'director ingest'`) before treating the rebake as done.

## Recovering a busted walkthrough

| Symptom | Fix |
|---|---|
| Bad walkthrough.yaml; editor banner says "Unknown field …" | Open the file, remove the offending key, reload. |
| Step thumbnail has a red dot | Click **Retake** on the step in `/walkthroughs/<id>/edit`. |
| All steps are missing clips | `director ingest <id>` from the CLI; or **Render video** in the editor. |
| Master.mp4 doesn't reflect new steps | `director master <id>` — concat-only path, fast. |
| Captions are stale | `director captions <id>`. |
| Voice sounds wrong on existing clips | `director synth-continuous <id>` regenerates the continuous take only — per-step mp3s are unchanged unless you also run `director retake`. |
| llms.txt missing a walkthrough | Check `walkthrough.yaml`'s `hidden:` field. |

## Production-ready? (No.)

This is a hackathon project. Not in scope:

- No auth, no per-user isolation, no rate limits.
- No DB; backups are `tar walkthroughs/` or git-LFS.
- No CDN — every asset is served by Next.js itself.
- No queue — every render is a detached child process. Concurrent renders on the same walkthrough are rejected, but two walkthroughs can render simultaneously.
- No observability beyond Logfire spans — no error tracker, no alerting.

If you adopt Foley for real, start there.
