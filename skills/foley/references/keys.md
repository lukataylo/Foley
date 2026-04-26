# API keys Foley needs

Foley calls Anthropic and ElevenLabs directly from the user's machine.
Keys live in `.env` at the repo root.

## Required

- **`ANTHROPIC_API_KEY`** — Drives the step proposer (`director propose-steps`)
  and the PR-diff agent (`director review`). Without it, onboarding can
  scaffold a walkthrough folder but cannot draft steps.
- **`ELEVENLABS_API_KEY`** — Drives narration synthesis. Without it,
  `director ingest` can capture clips but renders with no voiceover.

## Optional

- **`ELEVENLABS_VOICE_ID`** — Default voice. Falls back to Charlotte
  (`XB0fDUnXU5powFXDhCwa`).
- **`GITHUB_TOKEN`** — Lets `/onboard` show the user's real repos
  instead of the example list.
- **`GITHUB_WEBHOOK_SECRET`** — Required for live PR-driven retakes.
- **`GOOGLE_API_KEY`** — Used by the editor's "Nano Banana" features
  (laptop-mockup clip type, stylized transitions). Backed by Gemini
  2.5 Flash Image. Optional, but without it the AI tile in the take
  editor surfaces "GOOGLE_API_KEY not set" when the user tries to
  generate.

## How users add them

Three paths, in increasing order of polish:

1. **From the UI** — open `/welcome` (or the home page banner). The
   `KeysPanel` form validates each key against the live provider before
   writing it to `.env`. This is the canonical first-run flow.
2. **From the terminal** — copy `.env.example` → `.env` and paste
   keys directly.
3. **Via the bootstrap script** — `pnpm bootstrap` writes a stub `.env`
   from the example file if none exists.

The director subprocess re-reads `.env` on every invocation, so newly
saved keys take effect immediately. Routes that read `process.env`
directly (e.g. the GitHub webhook) need a dev-server restart.

## What a missing-key error looks like

When the director can't find a required key it raises
`MISSING_API_KEY: ANTHROPIC_API_KEY, ELEVENLABS_API_KEY`. Routes that
shell out detect the prefix and turn the failure into HTTP 412 with a
`message` field the UI surfaces as a banner. See
`apps/cutroom/src/lib/director-error.ts`.
