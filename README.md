# Foley

UM hackathon project for a PR-to-video documentation product.

On-brand product walkthrough videos that maintain themselves from PRs.

A documentation expert sets up a canonical v1 walkthrough once. From then on,
every PR triggers an agent that diffs the user-facing surface, identifies which
step atoms are affected, re-runs Playwright on only the changed steps,
re-narrates only the changed lines, and proposes a new take for human approval.

## Vocabulary

We use film vocabulary in code and UI:

- **Walkthrough** — the product, versioned over time
- **Step** — atomic unit: action, selector, narration, clip, duration
- **Take** — a versioned attempt at the master
- **Master** — the approved take that gets shipped
- **Director** — the agent that diffs PRs and decides which steps to retake
- **Cutroom** — the dashboard where humans review and approve takes
- **Dailies** — list of takes in review
- **Retake** — re-run a single step
- **Brand** — voice, palette, font, pacing rules

## Architecture

```
                       ┌────────────────────┐
                       │  GitHub PR opened  │
                       └──────────┬─────────┘
                                  │ webhook
                                  ▼
   ┌──────────────────────────────────────────────────────────┐
   │                    apps/cutroom (Next.js)                │
   │   webhook receiver  ·  cutroom UI  ·  Remotion preview   │
   └──────────┬───────────────────────────────────────────────┘
              │ enqueues RenderJob
              ▼
   ┌──────────────────────────────────────────────────────────┐
   │            services/director (Python · uv)               │
   │                                                          │
   │   github.py ──▶ agent.py (Sonnet 4.5, structured out)    │
   │                     │                                    │
   │                     ▼                                    │
   │            StepDiff[] (UNCHANGED|CHANGED|ADDED|REMOVED)  │
   │                     │                                    │
   │       ┌─────────────┼──────────────┐                     │
   │       ▼             ▼              ▼                     │
   │  playwright_runner  narrator   concat (ffmpeg)           │
   │   (clip+frame)      (mp3)       master.mp4               │
   │                                                          │
   │   Logfire spans wrap every stage.                        │
   └──────────┬───────────────────────────────────────────────┘
              │ writes
              ▼
   walkthroughs/v1/
     ├── walkthrough.yaml      # canonical steps, hand-authored
     ├── brand.yaml            # voice id, palette, font, pacing
     ├── steps/NN.{mp4,png,narration.mp3,meta.json}   # cached, hash-keyed
     └── takes/{master, take-002, ...}/
          ├── manifest.json
          ├── segments/        # symlinks or copies of step clips
          └── master.mp4
```

## Repo layout

```
apps/cutroom/         Next.js 14 dashboard + GitHub webhook + Remotion
services/director/    Python: agent, playwright runner, narrator, concat, CLI
walkthroughs/v1/      Canonical walkthrough + cached step artifacts + takes
```

## Run locally

```bash
# 1. fill in SECRETS.md, then:
cp .env.example .env
cp .env.example apps/cutroom/.env.local

# 2. install
pnpm install
uv --directory services/director sync

# 3. director CLI
pnpm director ingest                  # bake the v1 master from walkthrough.yaml
pnpm director review <PR_NUMBER>      # diff a PR, propose a new take

# 4. cutroom
pnpm cutroom                          # http://localhost:3000

# 5. webhook (separate terminal)
ngrok http 3000                       # paste forwarding URL into GitHub webhook
```

## What this is and is not

It is a hackathon proof for the "To The Americas" hackathon (Unicorn Mafia,
London, April 2026). One walkthrough, no auth, no DB. State on disk.

It is not a product yet.
