# Quickstart for developers

Beyond [the judge quickstart](Quickstart-for-judges), here's what to look at first if you're trying to extend Foley.

## Layout

```
apps/cutroom/                       Next.js 14 — dashboard, onboard wizard, step editor, public docs, all APIs
services/director/                  Python — agent, proposer, ask, capture, narrate, concat, captions, check
walkthroughs/v1/                    Canonical "Loop" demo
walkthroughs/foley/                 Foley demoing Foley (rendered by the same pipeline)
extensions/recorder/                Chrome extension — click-record alternate import path
scripts/bootstrap.sh                One-shot setup
.claude/skills/foley/               Claude Code skill that wraps `director review`
wiki/                               This wiki, mirrored into the GitHub Wiki
```

## State of record

There is no database. Every Walkthrough is the contents of `walkthroughs/<id>/`.

- `walkthrough.yaml` — the canonical step list.
- `brand.yaml` — voice + palette + custom CSS.
- `steps/<step_id>.{mp4,png,narration.mp3,waveform.json,meta.json}` — per-step artefacts produced by `director ingest`.
- `narration.{mp3,timing.json,waveform.json}` — continuous narration take (one ElevenLabs request) used by the smooth-playback path.
- `captions.vtt` — derived from `narration.timing.json`.
- `takes/<take-id>/{master.mp4,manifest.json,take.json,segments/}` — versioned outputs.
- `poster.jpg`, `preview.gif` — lazily built ffmpeg artefacts cached to disk.
- `.feedback.jsonl` — per-page thumbs; gitignored.

## How a walkthrough becomes a video

```
walkthrough.yaml
   │
   ▼  director ingest
steps/<id>.mp4   ←—  Playwright chromium  per step
steps/<id>.narration.mp3   ←— ElevenLabs  per step
   │
   ▼  director synth-continuous (optional, for smooth playback)
narration.mp3 + narration.timing.json + narration.waveform.json
   │
   ▼  director master
takes/master/master.mp4  +  manifest.json  +  segments/<id>.mp4 (byte-identical reuse)
   │
   ▼  director captions
captions.vtt
   │
   ▼  /api/walkthroughs/<id>/{poster,preview.gif} (lazy, cached)
poster.jpg, preview.gif
```

## Type contract

Two parallel definitions of the schema. They MUST stay in sync:

- Pydantic — `services/director/src/director/models.py`
- TypeScript — `apps/cutroom/src/lib/types.ts`

A drift between these is the bug we paid for twice this session (e.g. `target_app.default_branch` getting written into YAML and then crashing Pydantic's `extra="forbid"` on read). When adding a field, update both.

## Adding a new step kind

Walkthroughs are linear lists of `Step` records driving Playwright. Adding a new ActionKind (e.g. `record_audio`) requires:

1. `models.py:ActionKind` enum.
2. `models.py:Action.@model_validator` shape check.
3. `playwright_runner.py:_do` switch arm.
4. `proposer.py` — adjust the system prompt's "Action shapes" section if the proposer should emit it.
5. `apps/cutroom/src/lib/timeline.ts` — TS mirror of the kind for the editor.

## Adding a new public surface

The home grid, sitemap.xml, llms.txt, and skill.md all loop over `listWalkthroughSummaries()` (in `apps/cutroom/src/lib/fs.ts`). Filter on `summary.hidden` so your new surface respects the existing privacy primitive.

## Hot loops

- `pnpm dev` — Next.js dev server with instant reload.
- `pnpm typecheck` (under `apps/cutroom`) — `tsc --noEmit`. Should always be green before committing.
- `PYTHONPATH=services/director/src uv --directory services/director run python -c "import director.<module>"` — quick Python import smoke.
- `bash scripts/test/all.sh` — comprehensive test suite (see [Testing](Testing)).

## Where the recent work lives

The bulk of recent commits are tagged on the `overnight/2026-04-26` branch. See git log between the last `continuous-narration` commit and the `overnight/` tip.
