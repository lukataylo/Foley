# Architecture

Foley is two services connected by a shared filesystem. There's no DB, no message queue, and no auth. State of record is everything under `walkthroughs/<id>/`.

## Boxes

```
                        ┌────────────────────────────┐
                        │       GitHub PR webhook    │
                        └──────────────┬─────────────┘
                                       │
   ┌───────────────────────────────────┴───────────────────────────────────┐
   │                            apps/cutroom (Next.js 14)                  │
   │                                                                       │
   │   PUBLIC SURFACES                                                     │
   │     /                  Folder grid of every non-hidden walkthrough    │
   │     /welcome           Landing                                        │
   │     /onboard           Auto-onboarding wizard (proposer + bootstrap)  │
   │     /docs/<id>         Public scrollable doc, OG/Twitter/oEmbed       │
   │     /docs/<id>.md      Markdown export (rewrite → /api/docs/<id>)     │
   │     /walkthroughs/<id> Project page (master, brand, dailies, takes)   │
   │     /walkthroughs/<id>/edit  Step editor                              │
   │     /takes/<id>        Cutroom timeline editor                        │
   │     /takes/<id>/compare/<other>  Side-by-side diff                    │
   │                                                                       │
   │   AI SURFACES                                                         │
   │     /llms.txt          AI discovery (per llmstxt.org spec)            │
   │     /skill.md          AI skill manifest (Mintlify-parity)            │
   │     /api/mcp           HTTP MCP-style manifest                        │
   │                                                                       │
   │   SEO SURFACES                                                        │
   │     /sitemap.xml       Auto-generated                                 │
   │     /robots.txt        Disallows /api, /onboard, /takes               │
   │                                                                       │
   │   APIS                                                                │
   │     /api/onboard/{bootstrap,propose-steps}                            │
   │     /api/walkthroughs/<id>/{render,master,steps,steps/<sid>/retake,   │
   │                              steps/reorder,brand,brand/voice,         │
   │                              narration/regenerate,captions,           │
   │                              transcript,poster,preview.gif,           │
   │                              changelog.rss,feedback,ask}              │
   │     /api/docs/<id>     Markdown export                                │
   │     /api/oembed        oEmbed responder                               │
   │     /api/preflight     Boot checks                                    │
   │     /api/webhook/github  PR-driven director review trigger            │
   │     /api/publish/static  Single-file HTML export                      │
   │                                                                       │
   └─────────────────────────┬─────────────────────────────────────────────┘
                             │  shells out via `uv --directory services/director run director …`
                             ▼
   ┌───────────────────────────────────────────────────────────────────────┐
   │                       services/director (Python · uv)                 │
   │                                                                       │
   │   COMMANDS                                                            │
   │     ingest              Capture + narrate every step                  │
   │     master              Concat segments → master.mp4                  │
   │     synth-continuous    One ElevenLabs request → continuous take      │
   │     captions            narration.timing.json → captions.vtt          │
   │     propose-steps       Claude drafts steps from a dev URL            │
   │     review <PR>         Diff PR → retake affected → assemble + comment│
   │     retake <step>       Re-run a single step                          │
   │     ask <id> --question Claude RAG over the walkthrough's narration   │
   │     check <id>          Validator + link checker + a11y triage        │
   │     bake-master         Add intro/outro PNG bookends with fades       │
   │     diff-takes <a> <b>  Per-segment SHA comparison                    │
   │                                                                       │
   │   MODULES                                                             │
   │     models.py           Pydantic schema (Walkthrough, Step, Take, …)  │
   │     walkthrough_loader  Friendly errors for malformed YAML            │
   │     atomic_io           write_*_atomic — no partial writes ever       │
   │     proposer            First-cut step drafter (Claude Sonnet 4.6)    │
   │     agent               PR-diff reasoning (Claude Sonnet 4.6 + tool)  │
   │     ask                 Per-walkthrough Q&A (Claude Sonnet 4.6 + tool)│
   │     playwright_runner   Per-step capture, per-action retry/timeout    │
   │     narrator            ElevenLabs synth, hash-cached                 │
   │     continuous_narration  ElevenLabs synth-with-timestamps            │
   │     concat              ffmpeg concat-demuxer, byte-identical reuse   │
   │     captions            narration.timing → WebVTT                     │
   │     checker             Schema + links + a11y + artifacts             │
   │     github              gh CLI wrapper (PR diff, view, comment)       │
   │     bake_master         Intro/outro bookend renderer                  │
   │                                                                       │
   └───────────────────────────────────────────────────────────────────────┘
```

## Why no DB?

The deliverable IS the filesystem. Every take is a self-contained directory with a manifest of byte-identical segments. To deploy a new instance, you `git clone` the walkthroughs/ tree (or `git lfs`); to back up, you tar it. To roll back to a previous take, you swap the `master/` symlink.

Adding a DB would split the source of truth and make the byte-identity guarantee harder to verify. It's a non-goal for this project.

## Why two languages?

Python for the things best done from Python — Playwright, ffmpeg subprocess, Anthropic SDK, ElevenLabs SDK, Pydantic. Node/Next.js for the cutroom UI + APIs. They communicate via the filesystem and via `execFile`-spawned director CLI invocations.

## How the AI surfaces stack

There are now four AI integrations, all using Claude Sonnet 4.6:

1. **proposer** (forced tool call) — drafts the first cut of a walkthrough from a dev URL's HTML. Output schema: `ProposedSteps { summary, steps[Step] }`.
2. **agent** (forced tool call, adaptive thinking) — diffs a PR against the current walkthrough. Output: `AgentVerdict { summary, step_diffs[StepDiff] }`.
3. **ask** (forced tool call) — RAG over a walkthrough's transcript. Output: `AskAnswer { answer, citations[step_id] }`.
4. **(planned)** translator — used by `director synth-continuous --lang fr` to produce localised narration. Not yet wired.

Each is a single Pydantic model translated via `model_json_schema()` into a tool's `input_schema`, with `additionalProperties: false` for strict mode.

## Atomic writes

Every state file write goes through `atomic_io` (Python) or `atomic-io.ts` (TS): write to a sibling tempfile, fsync, `os.replace`. Mid-process kills can never leave a partial JSON for the next reader. A list of every covered file is in [Operations & runbook](Operations-and-runbook).

## Friendly errors

The director CLI's stderr uses two prefix conventions that the Next.js routes detect:

- `MISSING_API_KEY: <KEY>` → HTTP 412 with a friendly UI banner.
- `WALKTHROUGH_LOAD_ERROR: <message>` → HTTP 422 with the message inline.

Anything else is HTTP 500 with the first stderr line as `message`. The shared mapper lives at `apps/cutroom/src/lib/director-error.ts`.

## Resilience

`director ingest` continues past a failed step. The step's `meta.json` records `error` (catastrophic) or `action_warnings[]` (selector misses). `/walkthroughs/<id>/edit` reads those files and shows red dots on the step thumbnails so a user can click **Retake** to heal.
