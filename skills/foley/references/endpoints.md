# Foley endpoint reference

All endpoints are served by the cutroom at `<base>` (default
`http://localhost:3000`).

## Discovery

| Method | Path | Returns |
|---|---|---|
| GET | `/api/mcp` | MCP-style manifest: resources + tools |
| GET | `/skill.md` | This skill in long form |
| GET | `/llms.txt` | Static discovery index for any LLM |
| GET | `/sitemap.xml` | Full URL list |
| GET | `/robots.txt` | Crawl directives |

## Per-walkthrough (read)

| Method | Path | Returns |
|---|---|---|
| GET | `/api/walkthroughs` | All walkthroughs (id, name, step_count, etc.) |
| GET | `/docs/<id>.md` | Markdown transcript with step timing |
| GET | `/api/walkthroughs/<id>/transcript` | JSON transcript |
| GET | `/api/walkthroughs/<id>/captions` | WebVTT subtitles |
| GET | `/api/walkthroughs/<id>/poster` | JPEG poster image |
| GET | `/api/walkthroughs/<id>/preview.gif` | Animated GIF preview |
| GET | `/api/walkthroughs/<id>/changelog.rss` | RSS feed of versioned takes |
| GET | `/walkthroughs/<id>/takes/master/master.mp4` | Master video file |

## Per-walkthrough (write)

| Method | Path | Notes |
|---|---|---|
| PATCH | `/api/walkthroughs/<id>` | Update display_name / target_app |
| DELETE | `/api/walkthroughs/<id>` | Remove the walkthrough directory |
| POST | `/api/walkthroughs/<id>/ask` | RAG-style question with citations |
| POST | `/api/walkthroughs/<id>/render` | Kick a fresh ingest + master |
| GET | `/api/walkthroughs/<id>/render` | Poll render status |
| POST | `/api/walkthroughs/<id>/steps` | Append a new step |
| PATCH | `/api/walkthroughs/<id>/steps/<step_id>` | Edit a step's title/narration/duration |
| POST | `/api/walkthroughs/<id>/steps/<step_id>/retake` | Re-capture one step |
| POST | `/api/walkthroughs/<id>/steps/reorder` | Reorder steps |

## Onboarding

| Method | Path | Notes |
|---|---|---|
| GET | `/api/keys` | Masked status of Anthropic/ElevenLabs/GitHub keys in .env |
| POST | `/api/keys` | Upsert API keys into .env (validates printable ASCII) |
| POST | `/api/keys/test` | Live-validate keys against each provider |
| GET | `/api/preflight` | ffmpeg / uv / .venv / playwright / env-key checks |
| GET | `/api/preflight/dev-url?url=...` | Reachability + page title for the user's dev URL |
| POST | `/api/onboard/bootstrap` | Create a new walkthrough scaffold |
| POST | `/api/onboard/propose-steps` | Claude drafts 3-8 grounded steps |
| GET | `/api/github/repos` | List user's repos (PAT or mock) |

## Webhooks

| Method | Path | Notes |
|---|---|---|
| POST | `/api/webhook/github` | PR-driven retakes; needs `GITHUB_WEBHOOK_SECRET` |
| GET | `/api/webhook/github` | Returns config status |

## Take editor

| Method | Path | Notes |
|---|---|---|
| GET / PUT | `/api/takes/<take_id>/transitions?wt=<wt_id>` | Per-take transitions.json |
| POST | `/api/takes/<take_id>/approve?wt=<wt_id>` | Mark take approved |
| POST | `/api/takes/<take_id>/reject?wt=<wt_id>` | Send back |
| POST | `/api/director/rebake-take` | Re-run review on changed/added steps |
| POST | `/api/director/renarrate` | Re-narrate one step |
| POST | `/api/genai/laptop-mockup` | Gemini-rendered laptop mockup of a step |
| POST | `/api/genai/stylize-transition` | Gemini stylized transition slide |
| POST | `/api/music/generate` | ElevenLabs Music for a music clip on the timeline |
