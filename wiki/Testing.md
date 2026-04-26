# Testing

Foley ships a `bash scripts/test/all.sh` smoke suite that exercises every public surface on a running cutroom. Designed to run against a fresh `pnpm dev` in under a minute.

## What's covered

The suite is a layered set of bash scripts. Each layer assumes the previous passed.

```
scripts/test/
├── 00-typecheck.sh    pnpm typecheck (TS) + python imports
├── 10-routes.sh       Every public route returns 200/404 as expected
├── 20-apis.sh         Every public API returns the right shape
├── 30-onboard.sh      Bootstrap → propose-steps → step append → reorder
├── 40-ai.sh           Ask widget RAG round-trip
├── 50-checker.sh      `director check` exit codes
├── 60-fs.sh           Atomic write smoke; render-status reconciliation
└── all.sh             Calls the layers in order, summarises pass/fail
```

## Running it

```bash
# Start cutroom in another terminal:
pnpm dev

# In a fresh shell:
bash scripts/test/all.sh
```

The runner exits non-zero on the first hard failure and prints a summary. Each layer also has its own exit code so CI can drop the slowest ones (e.g. `40-ai.sh` calls Anthropic).

## What it doesn't cover

- Visual regressions on the cutroom UI (no Playwright integration tests yet).
- The actual `director ingest` Playwright capture against a third-party dev server.
- Long-running renders. The suite touches `/api/.../render` to confirm it accepts the POST, but doesn't wait for completion.

## Costs

`40-ai.sh` makes one Claude Sonnet 4.6 call (~$0.02). Skip it with `SKIP_AI=1 bash scripts/test/all.sh` if running tightly.

## Adding tests

Each layer is a plain bash script. Add a new layer (e.g. `45-multilang.sh`) by:

1. Drop the script under `scripts/test/`.
2. Make it executable.
3. Have it exit non-zero on failure with a clear message.
4. Reference it in `scripts/test/all.sh` in the right order.

Helper conventions:

- `BASE=${BASE:-http://localhost:3000}` so CI can point at a deployed instance.
- `assert_status <expected> <url> [METHOD]` — used everywhere; defined in `scripts/test/_lib.sh`.
- `pass "msg"` / `fail "msg"` for green/red lines.
