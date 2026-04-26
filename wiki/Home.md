# Foley wiki

Welcome. **Foley** is a hackathon project that turns a single YAML walkthrough into an on-brand product video that maintains itself from GitHub PRs.

This wiki is the canonical reference for the codebase. Mirror the page tree into your GitHub Wiki by cloning `git@github.com:lukataylo/Foley.wiki.git` and copying the markdown files under `/wiki` here.

## Where to start

| If you are… | Read |
|---|---|
| A judge with 5 minutes | [Quickstart for judges](Quickstart-for-judges) |
| A developer cloning the repo | [Quickstart for developers](Quickstart-for-developers) |
| Curious how the pipeline works | [Architecture](Architecture) |
| Looking for an API reference | [API reference](API-reference) |
| Editing a walkthrough by hand | [walkthrough.yaml schema](walkthrough.yaml-schema) |
| Comparing to Loom / Mintlify / Guidde | [Competitor parity](Competitor-parity) |

## Big picture

```
                    ┌────────────────────┐
                    │  GitHub PR opened  │
                    └──────────┬─────────┘
                               │ webhook
                               ▼
   ┌────────────────────────────────────────────────────┐
   │              apps/cutroom (Next.js 14)             │
   │   onboard wizard · step editor · review · publish  │
   │   /docs/<id> · /docs/<id>.md · llms.txt · skill.md │
   │   /api/walkthroughs/<id>/{ask,captions,transcript, │
   │                            poster,preview.gif,     │
   │                            changelog.rss,feedback} │
   └──────────┬─────────────────────────────────────────┘
              │ shells out
              ▼
   ┌────────────────────────────────────────────────────┐
   │         services/director (Python · uv)           │
   │                                                    │
   │   proposer ──▶ ingest ──▶ master ──▶ synth-cont   │
   │   review (Sonnet 4.6) ──▶ retake affected steps   │
   │   ask (Sonnet 4.6 RAG)                            │
   │   captions · check (validator + a11y + links)     │
   └──────────┬─────────────────────────────────────────┘
              │ writes
              ▼
        walkthroughs/<id>/{steps,takes,narration.*}
```

## Vocabulary

Foley uses film vocabulary throughout the codebase. Internalise it once and the API surface becomes predictable.

- **Walkthrough** — the product, versioned over time. Lives at `walkthroughs/<id>/`.
- **Step** — atomic unit: action + narration + clip + duration. Has a stable id. Re-render on PR diff.
- **Take** — a versioned attempt at the master. PR #N produces `take-NNN`.
- **Master** — the approved take that gets shipped. Subsequent takes diff against this.
- **Director** — the Python agent at `services/director`. Diffs PRs, runs Playwright + ElevenLabs + ffmpeg.
- **Cutroom** — the Next.js dashboard at `apps/cutroom`. Where humans review, approve, and publish.
- **Dailies** — list of takes in review.
- **Retake** — re-run a single step.

## Pages in this wiki

- [Quickstart for judges](Quickstart-for-judges)
- [Quickstart for developers](Quickstart-for-developers)
- [Architecture](Architecture)
- [walkthrough.yaml schema](walkthrough.yaml-schema)
- [brand.yaml schema](brand.yaml-schema)
- [API reference](API-reference)
- [Director CLI reference](Director-CLI-reference)
- [AI features](AI-features)
- [Competitor parity](Competitor-parity)
- [Testing](Testing)
- [Operations & runbook](Operations-and-runbook)
