# Quickstart for judges

You have five minutes. Here's the demo.

## Step 1 — clone & bootstrap (~3 min on a fresh machine)

```bash
git clone https://github.com/lukataylo/Foley.git
cd Foley
pnpm bootstrap
```

`pnpm bootstrap` checks `pnpm`/`uv`/`ffmpeg` are on PATH, installs Node + Python deps, fetches the Playwright Chromium binary, and copies `.env.example` → `.env`.

Open `.env` and paste two keys (free tiers are fine):

- `ANTHROPIC_API_KEY=…`
- `ELEVENLABS_API_KEY=…`

## Step 2 — run the studio

```bash
pnpm dev
```

Open <http://localhost:3000>. The home page is the folder grid of every walkthrough on disk. The seeded **Loop** walkthrough is fully baked and plays end-to-end with smooth voice across step boundaries.

## Step 3 — try the auto-onboarding flow

Click **+ New walkthrough** in the home grid. The wizard takes a GitHub repo (mock examples shown if no `GITHUB_PAT` is set) and a Dev URL where the product is running locally — `http://localhost:3001` is fine for the demo.

What happens, in ~30 seconds:

1. `/api/onboard/bootstrap` writes a `walkthroughs/<slug>/` scaffold.
2. `/api/onboard/propose-steps` calls Claude Sonnet 4.6 (adaptive thinking, forced tool call) with the dev URL's landing-page HTML. Claude proposes 4–7 grounded Playwright steps with text-locator selectors.
3. You land in `/walkthroughs/<slug>/edit` with the step list ready to render.

Click **Render video**. Playwright captures each step against your dev server, ElevenLabs narrates, ffmpeg concatenates. ~60–90 s end-to-end.

## Step 4 — explore /docs/<id>

Once a walkthrough has a master take, `/docs/<id>` is the public page. Try the seeded one: <http://localhost:3000/docs/v1>.

Notable surfaces:

- **Open in Claude / ChatGPT / Perplexity / Cursor** dropdown (top right) — one-click hand-off with the walkthrough's `.md` URL pre-filled.
- **Ask this walkthrough** widget (bottom right) — Claude with the step transcript as context, citations are click-to-jump.
- **Transcript panel** below the master video — every step is a click-to-scrub row.
- **Captions** — toggle CC on the player; lazily generated WebVTT from ElevenLabs alignment.
- **Feedback** — thumbs in the footer, logs to a JSONL.

Plain-Markdown export at `/docs/<id>.md`, AI discovery at `/llms.txt` and `/skill.md`, MCP-style manifest at `/api/mcp`. Drop any of those into your favourite LLM tool and it'll Just Work.

## Step 5 — try the PR loop

If you have `gh` authenticated and a watched product repo with a real PR:

```bash
pnpm director review <PR_NUMBER>
```

Foley diffs the PR via Sonnet 4.6, classifies every step (UNCHANGED / CHANGED / ADDED / REMOVED), Playwright-recaptures only the affected steps, ElevenLabs re-narrates only the changed lines, and posts a comment back to the PR with a per-step diff table and an embedded preview GIF.

That's it. The README has a 24-second auto-tour rendered _by_ Foley _of_ Foley itself — every artefact in this repo went through the pipeline judges will use.
