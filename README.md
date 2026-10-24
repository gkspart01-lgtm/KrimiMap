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

## Current state — Phase 0

Implemented:

- Static SvelteKit + TypeScript + Vite build (`adapter-static`), no server code
  and no runtime KrimiMap endpoint.
- Phaser 4 map workspace at `/editor`: pan (drag), wheel zoom, pinch zoom, with
  the camera maths kept in a framework-free module and unit tested.
- `CaseDocument`-shaped AI draft contract with hand-written validation
  (required fields, duplicate IDs, broken character references) and tests.
- WebLLM feasibility harness at `/spike/webllm` — see
  [`docs/spike-webllm.md`](docs/spike-webllm.md). Measurements pending on real
  devices.
- Unit tests (Vitest), a Playwright smoke test, type checks and formatting
  checks.

Not implemented yet (next phases): IndexedDB persistence, case import/export,
editor tools (entities, layers, timeline, undo/redo), playtest mode, PWA
offline caching, AI generation inside the editor.

## Commands

```bash
npm ci                 # install from the lockfile
npm run dev            # dev server
npm run build          # static production build into build/
npm run preview        # serve the production build
npm run check          # svelte-kit sync + svelte-check + prettier check
npm test               # unit tests (Vitest)
npm run test:e2e       # Playwright smoke tests against the built app
npm run format         # write formatting
```

Set `PUBLIC_BASE_PATH` when the site is served from a sub-path, e.g.
`PUBLIC_BASE_PATH=/KrimiMap npm run build`.

## Workflow

Work happens on a feature branch per phase; `main` only receives reviewed,
green merges. The PR preview is published to GitHub Pages (`gh-pages` branch)
so the branch state can be tested in a real browser — WebGPU and PWA features
need HTTPS, which is why a local file server is not enough.

## Deployment

GitHub Pages serves the PR preview at `/KrimiMap/`. Pages serves the repository
under a sub-path, so that build needs `PUBLIC_BASE_PATH=/KrimiMap npm run build`;
the prerendered pages then use relative asset URLs and `resolve()` covers in-app
links.

Any other host that serves the site at its root only needs plain
`npm run build` and the `build/` directory as document root — no server code, no
routing rules (every route is prerendered with a trailing slash).

One limitation of Pages: it cannot set response headers. That rules out
`Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`, which are what
enable multi-threaded WASM (`crossOriginIsolated`) and could speed up local
inference considerably. A self-hosted reverse proxy in front of the static files
would solve that without changing the build.

## Architecture boundaries

- `src/lib/domain` and `src/lib/ai/contracts` — framework-free rules, no
  Svelte/Phaser imports.
- `src/lib/game` — Phaser bootstrapping and the camera; the scene renders and
  reports input, it does not own case data.
- `src/routes` — static UI only; Phaser and browser APIs start in `onMount`.
- AI output is always a draft: validated and shown for approval, never written
  into a case silently. Without a model or key the editor must stay fully usable.
