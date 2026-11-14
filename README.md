# KrimiMap

Browser-based 2D detective game with an editor-first workflow: creators build
cases (map, characters, clues, timeline), validate them, and playtest them in
the browser. No KrimiMap server, no accounts, no cloud save — the app is static
files plus an installable PWA, and local inference is the preferred AI mode.

- Product requirements: [`REQUIREMENTS.md`](REQUIREMENTS.md) (the baseline —
  requirements win over any plan).
- Implementation plan: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).
- Third-party licences: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Repository content, code comments and docs are in English; the UI ships German
and English.

## Current state — playtest vertical slice (Phase 4)

Implemented:

- Static SvelteKit + TypeScript + Vite build (`adapter-static`), no server code
  and no runtime KrimiMap endpoint.
- Leaflet map editor at `/editor` using `CRS.Simple` and one static, fictional
  city map. Drag, wheel zoom, pinch zoom, image rendering and touch selection are
  browser-tested; Leaflet owns map navigation rather than app-written gestures.
- `CaseDocument`-shaped AI draft contract with hand-written validation
  (required fields, duplicate IDs, broken character references) and tests.
- WebLLM feasibility harness at `/spike/webllm` — see
  [`docs/spike-webllm.md`](docs/spike-webllm.md). Measurements pending on real
  devices.
- **Installable PWA**: web app manifest, icon set, and a Workbox service worker
  that precaches the whole app shell (currently about 42 entries, ~1.6 MB). The editor opens
  offline after one visit, an update waits for the user instead of reloading
  under their fingers, and a pill in the header shows online/offline plus
  whether the cache is armed. Details and the trade-offs:
  [`docs/pwa.md`](docs/pwa.md).
- **A UI for humans first**: camera numbers, the AI spike and the build stamp
  are behind a debug switch (gear in the header, or `?debug=1`, remembered
  locally). The editor displays the original, project-authored `Crime City` SVG
  map, bundled and cached from the same origin; no third-party map tiles or
  copyrighted MicroMacro artwork are used.
- `npm run verify` as the single gate: lint, types, formatting, unit tests with
  coverage thresholds, static build, browser tests including the offline reload.

- **Cases and playtest are local documents**: schema v3 stores the shared map
  reference, a case objective, solution character and optional hint. Existing
  schema v0–v2 cases migrate on import and read from IndexedDB. JSON export/import
  retains challenge data and never overwrites an existing case id.
- **Cases share one map**: cases reference `crime-city`; objects of other cases
  are shown dimmed in the editor and remain non-interactive. Only the current
  case's objects can be selected and changed.
- **Playtest at `/play?id=…`**: inspect map entries, discover clues, reveal an
  optional hint, submit a culprit deduction and return to the editor. The local
  map image, route and case CRUD/export/import work offline after the app is cached.
- **German and English**: UI strings live in `src/lib/i18n`; validation diagnostics
  use stable codes so they can be translated as well.

## Commands

```bash
npm ci                 # install from the lockfile
npm run dev            # dev server (no service worker; registration is skipped)
npm run build          # static production build into build/ + service worker
npm run preview        # serve the production build from build/
npm run icons          # regenerate static/icons from scripts/generate-icons.py
npm run lint           # ESLint
npm run check          # svelte-kit sync + svelte-check + prettier check
npm test               # unit tests (Vitest)
npm run test:coverage  # unit tests with coverage thresholds
npm run test:e2e       # Playwright: desktop + touch phone against the build
npm run verify:fast    # lint → check → unit+coverage → build
npm run verify         # verify:fast plus the browser suite
npm run format         # write formatting
```

The pipeline, what each gate proves and how to run the browser suite on a host
without root: [`docs/testing.md`](docs/testing.md).

Set `PUBLIC_BASE_PATH` when the site is served from a sub-path, e.g.
`PUBLIC_BASE_PATH=/KrimiMap npm run build`.

## Workflow

Work happens on a feature branch per phase; `main` only receives reviewed,
green merges.

- **Production** — `https://gkspart01-lgtm.github.io/KrimiMap/` is always the
  `main` state: `deploy-pages.yml` builds on every push to `main` and publishes
  to the root of the `gh-pages` branch.
- **Per-PR preview** — `preview-pages.yml` builds each pull request with the
  sub-path `/KrimiMap/pr-<number>/` and publishes it below `pr-<number>/` on the
  same branch, then comments the URL on the PR. Previews are additive
  (`keep_files`), so publishing one never removes production or another preview.

A build marker (`VITE_BUILD_INFO`) is shown on the landing page, so it is easy to
tell which commit a URL is serving.

## Deployment

GitHub Pages serves the repository from the `gh-pages` branch — production at
`/KrimiMap/`, previews at `/KrimiMap/pr-<n>/`. Pages serves the project under a
sub-path, so those builds need `PUBLIC_BASE_PATH=/KrimiMap` (or the preview
variant); the prerendered pages then use relative asset URLs, `resolve()` covers
in-app links, and the service worker registers with the matching scope.

Any other host that serves the site at its root only needs plain
`npm run build` and the `build/` directory as document root — no server code, no
routing rules (every route is prerendered with a trailing slash).

One limitation of Pages: it cannot set response headers. That rules out
`Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`, which are what
enable multi-threaded WASM (`crossOriginIsolated`) and could speed up local
inference considerably. A self-hosted reverse proxy in front of the static files
would solve that without changing the build.

Closed pull requests leave their preview folder behind; delete `pr-<number>/`
manually or add a cleanup job when the folder list becomes noisy.

## Architecture boundaries

- `src/lib/domain` and `src/lib/ai/contracts` — framework-free rules, no
  Svelte/Leaflet imports.
- `src/lib/game/createLeafletEditor.ts` — browser-only Leaflet map adapter; the
  map instance renders shared map art and active/inactive case layers, while
  domain documents remain canonical.
- `src/lib/domain/map-document.ts` — the reusable shared map identity, bounds and
  same-origin asset reference; cases reference it through `mapId`.
- `src/routes` — static UI only; Leaflet and browser APIs start in `onMount`.
- AI output is always a draft: validated and shown for approval, never written
  into a case silently. Without a model or key the editor must stay fully usable.
