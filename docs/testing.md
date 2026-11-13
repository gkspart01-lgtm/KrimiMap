# Testing pipeline

The app is a static, browser-only build, so the pipeline is built around two
questions: _does the domain logic behave?_ (unit) and _does it work in a real
browser?_ (end-to-end). Type checking and linting guard the code in between.

## Gates

| Gate     | Command                 | Catches                                                                                                       |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------- |
| Lint     | `npm run lint`          | unused code, `any`, sloppy equality, leftover `console`, Svelte-specific mistakes                             |
| Types    | `npm run check`         | type errors, wrong SvelteKit APIs, broken `#lib` imports, formatting drift (Prettier)                         |
| Unit     | `npm test`              | camera maths, gesture logic, case-draft contract and repair                                                   |
| Coverage | `npm run test:coverage` | unit-test gaps in the framework-free modules (thresholds below)                                               |
| Build    | `npm run build`         | static output breaks, prerender errors, base-path handling                                                    |
| Browser  | `npm run test:e2e`      | canvas boot, exact drag/pinch behaviour, DPR rendering, navigation, WebGPU fallback, same-origin-only traffic |

`npm run verify:fast` runs lint → types → unit+coverage → build.
`npm run verify` additionally runs the Playwright suite. Both are what CI runs.

## Unit tests (Vitest)

`tests/unit/`

- `camera.test.ts` — projection, pan, anchored zoom, clamping with slack, fit.
- `map-controller.test.ts` — the gesture state machine: one-finger drag tracks
  the pointer exactly, pinch uses a gesture baseline (so alternating finger
  updates cannot jitter), lifting one finger does not jump, wheel anchoring,
  zoom limits, clamping, change notifications.
- `case-draft.test.ts` / `case-draft-edges.test.ts` — the AI draft contract:
  required fields, length limits, duplicate ids, broken references, malformed
  collections, and the repair pass (kebab-case ids, de-duplication, reference
  resolution, fallbacks).
- `draft-repair.test.ts` — the exact shapes small models produced on real
  devices (capitalised ids, repeated ids, dangling references).
- `spike-attempts.test.ts` — retry loop with a fake engine, request shape per
  structured mode, "schema violations are not accepted".

Coverage is measured for the framework-free modules only
(`src/lib/game/camera.ts`, `src/lib/game/map-controller.ts`,
`src/lib/ai/contracts/case-draft.ts`) with thresholds of 95 % statements/lines/
functions and 85 % branches. Browser adapters (`createEditorGame`, the WebLLM
runtime) cannot run in Node and are covered by the browser suite instead — do
not lower the thresholds to make them pass; add a test or move the logic into a
testable module.

## Browser tests (Playwright)

`tests/e2e/` runs against the production build (`vite build` + `vite preview`).

- **desktop project** (1280×800, mouse): canvas fills its container at device
  resolution, a drag moves the map by exactly the pointer distance, wheel zoom
  keeps the world point under the cursor, zoom buttons scale by 1.25 and respect
  the limits, "Ganze Karte" refits, a drag starting on the info panel still
  pans, navigation works, the WebGPU fallback message is honest, and no request
  leaves the static origin.
- **mobile project** (Pixel 5, touch): canvas renders at the phone pixel ratio,
  one-finger drag pans without scrolling the page, two-finger pinch zooms in and
  out around the midpoint. Multi-touch goes through the DevTools protocol
  (`Input.dispatchTouchEvent`) because Playwright's `touchscreen` helper can only
  tap; the CDP session is reused per page because Chromium tracks the touch
  stream per session.

The map publishes its camera on the container element (`data-zoom`,
`data-camera-x`, `data-camera-y`), which is what the tests read. That is a
deliberate, harmless piece of observability, not a test-only hook.

## Rules that keep it honest

1. **A reported bug becomes a test first.** Reproduce it in the smallest layer
   that can express it — a unit test if it is logic, a browser test if it is
   behaviour — watch it fail, then fix it. Every bug Falko reported from his
   phone has a test row above.
2. **State what the gate proves.** "Build passes" does not mean "the canvas
   renders". Unit tests prove logic; Playwright proves rendering and gestures in
   Chromium; neither proves real WebGPU performance on a phone.
3. **No test that needs credentials, network or paid services.** The AI tests
   use a fake engine; the browser suite fails if a request leaves the origin.
4. **Keep the pure layers pure.** If logic needs WebGL, `window` or IndexedDB to
   test, it is in the wrong module.

## Running the browser suite on a host without root

Playwright needs Chromium plus system libraries. Where `sudo` is unavailable,
installing the distribution packages is not an option, but extracting them into
a private prefix is:

```bash
scripts/dev-browser-env.sh          # downloads + unpacks the deps, prints exports
eval "$(scripts/dev-browser-env.sh)" # apply them to the current shell
npm run test:e2e
```

The script asks Playwright which packages are missing
(`playwright install-deps --dry-run chromium`), downloads them with
`apt-get download` (no root needed), extracts them with `dpkg-deb -x` into
`~/.cache/krimimap-browser-deps` and prints `LD_LIBRARY_PATH`, `FONTCONFIG_PATH`
and `XDG_DATA_DIRS`. It is a local escape hatch, not part of CI.

## Known blind spots

- Real WebGPU: headless Chromium exposes `navigator.gpu === false`, so the suite
  verifies the _fallback_, not inference. Model performance stays a device
  measurement (`docs/spike-webllm.md`).
- Safari/iOS and Firefox are not in the matrix. They need a real device or a
  BrowserStack-style service; the plan's device matrix decision is still open.
- Offline/PWA behaviour cannot be tested yet because the service worker is not
  implemented (Phase 1 of the plan).
- No visual regression snapshots: canvas screenshots differ per driver and would
  be noise until the map rendering is stable.
