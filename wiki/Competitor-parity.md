# Competitor parity

Where Foley lands relative to the docs / walkthrough tools judges (and customers) will compare it to. ✅ has it · ⚠️ partial · ❌ missing · ➕ Foley-only.

|  | Foley | Mintlify | Loom | Guidde | Arcade |
|---|---|---|---|---|---|
| **Output** | video + scrollable docs + .md | scrollable docs | video | video | interactive tour |
| Auto-maintained from PRs | ✅ ➕ | ⚠️ (text only) | ❌ | ❌ | ❌ |
| Byte-identical re-use across versions | ✅ ➕ | n/a | ❌ | ❌ | n/a |
| YAML / MDX source-of-truth | yaml | mdx | n/a | n/a | json |
| Web editor / WYSIWYG | ⚠️ (step editor only) | ✅ | ✅ | ✅ | ✅ |
| Auto-onboard from a GitHub repo | ✅ ➕ | ⚠️ (template) | ❌ | ❌ | ❌ |
| Step proposer (Claude reads dev URL) | ✅ ➕ | ❌ | ❌ | ❌ | ❌ |
| Voice cloning (drop in your voice) | ✅ | ❌ | ❌ | ⚠️ | ❌ |
| WebVTT captions | ✅ | n/a | ✅ | ✅ | n/a |
| Click-to-jump transcript | ✅ | n/a | ✅ | ✅ | n/a |
| OG image / Twitter player / oEmbed | ✅ | ✅ | ✅ | ✅ | ✅ |
| Sitemap + robots | ✅ | ✅ | n/a | n/a | n/a |
| Per-page noindex + canonical | ✅ | ✅ | n/a | n/a | n/a |
| Hidden pages | ✅ | ✅ | n/a | n/a | n/a |
| llms.txt + skill.md + MCP manifest | ✅ | ✅ | ❌ | ❌ | ❌ |
| Open-in-LLM dropdown (Claude/ChatGPT/Cursor) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Per-page Markdown export | ✅ | ✅ | ❌ | ❌ | ❌ |
| Ask-this-walkthrough RAG | ✅ ➕ | ✅ | ❌ | ❌ | ❌ |
| RSS changelog | ✅ | ✅ | ❌ | ❌ | ❌ |
| Custom CSS injection | ✅ | ✅ | ❌ | ⚠️ | ⚠️ |
| Custom 404 | ✅ | ✅ | n/a | n/a | n/a |
| Custom domain | ❌ | ✅ | ✅ | ✅ | ✅ |
| Auth / private docs | ❌ | ✅ | ✅ | ✅ | ✅ |
| Multi-version selector | ⚠️ (takes timeline) | ✅ | ❌ | ❌ | ⚠️ |
| Multi-language narration | ❌ (deferred) | ✅ | ⚠️ | ⚠️ | ⚠️ |
| API playground / OpenAPI ingest | ❌ | ✅ | n/a | n/a | n/a |
| MDX-style components in docs | ⚠️ (callouts + mermaid) | ✅ | n/a | n/a | n/a |
| Multi-level sidebar w/ search | ❌ | ✅ | n/a | n/a | n/a |
| Strict validator + link checker + a11y | ✅ (`director check`) | ✅ | ❌ | ❌ | ❌ |
| Per-page feedback (👍/👎) | ✅ | ✅ | ❌ | ⚠️ | ⚠️ |
| Pre-flight system check banner | ✅ ➕ | ❌ | n/a | n/a | n/a |
| Resilient capture (one bad selector ≠ failed run) | ✅ ➕ | n/a | ✅ | ✅ | ✅ |
| Atomic state writes (no partial JSON) | ✅ ➕ | n/a | n/a | n/a | n/a |

➕ marks features Foley has that none of the named competitors offer.

## Where Foley wins

- **PR-aware updates.** No competitor diff a PR and re-run only the affected steps.
- **Byte-identical reuse.** Encoder params are pinned so unchanged segments are bit-for-bit the same across takes — provable via `director diff-takes`.
- **Step proposer.** Auto-draft a walkthrough from a live dev URL in 30 seconds.
- **One YAML, three outputs.** Same source drives a video, a scrollable doc, and a Markdown LLM-ingestible export.
- **AI surfaces are first-class.** llms.txt, skill.md, MCP manifest, Open-in-LLM, and Ask-this-walkthrough are all on Day 1, not bolted on.
- **Resilience.** A bad selector flags a step amber, doesn't tank the run; missing keys / malformed YAML get HTTP 412 / 422 with friendly messages, not stack traces.

## Where Foley loses (and what we'd do)

- **No auth.** Every walkthrough is public to URL holders. Adding password / OAuth is a couple of days of work — not blocked, just out of scope for a hackathon.
- **No multi-language.** ElevenLabs supports it; Claude can translate; the schema field is teed up. ~3 hours.
- **No API playground.** Off-mission — Foley is for product walkthroughs, not API docs.
- **No multi-level sidebar / search.** The home folder grid is the only navigation. A Mintlify-style sidebar is a meaningful refactor.
- **No custom domain.** Localhost-only deploy story today.
- **No MDX.** We have callouts + mermaid via plain-text markup, but components-in-docs would require adopting MDX as the narration format.
- **No PDF export.** Puppeteer install (~150 MB) was deemed too heavy for the hackathon push.
