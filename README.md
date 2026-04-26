# Foley

**Product walkthrough videos that maintain themselves from PRs.**

[![License Apache 2.0](https://img.shields.io/badge/license-Apache_2.0-blue?style=for-the-badge)](LICENSE)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-000000?style=for-the-badge&logo=next.js&logoColor=white)](apps/cutroom)
[![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)](services/director)
[![TypeScript 5.6](https://img.shields.io/badge/TypeScript-5.6-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](apps/cutroom/tsconfig.json)
[![pnpm 10](https://img.shields.io/badge/pnpm-10-F69220?style=for-the-badge&logo=pnpm&logoColor=white)](pnpm-workspace.yaml)

[![Claude Sonnet 4.6](https://img.shields.io/badge/Claude-Sonnet_4.6-D97757?style=for-the-badge&logo=anthropic&logoColor=white)](services/director/src/director/proposer.py)
[![ElevenLabs](https://img.shields.io/badge/Voice-ElevenLabs-000000?style=for-the-badge)](services/director/src/director/narrator.py)
[![Gemini 2.5 Flash Image](https://img.shields.io/badge/Image-Gemini_2.5_Flash-4285F4?style=for-the-badge&logo=google&logoColor=white)](apps/cutroom/src/app/api/genai)
[![Playwright](https://img.shields.io/badge/Capture-Playwright-2EAD33?style=for-the-badge&logo=playwright&logoColor=white)](services/director/src/director/playwright_runner.py)
[![ffmpeg](https://img.shields.io/badge/Render-ffmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=white)](services/director/src/director/concat.py)

[![MCP ready](https://img.shields.io/badge/MCP-ready-635BFF?style=for-the-badge)](apps/foley-mcp)
[![Claude Code skill](https://img.shields.io/badge/Claude_Code-skill-D97757?style=for-the-badge)](skills/foley)
[![llms.txt](https://img.shields.io/badge/llms.txt-served-0F766E?style=for-the-badge)](apps/cutroom/src/app/llms.txt)
[![oEmbed](https://img.shields.io/badge/oEmbed-1.0-1F2937?style=for-the-badge)](apps/cutroom/src/app/api/oembed)

![Foley demo preview](walkthroughs/foley/preview.gif)

The clip above is a Foley walkthrough _of Foley_, captured by the same pipeline a user runs. ▶️ **[Watch the full tour](walkthroughs/foley/takes/master/master.mp4)** · 20 s · 1440 × 900 · voiced · [captions](walkthroughs/foley/captions.vtt).

> Auto-onboard a GitHub repo + a dev URL. Claude drafts 4–7 grounded Playwright steps. Playwright captures, ElevenLabs narrates, ffmpeg renders. Every PR re-runs only the steps it touched — unchanged segments stay **byte-identical**. One YAML drives the video, the docs page, and the Markdown export. MCP server + Claude Code skill ship in the box.

---

## The problem

Product walkthrough videos go stale the moment they ship.

A button gets renamed. A screen gets added. A flow gets shortened. The video on your homepage now shows a UI that doesn't exist. Inside three months, every recorded demo on a fast-moving product is a lie.

The maintenance loop costs:

- A scriptwriter rewriting narration to match new copy.
- A screen recording session.
- A voice-over session (or a paid clone re-take).
- A video editor stitching the new shots into the old timeline.
- A reviewer making sure the cut still flows.
- A re-publish.

That's a half-day round-trip per change, every time the product moves. So teams stop maintaining the videos. The videos rot. Adoption suffers because the most concrete artefact of how the product works — the walkthrough — is visibly out of date.

---

## Why nobody has solved it

Three categories of tool _adjacent_ to this problem, none of which closes it:

| Category | Example | What it does | Why it doesn't maintain video |
|---|---|---|---|
| **Auto-docs** | Mintlify, Docusaurus + LLM agents | Generate doc *text* from PRs, source code, schemas | No video pipeline — Markdown only |
| **Polished demos** | Guidde, Tella, Loom AI | One-shot polish on a human-recorded walkthrough | Each maintenance cycle is a fresh recording — no diff awareness |
| **Interactive tours** | Arcade, Storylane, Navattic | Click-through product tours with hotspots | Tours, not video; still hand-edited per change |

**Foley sits in the gap.** It's the only tool that treats a product walkthrough video as a living artefact: structured, diffable, and maintained by the same agent loop your code already runs through.

---

## How Foley closes the loop

```
┌──────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  GitHub PR opens │───▶│  Director (LLM)  │───▶│  Per-step diff   │
└──────────────────┘    │  reads diff +    │    │  unchanged       │
                        │  current YAML    │    │  changed         │
                        └──────────────────┘    │  added           │
                                                │  removed         │
                                                └────────┬─────────┘
                                                         │
                                            ┌────────────┴────────────┐
                                            ▼                         ▼
                                  ┌──────────────────┐      ┌──────────────────┐
                                  │ Retake CHANGED   │      │ Reuse UNCHANGED  │
                                  │ Playwright +     │      │ segments byte-   │
                                  │ ElevenLabs       │      │ identical        │
                                  └────────┬─────────┘      └────────┬─────────┘
                                           └─────────┬───────────────┘
                                                     ▼
                                           ┌──────────────────┐
                                           │ ffmpeg concat    │
                                           │ → new master.mp4 │
                                           │ + PR comment     │
                                           └──────────────────┘
```

A button label change retouches one segment, leaves the other five frozen. The data plane is provable: `director diff-takes master take-007` prints the per-segment SHA-256 table.

---

## Capabilities

Five surfaces, each one a load-bearing part of the loop:

### Capture
- **Auto-onboard from a GitHub repo + dev URL.** The wizard fetches the landing page, asks Claude Sonnet 4.6 to draft 4–7 grounded steps with text-locator selectors, writes them to `walkthrough.yaml`. Empty repo → first take in 60 s.
- **Playwright at the source.** Each step is a Playwright recipe (goto / click / fill / hover / wait / scroll / press) with stable ids; bad selectors flag the step amber and the rest of the run still completes.
- **Editor controls.** + Add step / drag to reorder / inline Retake / right-click delete a walkthrough from the home grid.
- **Voice cloning.** Drop a 30 s – 2 min audio sample; ElevenLabs Instant Voice Cloning produces a `voice_id` and the next render is in your voice.

### Narrate
- **Continuous narration.** ElevenLabs `convert_with_timestamps` produces one mp3 spanning every step + per-character alignment. Editor playback is smooth across step boundaries — no per-clip seam.
- **Captions + transcript for free.** WebVTT captions and the click-to-jump docs transcript both fall out of the same `narration.timing.json`.
- **Director's note.** Each take ships a one-sentence agent verdict explaining what changed and why.

### Publish
- **One YAML, three outputs.** The same Walkthrough drives `master.mp4`, the scrollable docs page at `/docs/<id>`, and a plain-Markdown export at `/docs/<id>.md` for AI ingestion.
- **SEO + sharing.** Auto sitemap.xml, robots.txt, OpenGraph, Twitter player card, oEmbed, RSS changelog feed per walkthrough. Hidden walkthroughs ship `noindex` and drop out of `/llms.txt`.
- **Static export.** A self-host HTML bundle and a YouTube-ready mp4 from the publish modal.

### Maintain
- **Director reads every PR.** Webhook fires → Claude Sonnet 4.6 (adaptive thinking) reads the unified diff and the current walkthrough → returns a structured `StepDiff[]`. Nothing free-text.
- **Only changed steps re-run.** Encode parameters are pinned so unchanged segments are bit-for-bit identical across takes.
- **PR comment bot.** New take → comment back on the PR with the per-step diff table, a compare URL, and an embedded `preview.gif`.
- **Resilience.** Atomic writes everywhere; pre-flight banners for missing ffmpeg / API keys / dev-server unreachable; `director check` is one CLI for schema + link + a11y validation.

### Plug-in
- **MCP stdio server.** `apps/foley-mcp/` exposes `list_walkthroughs`, `ask_walkthrough`, `get_transcript`. One `claude mcp add` wires Claude Code, Cursor, Windsurf, or Continue.
- **Claude Code skill.** `skills/foley/` ships a SKILL.md with frontmatter + endpoint reference. Symlink it into `~/.claude/skills/`.
- **AI-readable surfaces.** `/llms.txt`, `/skill.md`, `/api/mcp`, `/docs/<id>.md`, JSON transcript with timing — clean ingestion for any LLM.
- **Inline Ask widget.** Every public docs page has Claude RAG over the transcript with click-to-jump citations.

---

## Architecture

Two services connected by a shared filesystem. No DB, no queue, no auth.

```
                       ┌────────────────────┐
                       │  GitHub PR opened  │
                       └──────────┬─────────┘
                                  │ webhook
                                  ▼
   ┌──────────────────────────────────────────────────────────┐
   │                    apps/cutroom (Next.js 14)             │
   │   onboard wizard · step editor · review · publish        │
   │   /docs/<id> · /docs/<id>.md · llms.txt · skill.md       │
   │   /api/walkthroughs/<id>/{ask,captions,transcript,       │
   │                            poster,preview.gif,           │
   │                            changelog.rss,feedback}       │
   └──────────┬───────────────────────────────────────────────┘
              │ shells out to `uv run director …`
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

State of record is everything under `walkthroughs/<id>/`. To deploy a new instance, you `git clone` the tree; to back up, you `tar` it. To roll a take back, you swap the `master/` folder. The byte-identity property of unchanged segments makes the data plane provable.

Repo layout:

```
apps/cutroom/                       Next.js 14 — dashboard, onboard, step editor, all APIs
apps/foley-mcp/                     Stdio MCP server for Claude Code / Cursor / Windsurf
services/director/                  Python — agent, proposer, ask, capture, narrate, concat, check
walkthroughs/v1/                    Canonical "Loop" demo
walkthroughs/foley/                 Foley demoing Foley (rendered by the same pipeline)
skills/foley/                       Claude Code skill — install via symlink
scripts/bootstrap.sh                One-shot setup
scripts/test/                       8-layer smoke-test suite
extensions/recorder/                Chrome extension — alternate import path
wiki/                               Detailed reference, mirrored to https://github.com/lukataylo/Foley/wiki
```

The cutroom is a thin reader; the director is the only writer (every state file goes through atomic write helpers — `write_text_atomic` / `writeFileAtomic` — so a process crash mid-write can never leave a half-written JSON for the next reader).

---

## How it works

### 1 · The walkthrough is a list of step atoms

Each step has a stable id, a Playwright recipe, narration text, a captured clip, and a duration. Once a walkthrough exists you can extend it from the editor (+ Add step / drag to reorder / inline Retake) or by hand in YAML:

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

When a PR opens against the watched repo, a webhook enqueues a job. The director — Claude Sonnet 4.6 with adaptive thinking — reads the unified diff and the current walkthrough and returns one verdict per step:

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

The verdict is structured output — typed against Pydantic models via a forced tool call — not free text. Every step is classified; nothing is a guess.

### 3 · Only changed steps re-run

Playwright recaptures the affected steps. ElevenLabs re-narrates only the changed lines, in the same voice. ffmpeg concat-demuxes the resulting segments into a new `master.mp4`. Encode parameters are pinned, so segments for unchanged steps are **byte-identical** across takes:

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

Five of six segments are bit-for-bit the same as the previous master. Only the changed step has new bytes. That's the property that makes the system honest: it's not "regenerated and hopefully looks similar," it's "literally the same, except the part that changed." Foley posts the same table back to the PR as a comment.

### 4 · A human approves the take

The new take lands in the cutroom — a stripped-down review UI that shows the timeline, the diff status per step, the side-by-side compare, and a single **Approve master** button. Approving promotes the take. Rejecting marks it rejected and the cutroom moves on.

The data model is the editor.

### Vocabulary

Foley uses film vocabulary in code and UI; internalise it once and the API surface becomes predictable.

- **Walkthrough** — the product, versioned over time.
- **Step** — atomic unit: action + selector + narration + clip + duration. Stable id.
- **Take** — a versioned attempt at the master. Each PR produces a `take-NNN`.
- **Master** — the approved take that gets shipped. Subsequent takes diff against it.
- **Director** — the agent that diffs PRs and decides which steps to retake.
- **Cutroom** — the dashboard where humans review, approve, and publish.
- **Dailies** — list of takes in review.
- **Retake** — re-run a single step.
- **Brand** — voice, palette, font, pacing rules.

---

## Director CLI

Run from the repo root:

```bash
pnpm director <subcommand> …                                  # via the package.json alias
uv --directory services/director run director <sub> …         # direct
PYTHONPATH=services/director/src uv … run director <sub> …    # if the editable install is shy
```

| Command | What it does |
|---|---|
| `director propose-steps <id> [--dev-url ...] [--description ...]` | Draft 3–8 walkthrough steps from the dev URL's HTML. Writes `walkthrough.yaml`. |
| `director ingest [id] [--headed] [--force] [--skip-narration]` | Capture clip + narration for every step. Per-step failures don't abort the loop. |
| `director retake <step_id> [walkthrough_id] [--headed]` | Re-run a single step (force, ignore cache). |
| `director master [walkthrough_id] [--take <id>]` | Concat segments → `master.mp4`. Reuses byte-identical segments from a parent take. |
| `director synth-continuous [id]` | One ElevenLabs call → `narration.mp3` + `narration.timing.json` + `narration.waveform.json`. |
| `director captions [id]` | Generate `captions.vtt` from `narration.timing.json`. |
| `director bake-master [id] [--intro x.png --outro y.png]` | Add intro / outro PNG bookends with fades. |
| `director review <PR_NUMBER> [walkthrough_id] [--no-comment]` | Full PR loop: fetch diff → run agent → retake affected → assemble → post comment back to the PR. |
| `director diff-takes <a> <b> [walkthrough_id]` | Per-segment SHA-256 comparison between two takes. |
| `director ask <id> --question "…"` | RAG over a walkthrough's narration. Returns `{answer, citations: [step_id]}` as a JSON envelope on stdout. |
| `director check [id] [--no-network]` | Schema + link checker + a11y triage + artefact audit. Exit 0 / 1 / 2. |

Most commands default `walkthrough_id` to `v1`. Override by passing it positionally.

---

## Plug Foley into your AI editor

Two complementary surfaces — install both for the smoothest experience:

```bash
# Stdio MCP server: typed tools + resource subscriptions
pnpm --filter foley-mcp build
claude mcp add foley node "$(pwd)/apps/foley-mcp/dist/index.js"

# Claude Code skill: vocabulary, endpoint table, when-to-use rules
mkdir -p ~/.claude/skills && ln -s "$(pwd)/skills/foley" ~/.claude/skills/foley
```

After that, Claude Code (or Cursor / Windsurf / Continue) can:

- `mcp__foley__list_walkthroughs` — discover what's available
- `mcp__foley__ask_walkthrough(id, question)` — RAG-style answer with step-id citations
- `mcp__foley__get_transcript(id)` — the full markdown transcript with per-step timestamps
- subscribe to `foley://<id>/{transcript.md,captions.vtt,transcript.json}` resources

Without an MCP-aware editor, the same data is reachable as plain HTTP — `/api/mcp`, `/skill.md`, `/llms.txt`, `/docs/<id>.md`. Drop any of those URLs into a chat and the agent picks them up.

---

## Quickstart

```bash
git clone https://github.com/lukataylo/Foley.git
cd Foley
pnpm bootstrap        # checks ffmpeg/uv/pnpm, installs deps, copies .env.example → .env
pnpm dev              # http://localhost:3000
```

Open `http://localhost:3000/welcome` and paste your **Anthropic** + **ElevenLabs** keys into the in-page form — Foley validates them against the live providers before writing them to `.env`. A **Google API key** is optional but unlocks the "Nano Banana" (Gemini 2.5 Flash Image) clip type for laptop-mockup + stylized-transition slides in the take editor.

Click **+ New walkthrough** on the home page to onboard a project, or open the seeded **Loop** walkthrough to play a finished take. **Right-click any walkthrough on the home grid to delete it.**

The smoke test suite is `bash scripts/test/all.sh` (`SKIP_AI=1` skips the layer that calls Claude). The full **Quickstart for judges** lives in the wiki.

---

## Status

**Hackathon project — *To The Americas*, Unicorn Mafia, London, April 2026.** The first cut shipped in a 22-hour window; the current build is the result of an overnight follow-up that added the auto-onboarder, the Ask widget, the AI-readable surfaces, the MCP stdio server, the Claude Code skill, the in-app key entry form, the smoke test suite, and the recursive Foley-of-Foley demo at the top of this README.

Shipped end-to-end:

- Onboarding wizard, step editor, render panel, take review, publish modal
- Director CLI: `propose-steps · ingest · retake · master · synth-continuous · captions · bake-master · review · diff-takes · ask · check`
- PR webhook → director → PR comment with diff table + preview.gif
- MCP stdio server (`apps/foley-mcp`) + Claude Code skill (`skills/foley`)
- Atomic writes everywhere; preflight banner for missing keys / ffmpeg / dev URL
- `/docs/<id>` + `/docs/<id>.md` + `/api/walkthroughs/<id>/{ask,transcript,captions,poster,preview.gif,changelog.rss}`
- 9-layer smoke-test suite (now includes Playwright UI smoke for the onboarding wizard)

> **Single-tenant by design.** Foley runs as one user editing one set of walkthroughs on one machine. There's no auth boundary, no per-user storage, no rate limiting on the API routes. Multi-tenant deployment is a real project, not a config flag — start with the points below before pointing public traffic at it.

Out of scope (start here if you adopt Foley for real):

- No auth, no rate limits, no per-user isolation.
- No CDN — every asset is served by Next.js itself.
- No queue — every render is a detached child process.
- No observability beyond Logfire spans.

---

## Wiki

Detailed reference: <https://github.com/lukataylo/Foley/wiki> (mirrored at `wiki/` in this repo).

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
