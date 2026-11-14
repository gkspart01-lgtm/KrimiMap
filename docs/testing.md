# Testing pipeline

The app is a static, browser-only build, so the pipeline is built around two
questions: _does the domain logic behave?_ (unit) and _does it work in a real
browser?_ (end-to-end). Type checking and linting guard the code in between.

## Gates

| Gate     | Command                 | Catches                                                                                                                                    |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Lint     | `npm run lint`          | unused code, `any`, sloppy equality, leftover `console`, Svelte-specific mistakes                                                          |
| Types    | `npm run check`         | type errors, wrong SvelteKit APIs, broken `#lib` imports, formatting drift (Prettier)                                                      |
| Unit     | `npm test`              | shared-map document, case schema/migrations/commands, case storage and AI draft contract/repair                                            |
| Coverage | `npm run test:coverage` | unit-test gaps in the framework-free modules (thresholds below)                                                                            |
| Build    | `npm run build`         | static output breaks, prerender errors, base-path handling                                                                                 |
| Browser  | `npm run test:e2e`      | Leaflet map/image load, exact pan/zoom/pinch, selection/drag, inactive case overlays, navigation, offline reload, same-origin-only traffic |

`npm run verify:fast` runs lint → types → unit+coverage.
`npm run verify` adds the browser suite, which builds once and then serves that
build (`npm run test:e2e` = `npm run build && playwright test`). Build exactly
once per run: two `vite build` processes writing into `build/` while tests read
it produce failures that look like rendering bugs.

## Unit tests (Vitest)

`tests/unit/`

- `map-document.test.ts` — stable shared-map identity, dimensions and static asset reference.
- `case-draft.test.ts` / `case-draft-edges.test.ts` — the AI draft contract:
  required fields, length limits, duplicate ids, broken references, malformed
  collections, and the repair pass (kebab-case ids, de-duplication, reference
  resolution, fallbacks).
- `draft-repair.test.ts` — the exact shapes small models produced on real
  devices (capitalised ids, repeated ids, dangling references).
- `spike-attempts.test.ts` — retry loop with a fake engine, request shape per
  structured mode, "schema violations are not accepted".
- `case-document.test.ts` — schema validation (ids, kinds, colours, positions,
  references, self-reference), slug/unique ids, and the migration boundary
  including "refuse a document from a newer version".
- `case-commands.test.ts` — the pure edit commands: add/update/move/remove,
  reference cleanup on delete, clamping, immutability, `updatedAt` bumps.
- `case-json.test.ts` — round trip, size limit, broken JSON, foreign files,
  schema errors with exact paths, identity collisions on import.
- `case-storage.test.ts` — the IndexedDB repository against `fake-indexeddb`:
  save/list/load/delete, newest-first ordering, overwrite instead of duplicate,
  and a refused save for invalid documents.
- `pwa-status.test.ts` — the offline/update notice state machine: a pending
  update survives an "offline ready" event, dismissal resets, "offline ready" is
  only claimed when a worker controls the page.

Coverage is measured for the framework-free modules only
(`src/lib/game/camera.ts`, `src/lib/game/map-controller.ts`,
`src/lib/ai/contracts/case-draft.ts`, `src/lib/pwa/status.ts`) with thresholds of
95 % statements/lines/ functions and 85 % branches. Browser adapters
(`createEditorGame`, the WebLLM runtime, the service-worker registration) cannot
run in Node and are covered by the browser suite instead — do not lower the
thresholds to make them pass; add a test or move the logic into a testable
module.

## Browser tests (Playwright)

`tests/e2e/` runs against the production build (`vite build` + the static server
in `scripts/serve-static.mjs`). `vite preview` cannot be used: in a SvelteKit
project it serves `.svelte-kit/output/client`, so the service worker and the
Workbox runtime — which only exist in the adapter output `build/` — return 404
and the PWA tests would fail against a perfectly good build.

- **desktop project** (1280×800, mouse): canvas fills its container at device
  resolution, a drag moves the map by exactly the pointer distance, wheel zoom
  keeps the world point under the cursor, zoom buttons scale by 1.25 and respect
  the limits, "Ganze Karte" refits, a drag starting on the info panel still
  pans, navigation works, the WebGPU fallback message is honest, and no request
  leaves the static origin.
- **cases flow** (`cases.spec.ts`): create a case, add an entity, reload and find
  it again, edit while offline, import a version-0 draft (migrated), reject a
  broken import with a readable message, delete a case, and switch the UI to
  English and back (persisted across a reload).
- **mouse selection** (`entity-selection.spec.ts`): click an existing marker to
  open its form, click empty map to clear selection, and reselect the marker by
  its world-to-screen position.
- **mobile project** (Pixel 5, touch): canvas renders at the phone pixel ratio,
  one-finger drag pans at initial fit and when zoomed (including the map's
  viewport margin), two-finger pinch zooms in and out around the midpoint,
  tap selects/deselects an entity, and pinching with either finger order on an
  entity leaves that entity unmoved. Multi-touch goes through the DevTools protocol
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
- Offline coverage is Chromium-only and covers the shell, the landing page and
  the editor. It does not prove installation on iOS (no `beforeinstallprompt`),
  storage quotas, or eviction under pressure.
- The WebLLM spike route is excluded from the precache (6 MB runtime), so it is
  online-only; the offline test asserts the editor, not that page.
- No visual regression snapshots: canvas screenshots differ per driver and would
  be noise until the map rendering is stable.
