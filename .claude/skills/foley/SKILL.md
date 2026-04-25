---
name: foley
description: Regenerate the on-brand walkthrough video for the current PR. Use when the user asks to update, regenerate, refresh, or rebake the product walkthrough — or whenever a PR meaningfully touches the user-facing surface (button labels, screens, copy, layout). Posts the new take URL back to the chat.
---

# Foley — keep walkthroughs on-brand, automatically

Foley is a tool that maintains product walkthrough videos from PRs. A canonical v1 walkthrough is set up once; every PR can re-bake a new take that re-renders only the affected steps, in the same brand and voice.

## When to invoke this skill

- User says "regenerate the walkthrough", "rebake the video", "update the demo video", "refresh Foley", or anything similar.
- A PR is open against the watched product repo and the changes affect what a user would see — button labels, screen copy, new screens, layout.
- After merging a meaningful UI change, the user wants to refresh the walkthrough before publishing release notes.

Do **not** invoke for refactors, bug fixes that don't affect the UI, dependency bumps, or test-only changes.

## What the skill does

1. Confirms the PR number to review (asks if not provided in the user's message).
2. Runs `director review <PR>` in the Foley repo. This:
   - Fetches the PR's unified diff via the `gh` CLI.
   - Runs the diff-reasoning agent (Claude Sonnet 4.6, adaptive thinking) to classify every step as UNCHANGED / CHANGED / ADDED / REMOVED.
   - Retakes only the changed and added steps via Playwright.
   - Re-narrates only the changed lines using the brand-cloned voice.
   - Concats a new master.mp4 with byte-identical segments for unchanged steps.
3. Prints the take URL and a one-line summary.
4. Reports the result back in chat: take id, what changed, link to the cutroom timeline view.

## How to run it

The Foley repo lives at `/Users/lukadadiani/Documents/Foley` (or wherever the user has it checked out — confirm).

```bash
# from the Foley repo root
pnpm director review <PR_NUMBER>
# equivalent:
uv --directory services/director run director review <PR_NUMBER>
```

The cutroom must be running (`pnpm cutroom` in another terminal) for the take URL to be browsable. The user can also approve / send back the take from the cutroom UI.

## Reporting back

After the command exits, surface to the user:

- The new take id (e.g. `take-007`).
- The director's one-line summary of what changed (printed by the CLI).
- The cutroom URL: `http://localhost:3000/takes/<take-id>`.
- The compare URL: `http://localhost:3000/takes/<take-id>/compare/master`.

Keep the report tight — a tweet, not an essay.

## Vocabulary

Foley uses film vocabulary throughout. When you reference its concepts in chat, match it:

- **Walkthrough** — the product, versioned over time
- **Step** — atomic unit of the walkthrough
- **Take** — a versioned attempt at the master
- **Master** — the approved take that gets shipped
- **Director** — the agent itself
- **Cutroom** — the dashboard UI
- **Dailies** — list of takes in review
- **Retake** — re-run a single step

## Things to push back on

- "Regenerate the whole video from scratch." Foley's whole point is incremental — say so.
- "Use a different voice for this take." The brand's voice is locked at the walkthrough level. Changing it forces a full re-narration; warn the user before doing so.
- "Fix the agent's verdict." If the agent misclassifies, edit the take's `take.json` directly under `walkthroughs/<id>/takes/<take-id>/` and ask the user to retake the affected step manually with `director retake <step_id>`.
