# Director CLI reference

Run from the repo root. Either:

```bash
pnpm director <subcommand> …                                  # via the package.json alias
uv --directory services/director run director <sub> …          # direct
PYTHONPATH=services/director/src uv … run director <sub> …    # if the editable install isn't picked up
```

Exit codes follow Unix convention: `0` on success, `1` on a hard error, `2` is reserved for the `check` command's "warnings only" state.

## Capture & assemble

| Command | Purpose |
|---|---|
| `director propose-steps <id> [--dev-url ...] [--description ...]` | Draft 3–8 walkthrough steps from the dev URL's HTML. Writes `walkthrough.yaml`. |
| `director ingest [id] [--headed] [--force] [--skip-narration]` | Capture clip + narration for every step. Per-step failures don't abort the loop; they're logged in the summary and `meta.json:error` / `action_warnings`. |
| `director retake <step_id> [walkthrough_id] [--headed]` | Re-run a single step (force, ignore cache). |
| `director master [walkthrough_id] [--take <id>]` | Concat segments → `master.mp4`. Reuses byte-identical segments from a parent take when fingerprints match. |
| `director synth-continuous [id]` | One ElevenLabs `convert_with_timestamps` call → `narration.mp3` + `narration.timing.json` + `narration.waveform.json`. |
| `director captions [id]` | Generate `captions.vtt` from `narration.timing.json`. Idempotent. |
| `director bake-master [id] [--intro path.png] [--outro path.png] [--intro-duration 3.0] [--outro-duration 3.0] [--take master]` | Add intro / outro PNG bookends with fades to an existing master. |

## Diff & review

| Command | Purpose |
|---|---|
| `director review <PR_NUMBER> [walkthrough_id] [--parent <take>] [--no-comment]` | Full PR loop: fetch diff via `gh`, run the agent, retake affected steps, assemble new take. Posts a markdown comment back to the PR with a per-step diff table + embedded preview.gif unless `--no-comment`. |
| `director diff-takes <a> <b> [walkthrough_id]` | Per-segment SHA-256 comparison between two takes. |
| `director review-fixture <fixture-name> [walkthrough_id]` | Run the agent against a saved fixture instead of a live PR (useful for offline tests). |

## AI

| Command | Purpose |
|---|---|
| `director ask <id> --question "..."` | Claude with the transcript as context. Returns `{answer, citations: [step_id]}` as a single-line JSON envelope on stdout. |

## Validation & ops

| Command | Purpose |
|---|---|
| `director check [id] [--no-network]` | Schema + link checker + a11y triage + artifact audit. Exit 0 / 1 / 2. |
| `director version` | Prints the package version. |

## Shared options

Most commands default `walkthrough_id` to `v1`. Override by passing the id positionally.

`--headed` toggles Playwright Chromium's UI for any capture command — useful for local debugging.

## Where everything lands

```
walkthroughs/<id>/
├── walkthrough.yaml                    proposer / authoring writes
├── brand.yaml                          brand cloning writes voice_id
├── steps/
│   ├── <step>.mp4                      ingest writes
│   ├── <step>.png                      ingest writes
│   ├── <step>.narration.mp3            ingest writes (per-step) or synth-continuous (continuous)
│   ├── <step>.waveform.json            waveform.write_waveform writes
│   └── <step>.meta.json                ingest writes (fingerprint + warnings + error)
├── narration.mp3                       synth-continuous writes
├── narration.timing.json               synth-continuous writes
├── narration.waveform.json             synth-continuous writes
├── captions.vtt                        captions writes (or lazy-built by /api/.../captions)
├── poster.jpg                          /api/.../poster lazy-builds
├── preview.gif                         /api/.../preview.gif lazy-builds
├── takes/
│   ├── master/                         director master writes
│   │   ├── master.mp4
│   │   ├── manifest.json
│   │   ├── take.json
│   │   └── segments/<step>.mp4
│   └── take-NNN/                       director review writes
├── watching.json                       bootstrap writes
└── .feedback.jsonl                     /api/feedback writes (gitignored)
```
