# Foley

**Product walkthrough videos that maintain themselves from PRs.**

A documentation expert sets up a canonical walkthrough once. From then on, every
pull request that touches the user-facing surface triggers an agent that diffs
the change, identifies which step atoms are affected, re-runs Playwright on
only the changed steps, re-narrates only the changed lines in the same cloned
voice, and proposes a new take for human approval.

Same brand. Same voice. Same pacing. Only the affected segments change — and
the unchanged ones are byte-identical across takes.

```
                       ┌────────────────────┐
                       │  GitHub PR opened  │
                       └──────────┬─────────┘
                                  │ webhook
                                  ▼
   ┌──────────────────────────────────────────────────────────┐
   │                    apps/cutroom (Next.js)                │
   │    review timeline · take compare · approve / send back  │
   └──────────┬───────────────────────────────────────────────┘
              │ enqueues a director job
              ▼
   ┌──────────────────────────────────────────────────────────┐
   │            services/director (Python · uv)               │
   │                                                          │
   │   github ──▶ agent (Sonnet 4.6, adaptive thinking)       │
   │                  │                                       │
   │                  ▼                                       │
   │       StepDiff[] {unchanged | changed | added | removed} │
   │                  │                                       │
   │       ┌──────────┼──────────┐                            │
   │       ▼          ▼          ▼                            │
   │   playwright  narrator    concat                         │
   │     (clip)     (mp3)      (master.mp4)                   │
   │                                                          │
   │   Logfire spans wrap every stage.                        │
   └──────────┬───────────────────────────────────────────────┘
              │ writes
              ▼
        walkthroughs/<id>/takes/<take-id>/master.mp4
```

---

## The problem

Product walkthrough videos go stale the moment they're shipped.

A button gets renamed. A screen gets added. A flow gets shortened. The video on
your homepage now shows a UI that doesn't exist. Inside three months, every
recorded demo on a fast-moving product is a lie.

Today, the maintenance loop costs:

- A scriptwriter rewriting narration to match new copy
- A screen recording session
- A voice-over session (or a paid clone re-take)
- A video editor stitching the new shots into the old timeline
- A reviewer making sure the cut still flows
- A re-publish

That's a half-day round trip per change, every time the product moves. So
teams stop maintaining the videos. The videos rot. Adoption suffers because
the most concrete artifact of how the product works — the walkthrough — is
visibly out of date.

---

## What's already in the market

| | What it does | What it doesn't do |
|---|---|---|
| **Mintlify** | Generates docs *text* from PRs | Doesn't render or maintain video |
| **Guidde** | Polishes a human-recorded walkthrough | Each maintenance cycle is a fresh recording |
| **Loom / Tella** | Records and publishes screen captures | No diff-aware updates; every change is a re-record |
| **Arcade** | Interactive product tours | Tours not video; still hand-edited per change |

Nobody maintains an autonomous, on-brand walkthrough *video* end-to-end.
That's the gap Foley closes.

---

## How Foley works

### 1 · The walkthrough is a list of step atoms

Each step has a stable id, a Playwright recipe, narration text, a captured
clip, and a duration. Authored once, in YAML, by the documentation expert who
knows the product:

```yaml
- id: mark_done
  title: Move it forward
  narration: One click marks a ticket as done. No status menus, no friction.
  duration_ms: 5500
  actions:
    - { kind: goto,  url: "/ticket/LOP-103" }
    - { kind: hover, selector: "[data-testid=mark-done-button]" }
    - { kind: click, selector: "[data-testid=mark-done-button]" }
```

### 2 · The director reads every PR

When a PR opens against the product repo, a webhook enqueues a job. The
director — Claude Sonnet 4.6 with adaptive thinking — reads the unified diff
and the current walkthrough, and returns one verdict per step:

```
intro          unchanged  No interaction with the renamed button.
sign_in        unchanged  Sign-in flow untouched.
board_overview unchanged  Board layout and copy unchanged.
open_ticket    unchanged  Ticket page entry-point unchanged.
mark_done      changed    Button label moved from 'Mark as done' to 'Ship it';
                          the clip would be misleading and narration should
                          echo the new product voice.
settings       unchanged  Settings page unaffected.
```

The verdict is structured output — typed against Pydantic models — not free
text. Every step is classified; nothing is a guess.

### 3 · Only changed steps re-run

Playwright recaptures the affected steps. ElevenLabs re-narrates only the
changed lines, in the same cloned voice. ffmpeg concat-demuxes the resulting
segments into a new master.mp4. Encode parameters are pinned, so segments for
unchanged steps are **byte-identical** across takes:

```
master vs take-007
┏━━━━━━━━━━━━━━━━┳━━━━━━━━━━━┳━━━━━━━━━━━━━━━┳━━━━━━━━━━━━━━━┓
┃ step           ┃ identical ┃ master sha    ┃ take-007 sha  ┃
┡━━━━━━━━━━━━━━━━╇━━━━━━━━━━━╇━━━━━━━━━━━━━━━╇━━━━━━━━━━━━━━━┩
│ intro          │ ✓         │ 08b5f59225bd… │ 08b5f59225bd… │
│ sign_in        │ ✓         │ 78f1b33f2f47… │ 78f1b33f2f47… │
│ board_overview │ ✓         │ 52d1fb6bd323… │ 52d1fb6bd323… │
│ open_ticket    │ ✓         │ e79534946f4c… │ e79534946f4c… │
│ mark_done      │ ✗         │ aa7160101d07… │ 32f36822e383… │
│ settings       │ ✓         │ 3228f640ee9a… │ 3228f640ee9a… │
└────────────────┴───────────┴───────────────┴───────────────┘
```

