# WebLLM feasibility spike

**Status:** harness implemented, measurements pending on real devices.

This document defines how we decide whether KrimiMap's AI assistance can run
locally in the browser (WebGPU + WebLLM) instead of using a cloud provider with
a user-supplied key. It follows the Phase 0 gate in
[`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md) §6.1.

## What the harness does

Route: `/spike/webllm`

1. Reports WebGPU availability, the GPU adapter, CPU threads, the browser's
   memory hint, and whether the page is cross-origin isolated.
2. Downloads one small model on explicit user action, with progress and the
   required GPU-memory figure shown before loading.
3. Runs one structured generation: a German detective case draft as JSON, the
   same shape the editor will ask for.
4. Parses and validates the output against the real draft contract
   (`src/lib/ai/contracts/case-draft.ts`) — a failed parse or a schema violation
   is reported as such instead of being counted as success.
5. Records load time, time to first token, total time, prompt/completion token
   counts and output speed, then shows a copyable JSON report.

Nothing is uploaded. Model weights come from the public MLC CDN once and are
then served from the browser's HTTP cache, so a second run measures a warm
start.

## Procedure

Run the harness in the deployed preview on each target device:

1. Desktop (the developer machine used for this project).
2. One representative mid-range phone.

For each device:

1. Open the spike route, note the device panel output.
2. Load **SmolLM2 360M** first — it is the smallest realistic candidate.
   Record load time and whether the download completed on mobile data.
3. Run the generation once. Record the metrics table and the schema verdict.
4. Reload the page, load the same model again — this is the warm start.
5. If the device has headroom, repeat with **Llama 3.2 1B** and
   **Qwen 3.5 0.8B**.
6. Copy the JSON report and add it to the results table below.

## Results

| Date       | Device                                               | Browser           | WebGPU adapter                   | Model                       | Mode   | Load (cold) | First token | Total  | Completion tokens | Chars/s | Schema valid                        |
| ---------- | ---------------------------------------------------- | ----------------- | -------------------------------- | --------------------------- | ------ | ----------- | ----------- | ------ | ----------------- | ------- | ----------------------------------- |
| 2026-10-23 | Android 10 phone, 8 CPU threads, 8 GB (browser hint) | Chrome 155 mobile | not exposed (empty adapter info) | SmolLM2-360M-Instruct-q4f16 | `text` | 77.3 s      | 13.8 s      | 24.7 s | 163               | 17.1    | **no** — JSON broke at position 102 |

### Findings from the first run

- WebGPU is available on the phone, so the capability gate passes — but the
  numbers do not: 77 s for a 376 MB model, 13.8 s to the first token and
  ~6.6 tokens/s make the editor wait unacceptable.
- A 360M model at temperature 0.7 does not produce reliable JSON on its own: the
  answer broke off mid-object. Plain prompting is therefore not enough for a
  structured draft, regardless of speed.
- The adapter block is empty on Android Chrome; the page must treat missing
  adapter fields as normal, not as an error.
- `crossOriginIsolated` is false, as expected on GitHub Pages.

### Follow-ups implemented after the first run

- The harness now offers **constrained decoding** (`response_format`
  `json_object`, optionally with a JSON Schema of the draft contract) and a
  **retry count**, and reports every attempt — so the next measurement answers
  whether structure can be forced rather than merely asked for.
- The measurement above should be repeated in `json_schema` mode; that is the
  configuration a real generation flow would use.

## Pass criteria

Local inference counts as usable when, on the mid-range phone:

- the model loads within a tolerable wait on a normal connection and stays
  cached across reloads;
- time to first token stays under ~3 s and generation streams fast enough that
  the editor is still pleasant to use;
- the produced draft is schema-valid after at most one retry;
- the UI stays responsive during generation.

If any of these fail on the phone, the plan's fallback applies: keep local
inference as an optional desktop path if it works there, and implement the
optional browser-to-provider BYOK adapter — never a KrimiMap proxy.

## Known limitations of the harness

- There is no way to read real GPU memory from the browser; the required VRAM
  figure comes from the model's own metadata and the JS heap is a rough hint
  only. Watch the device for stutter and thermal throttling instead.
- The spike measures one short generation per run, so numbers are indicative,
  not a benchmark suite.
- `crossOriginIsolated` is false on GitHub Pages (no COOP/COEP headers), so
  multi-threaded WASM is unavailable. A production deployment could enable it,
  which would change (likely improve) the results.
- Model licences differ from the runtime licence: SmolLM2 and Qwen are
  Apache-2.0, Llama 3.2 uses the Llama 3.2 Community License. The bundled
  runtime's Apache-2.0 licence does not cover the weights.
