# Foley

**Product walkthrough videos that maintain themselves from PRs.**

## See it in action

![Foley demo preview](walkthroughs/foley/preview.gif)

The clip above is a Foley walkthrough _of Foley_. It was scripted by Claude
from the running cutroom's HTML, captured by Playwright, narrated by ElevenLabs,
and concatenated by ffmpeg — every artefact in this repo went through the same
pipeline a user's would.

▶️ **[Watch the full tour](walkthroughs/foley/takes/master/master.mp4)** · 29 seconds · 2.4 MB · 1440 × 900 · voiced · [captions](walkthroughs/foley/captions.vtt)

## What's new in this build

- **Smooth playback across step boundaries.** One continuous narration mp3 spans the take; the next video clip pre-rolls 250 ms before the cut so the swap is instant.
- **Auto-onboarding.** The /onboard wizard takes a GitHub repo + a dev URL, and a Claude Sonnet 4.6 proposer drafts 3–8 grounded Playwright steps with text-locator selectors. New project → first take in under a minute.
- **Resilient capture.** A bad selector no longer kills the whole ingest — the step records what it can, the editor flags it with a red dot, and a per-step **Retake** button heals it.
- **Editor completeness.** Add steps with **+ Add step**, drag to reorder, retake any step inline, all without leaving the page.
- **AI-readable docs.** `/llms.txt`, `/skill.md`, `/api/mcp`, and per-page `/docs/<id>.md` exports give Claude / ChatGPT / Cursor a clean ingestion path. **Open in …** dropdown on every doc hands the URL to your LLM in one click.
- **Ask this walkthrough.** Inline RAG widget on `/docs/<id>` — Claude with the transcript as context, citations are click-to-jump.
- **Subtitles + transcript with click-to-jump.** Generated for free from ElevenLabs' character-level alignment data.
- **PR comment bot.** When a PR lands, Foley posts the new take's compare URL + a per-step diff table + an embedded preview.gif right back to the PR.
- **Voice cloning upload.** Drop a 30 s audio sample into the Brand panel — ElevenLabs Instant Voice Cloning, brand.yaml updated, the next render is in your voice.
- **Hidden pages, per-page noindex, canonical URLs, sitemap, robots, RSS changelog, custom CSS, branded 404, GFM callouts + mermaid in narration.** The Mintlify-parity table is in [the wiki](https://github.com/lukataylo/Foley/wiki/Competitor-parity).
- **Pre-flight checks + friendly errors.** Missing ffmpeg, ElevenLabs key, or malformed walkthrough.yaml are surfaced with actionable messages instead of stack traces.
- **`director check`.** One CLI command runs schema validation + URL link checking + a11y triage + artifact audit, with a coloured rich.Table report and a useful exit code.

## Wiki

Detailed reference lives in the [GitHub Wiki](https://github.com/lukataylo/Foley/wiki) (mirrored under `/wiki` in this repo for offline reading):

- [Quickstart for judges](https://github.com/lukataylo/Foley/wiki/Quickstart-for-judges)
- [Quickstart for developers](https://github.com/lukataylo/Foley/wiki/Quickstart-for-developers)
- [Architecture](https://github.com/lukataylo/Foley/wiki/Architecture)
- [walkthrough.yaml schema](https://github.com/lukataylo/Foley/wiki/walkthrough.yaml-schema)
- [brand.yaml schema](https://github.com/lukataylo/Foley/wiki/brand.yaml-schema)
- [API reference](https://github.com/lukataylo/Foley/wiki/API-reference)
- [Director CLI reference](https://github.com/lukataylo/Foley/wiki/Director-CLI-reference)
- [AI features](https://github.com/lukataylo/Foley/wiki/AI-features)
- [Competitor parity](https://github.com/lukataylo/Foley/wiki/Competitor-parity)
- [Testing](https://github.com/lukataylo/Foley/wiki/Testing)
- [Operations & runbook](https://github.com/lukataylo/Foley/wiki/Operations-and-runbook)

## Quickstart for judges

This repo bundles a working demo. To try it locally:

1. **Prereqs.** macOS or Linux. Install [pnpm](https://pnpm.io), [uv](https://docs.astral.sh/uv/), and `ffmpeg` (`brew install ffmpeg` on macOS).
2. **Clone & bootstrap.**
   ```
   git clone https://github.com/lukataylo/Foley.git
   cd Foley
   pnpm bootstrap        # installs everything, sets up .env
   ```
   The bootstrap script copies `.env.example` to `.env` — open it and paste an `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` (free tiers are fine).
3. **Run the studio.**
   ```
   pnpm dev
   ```
   Open http://localhost:3000.
4. **Try the full flow.**
   - Click **"+ New walkthrough"** on the home page. The wizard takes a GitHub repo and the URL where the product is running locally. Foley fetches the landing page, asks Claude to draft 4–7 steps, writes them to `walkthroughs/<slug>/walkthrough.yaml`, and drops you straight into the step editor.
   - Click **"Render video"** in the editor. Playwright captures each step against your dev server, ElevenLabs narrates them in one continuous take, ffmpeg concatenates the result. ~60–90s end-to-end on a typical walkthrough.
   - Or open the seeded **"Loop"** walkthrough to play a finished take and inspect the diff history from prior PRs.

That's it — no extra services to run, no Playwright dev container, nothing to provision.

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

### 0 · A new project becomes a walkthrough in 30 seconds

The first cut is _not_ hand-authored. The onboarding wizard fetches the dev
URL's landing-page HTML, hands it to Claude Sonnet 4.6 with adaptive thinking,
and gets back a structured `ProposedSteps` object — 4–7 steps with grounded
Playwright actions (text-locator selectors only, intro is always `goto+wait`,
every step ends with a `wait`). The proposer writes those into
`walkthroughs/<slug>/walkthrough.yaml`, the user lands in the step editor,
clicks **Render**, and the rest of the pipeline below kicks in.

The walkthrough you saw at the top of this README was made this way.

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
apps/cutroom/                       Next.js 14 — dashboard, onboard wizard, step editor, APIs
services/director/                  Python — proposer, diff agent, playwright runner, narrator, concat, CLI
walkthroughs/v1/                    Canonical "Loop" demo — what an authored walkthrough looks like
walkthroughs/foley/                 Self-walkthrough — Foley demoing Foley (rendered by Foley)
scripts/bootstrap.sh                One-shot setup for judges
.claude/skills/foley/               Claude Code skill that wraps `director review`
```

---

## Run it locally

```bash
# 1. one-shot bootstrap — installs node + python deps, plays Playwright,
#    copies .env.example -> .env (you fill in the keys)
pnpm bootstrap

# 2. start the cutroom
pnpm dev                            # http://localhost:3000

# 3. either onboard a new project from the UI ("+ New walkthrough"), or
#    drive the director by hand for the seeded "Loop" walkthrough:
pnpm director ingest                # capture every step's clip + narration
pnpm director master                # concat into walkthroughs/v1/takes/master/master.mp4

# 4. (optional) review a PR end-to-end against the seeded demo repo
pnpm director review <PR_NUMBER>    # diff → agent → retake → master → cutroom
```

The PR-driven flow needs a watched product repo at the URL in `target_app.dev_url`.
For the seeded "Loop" walkthrough the demo app lives at
`https://github.com/lukataylo/Foley-demo` — clone it and run `pnpm dev` on
`localhost:3001` to point Playwright at it.

For PR-driven runs over the webhook:

```bash
ngrok http 3000                     # paste the forwarding URL into the GitHub
                                    # webhook on the demo repo, secret =
                                    # GITHUB_WEBHOOK_SECRET in your .env
```

### Director CLI reference

| Command | What it does |
|---|---|
| `director propose-steps <id>` | Draft 3–8 steps for a brand-new walkthrough from its dev URL's HTML |
| `director ingest [id]` | Capture every step's clip + narration; per-step failures don't abort the run |
| `director retake <step_id>` | Re-run one step (force, ignore cache) |
| `director synth-continuous [id]` | Synth one continuous narration mp3 spanning the whole take |
| `director captions <id>` | Generate captions.vtt from narration.timing.json |
| `director master [--take <id>]` | Concat current step artifacts into a new take |
| `director bake-master [--intro X --outro Y]` | Add intro/outro PNG bookends with fades |
| `director review <PR> [--no-comment]` | Full PR loop: diff → agent → retake → master, then post a comment to the PR |
| `director diff-takes <a> <b>` | Per-segment SHA comparison between two takes |

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