Five of six segments — five-sixths of the output video — are bit-for-bit the
same as the previous master. Only the changed step has new bytes.

That's the property that makes the system honest: it's not "regenerated and
hopefully looks similar." It's "literally the same, except the part that
changed."

### 4 · A human approves the take

The new take lands in the cutroom — a stripped-down review UI that shows the
timeline, the diff status per step, the side-by-side compare, and a single
**Approve master** button. Approving promotes the take.

There is no editor. The data model is the editor.

---

## One YAML, two outputs

The Walkthrough + Step + BrandConfig models that drive the video also render
the same content as a scrollable, on-brand documentation page at `/docs/<id>`.
Same source of truth, two surfaces.

When the product changes, both update from the same diff loop.

---

## The vocabulary

Foley uses film vocabulary in code and UI:

- **Walkthrough** — the product, versioned over time
- **Step** — atomic unit: action, selector, narration, clip, duration
- **Take** — a versioned attempt at the master
- **Master** — the approved take that gets shipped
- **Director** — the agent that diffs PRs and decides which steps to retake
- **Cutroom** — the dashboard where humans review and approve takes
- **Dailies** — list of takes in review
- **Retake** — re-run a single step
- **Brand** — voice, palette, font, pacing rules

It's not decoration — it's how the system thinks. Buttons say `Retake step 4`,
not `Re-render segment 4`.

---

## Stack

- **Pydantic** for every model — verdicts, takes, steps, brand. The agent's
  output is typed against the same models the renderer reads.
- **Claude Sonnet 4.6** for the diff-reasoning agent — adaptive thinking,
  effort=high, structured tool output.
- **Playwright** for browser execution and per-step capture. Each step runs in
  its own Chromium context and produces a deterministic clip.
- **ElevenLabs** for narration synthesis. Voice is locked at the walkthrough
  level. Same voice across every take.
- **ffmpeg** for master assembly. Per-step segments encode with pinned codec
  parameters, then concat-demux without re-encoding.
- **Next.js 14** for the cutroom and the docs page.
- **Logfire** for observability. Every agent call, capture, synth, and concat
  is a span.
- **GitHub webhooks** for the PR trigger.

No DB. State of record is the filesystem under `walkthroughs/<id>/`. The
cutroom is a thin reader; the director is the only writer.

---

## Repo layout

```
apps/cutroom/             Next.js 14 — dashboard, webhook, Remotion compositions
services/director/        Python — diff agent, playwright runner, narrator, concat, CLI
walkthroughs/v1/          Canonical walkthrough — walkthrough.yaml, brand.yaml, steps/, takes/
.claude/skills/foley/     Claude Code skill that wraps `director review`
```

---

## Run it locally

```bash
# 1. fill in API keys
cp .env.example .env
# edit .env with ANTHROPIC_API_KEY, ELEVENLABS_API_KEY (Charlotte voice is
# pre-configured)

# 2. install
pnpm install
uv --directory services/director sync
uv --directory services/director run playwright install chromium

# 3. start the demo app (the product Foley watches)
git clone https://github.com/lukataylo/Foley-demo ../Foley-demo-app
cd ../Foley-demo-app && pnpm install && pnpm dev   # localhost:3001

# 4. bake the v1 master
cd ../Foley
pnpm director ingest                # captures clips + narration for every step
pnpm director master                # concats into walkthroughs/v1/takes/master/master.mp4

# 5. start the cutroom
pnpm cutroom                        # http://localhost:3000

# 6. review a PR end-to-end
pnpm director review <PR_NUMBER>    # diffs the PR, retakes affected steps,
                                    # builds a new take, surfaces it in the cutroom
```

For PR-driven runs over the webhook:

```bash
ngrok http 3000                     # paste the forwarding URL into the GitHub
                                    # webhook on the demo repo, secret =
                                    # GITHUB_WEBHOOK_SECRET in your .env
```

### Director CLI reference

| Command | What it does |
|---|---|
| `director ingest [v1]` | Capture every step's clip + narration |
| `director retake <step_id>` | Re-run one step (force, ignore cache) |
| `director master [--take <id>]` | Concat current step artifacts into a new take |
| `director review <PR>` | Full PR loop: diff → agent → retake → master |
| `director diff-takes <a> <b>` | Per-segment SHA comparison between two takes |
| `director test-agent <fixture>` | Run the agent against a saved fixture |

---

## What's a "take"?

Each PR produces a new take. A take is a directory containing:

```
walkthroughs/v1/takes/<take-id>/
├── master.mp4         # the final concatenated video
├── manifest.json      # per-segment SHA-256 hashes
├── take.json          # the Take record: status, step_diffs, parent take
└── segments/
    ├── intro.mp4
    ├── sign_in.mp4
    ├── board_overview.mp4
    ├── open_ticket.mp4
    ├── mark_done.mp4
    └── settings.mp4
```

`master` is the canonical, approved take. Subsequent takes get sequential ids
(`take-007`, `take-012`, …) and start in `ready` state. Approving promotes
them; rejecting marks them `rejected` and the cutroom moves on.

---

## Status

Hackathon project — *To The Americas*, Unicorn Mafia, London, April 2026.
Single walkthrough, no auth, no DB, demo-only.

Built end-to-end in a 22-hour window. The bet: every product team needs an
on-brand walkthrough that maintains itself, and Pydantic + Sonnet + Playwright
+ ffmpeg + Remotion are now cheap enough to make it real.
