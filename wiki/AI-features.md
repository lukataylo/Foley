# AI features

Everything in Foley that talks to a model. All four use Claude Sonnet 4.6 with structured output (forced `submit_*` tool call). Tool schemas are produced from Pydantic models so the parsed input is type-checked end-to-end.

## 1 · `proposer` — draft a walkthrough

Trigger: the onboard wizard, or `director propose-steps <id>`.

```
INPUT     dev_url + repo + description + landing-page HTML excerpt
PROMPT    Constrains action shapes (text-locator selectors only,
          intro must start with goto+wait, every step ends with wait)
TOOL      submit_steps → ProposedSteps { summary, steps: [Step] }
OUTPUT    Writes 3–8 steps to walkthrough.yaml, replacing the bootstrap stub.
LATENCY   ~25–40 s (adaptive thinking + HTML fetch)
```

System prompt: `services/director/src/director/proposer.py:SYSTEM_PROMPT`.

## 2 · `agent` — review a PR

Trigger: `director review <PR_NUMBER>` or the `/api/webhook/github` POST handler.

```
INPUT     Walkthrough JSON + unified PR diff + PR title/body
THINKING  adaptive
TOOL      submit_verdict → AgentVerdict {
            summary,
            step_diffs: [StepDiff {step_id, status, reason, proposed_step?}]
          }
OUTPUT    Identifies which steps need to be retaken; only those
          re-run Playwright. Unchanged steps stay byte-identical.
```

System prompt: `services/director/src/director/agent.py:SYSTEM_PROMPT`. Verifies every existing step appears in the verdict before returning.

## 3 · `ask` — Q&A over a walkthrough

Trigger: `/api/walkthroughs/<id>/ask` (the AskWidget on `/docs/<id>`) or `director ask <id> --question "…"`.

```
INPUT     Full walkthrough transcript + free-form user question
TOOL      submit_answer → AskAnswer { answer, citations: [step_id] }
OUTPUT    1-3 sentence paragraph + clickable step ids in the UI
SAFETY    Citations are post-filtered against the actual step id set
          before returning, so the UI never links to nothing.
```

System prompt: `services/director/src/director/ask.py:SYSTEM_PROMPT`. Honesty rule: if the transcript doesn't answer the question, the model says so.

## 4 · Discovery / metadata

These don't call a model; they expose Foley to other AI tools.

| Endpoint | Purpose |
|---|---|
| `/llms.txt` | Discovery index per the [llmstxt.org](https://llmstxt.org/) spec. |
| `/skill.md` | Mintlify-style "skill manifest" that tells an agent when and how to read this site. |
| `/api/mcp` | HTTP MCP-style manifest with resources (per-walkthrough markdown / WebVTT / JSON / mp4) and tools (`ask_walkthrough` wrapping the existing endpoint). |
| `/docs/<id>.md` | Plain Markdown export of every walkthrough — the canonical AI-ingestible form. |

The **Open in …** dropdown on `/docs/<id>` ties them together: one click hands the LLM a prefilled prompt with the walkthrough's `.md` URL.

## API key plumbing

Both `ANTHROPIC_API_KEY` and `ELEVENLABS_API_KEY` go through the central `settings.require()` helper:

```python
def require(self, *keys: str) -> None:
    missing = [k for k in keys if not getattr(self, k.lower(), "")]
    if missing:
        raise MissingApiKey(missing)
```

`MissingApiKey` is raised before any client is instantiated. Its message starts with `MISSING_API_KEY:` so the route handler maps it to HTTP 412 with a friendly UI banner instead of leaking a Python stack trace.

## Cost ballparks

For a 6-step walkthrough on Sonnet 4.6:

- **proposer**: ~3-5 K input tokens (system + HTML + repo metadata), ~1-2 K output tokens. ~$0.05.
- **agent**: ~5-15 K input tokens (system + walkthrough JSON + diff), ~1-2 K output. ~$0.08.
- **ask**: ~2-5 K input tokens (system + transcript + question), ~150-400 output. ~$0.02.

ElevenLabs `eleven_turbo_v2_5` runs ~$0.30 per minute of audio synthesised. A re-bake of v1 costs roughly $0.30 of audio + $0.05 of Claude.
