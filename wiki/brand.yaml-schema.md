# brand.yaml schema

A walkthrough's brand controls voice, palette, typography, and any custom CSS injected into `/docs/<id>`. Resolved relative to the walkthrough directory via `walkthrough.yaml`'s `brand_ref` (defaults to `brand.yaml` in the same dir).

```yaml
voice_id: XB0fDUnXU5powFXDhCwa     # ElevenLabs voice id
voice_name: Charlotte               # display name in the cutroom
font_family: "SF Pro Text"          # used in /docs typography
palette_bg: "#0a0a0a"               # currently rendered as a CSS var on /docs
palette_fg: "#f5f5f5"
palette_accent: "#ffce4a"           # paints the accent line + active transcript row
pacing_wpm: 168                     # 120 ≤ x ≤ 220; used by `director check` a11y
intro_card_ms: 1500                 # 0 ≤ x ≤ 6000; intro fade duration
custom_css: |                       # optional; ≤ 20 KB; sanitised (no `<` allowed)
  .docs-title { letter-spacing: -0.04em; }
  .docs-cta { background: #6f42c1; }
```

## Voice cloning

The Brand sticky on `/walkthroughs/<id>` has a **🎙 Clone my voice** button. Drop a 30 s – 2 min clean recording (mp3 / m4a / wav / webm) and Foley:

1. Multipart-streams the file to `/api/walkthroughs/<id>/brand/voice`.
2. The route forwards to ElevenLabs `/v1/voices/add` (Instant Voice Cloning).
3. On success the returned `voice_id` is written into `brand.yaml` and the next render uses it.

ElevenLabs quotas / rejections surface as a UI banner with the upstream message.

## Custom CSS sandbox

`brand.custom_css` is injected into a `<style>` tag on `/docs/<id>`. Three rules apply:

- Length ≤ 20 KB. Larger strings are silently dropped.
- Any string containing `<` is rejected (defense against `</style><script>` escapes).
- The CSS lives inside the docs page only — it cannot affect the cutroom admin surfaces.

Use it for typography tweaks or a different background; if you need React component overrides, fork the docs page instead.

## Where this gets used

| Field | Used by |
|---|---|
| `voice_id` | `narrator.synth`, `continuous_narration.synth_continuous` |
| `voice_name` | Cutroom Brand panel, /docs hero meta line |
| `font_family` | /docs typography, EditableBrand preview |
| `palette_*` | /docs `--brand-accent` CSS var; brand swatches |
| `pacing_wpm` | `director check` a11y triage (length sanity) |
| `intro_card_ms` | `bake_master` intro fade |
| `custom_css` | `<style>` injected into /docs/<id> |
