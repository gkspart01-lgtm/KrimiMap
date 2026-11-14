# AI case drafts (Phase 5)

Status: first vertical slice on `feat/phase-5-ai-draft`.

## What exists

- **Provider boundary** — `src/lib/ai/local/provider.ts` defines `DraftProvider`
  (`support`, `prepare`, `generate`, `cancel`). Only the local WebGPU/WebLLM
  implementation exists today; a cloud adapter would be a second implementation,
  never a silent fallback.
- **Draft contract** — `src/lib/ai/contracts/case-draft.ts` validates and repairs
  model output (ids, dangling references) before anything can be applied.
- **Session rules** — `src/lib/ai/session.ts` is a framework-free state machine
  (`checking → idle/preparing → generating → draft|failed`) with unit tests.
- **Applying** — `src/lib/domain/case-draft-apply.ts` turns an approved draft into
  case entities on the shared map (unique positions, clue links, solution
  character). It runs only when the creator presses _In den Fall übernehmen_ and
  goes through the normal undo history.
- **UI** — _KI-Entwurf_ in the editor toolbar opens a dialog: topic, explicit
  model download with progress, cancel, draft preview with the repairs the parser
  applied, apply/discard.

## Guarantees

- Nothing is uploaded; the model download starts only after an explicit click.
- A draft never mutates the case on its own (FR-15).
- With no WebGPU, no model or a failed request the dialog reports the reason and
  the editor stays fully usable (FR-16).
- No clouds, no keys, no telemetry: the first slice is local-only by design.

## Known limits

- The Phase 0 spike measured SmolLM2-360M on an Android phone: ~77 s cold load,
  13.8 s to the first token and unreliable JSON without constrained decoding.
  Drafts are therefore a starting point, not a finished case.
- Desktop numbers are still missing, so the model choice is provisional; the
  provider boundary keeps that decision replaceable.
- CI runs the graceful-absence path only (headless Chromium has no WebGPU). Real
  generation is verified by hand on a WebGPU device — see `docs/spike-webllm.md`.

## Tests

- `tests/unit/ai-session.test.ts` — state transitions, busy/availability rules.
- `tests/unit/case-draft-apply.test.ts` — entity mapping, unique positions,
  solution/clue links, immutability of the input document, invalid drafts.
- `tests/e2e/ai.spec.ts` — the panel opens, reports the missing runtime, and the
  editor still saves afterwards.
