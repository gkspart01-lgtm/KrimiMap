# KrimiMap — Implementation Plan

**Status:** Agent hand-off plan; no application code has been implemented.
**Authority:** `REQUIREMENTS.md` is the product baseline. If this plan conflicts with it, requirements win.
**Repository language:** English for source comments, documentation, tests, and UI strings (the UI itself must also provide German).

## 1. Non-negotiable constraints

- The editor, player, local cases, and core storage run in the browser without a KrimiMap-operated backend.
- No KrimiMap API server, server actions, serverless functions, cloud database, user accounts, or cloud-save path is part of the first release.
- Deliver the application as static files and an installable PWA. A static host may provide initial download and later updates; it must not execute game/business logic. After the app shell and required assets are cached, the core workflows work offline.
- Local inference is the preferred AI mode if it works on agreed target devices. If it does not, cloud inference is an optional, user-selected direct browser-to-provider connection using the user's API key. Cloud AI is online-only and never a prerequisite for editing or playing.
- Application source code is MIT licensed. Third-party dependencies, model weights, bundled art, and user-created content require separate license/attribution handling.
- Build the editor first. A level must be authorable, saved locally, validated, and playtested before work expands to a large catalogue of finished cases.

## 2. Recommended technical baseline

Use this as the starting implementation choice, subject to a short package/license/support check in Phase 0:

- **Language:** TypeScript.
- **UI and static build:** Svelte 5 + SvelteKit + `adapter-static` + Vite. SvelteKit documents static generation as outputting a collection of static files.[5]
- **Map/game canvas:** Phaser 4, embedded in a Svelte component and initialized only in the browser. Phaser's official site identifies Phaser 4 as its open-source HTML5 game framework.[6]
- **Persistence:** browser IndexedDB for case documents and local assets; JSON for portable case files.
- **PWA:** a service worker caches versioned app-shell files and explicitly selected static assets. Prefer browser standards; add a PWA package only after confirming its license, maintenance, and SvelteKit compatibility.
- **AI boundary:** a small provider interface returning validated structured drafts. Do not couple the editor or case schema to a specific model.

Before pinning dependencies, record each package's exact version, license, maintenance status, and reason for use. Keep the lockfile committed. Do not add a package solely because it is mentioned here.

## 3. Runtime architecture

```text
Static files / installed PWA
└── Browser application
    ├── Svelte UI: editor panels, menus, player screens, localization
    ├── Phaser canvas: map rendering, pan/zoom, hit testing, selection
    ├── Domain layer: case schema, commands, validation, game rules
    ├── Local data layer: IndexedDB + import/export
    ├── Local AI worker (optional): downloaded model, runs on device
    └── Cloud AI adapter (optional): direct HTTPS request to a provider
         └── No KrimiMap server or proxy
```

Keep domain rules independent of Svelte and Phaser. Phaser scenes render and report user actions; they must not own the canonical case data. Svelte owns application navigation and editor/player UI. The domain layer owns case edits and validation. Persistence serializes domain documents, not live framework objects.

For SvelteKit, prerender the application as static output. Do not add server endpoints, server-only business modules, server actions, or runtime server rendering. Initialize Phaser and browser-only APIs in client lifecycle code so the static build does not access `window`, IndexedDB, or WebGL during build/prerender.

## 4. Proposed source layout

```text
src/
  lib/
    domain/       case schema, IDs, commands, validation, game rules
    game/         Phaser bootstrapping, scenes, map camera, entity rendering
    editor/       editor state, panels, forms, selection and tools
    player/       case play mode, clue inspection, deduction flow
    storage/      IndexedDB repository, migrations, JSON import/export
    ai/
      contracts/  provider-neutral request/response types and validation
      local/      worker, model discovery/loading, progress/cancel handling
      cloud/      direct provider adapters; no proxy/server code
    i18n/         German and English strings
  routes/         SvelteKit static UI routes only
static/           PWA manifest, icons, licensed built-in assets, service worker
 tests/
  unit/           domain, validation, persistence serialization and AI contracts
  e2e/            editor, playtest, reload and offline acceptance flows
LICENSE
THIRD_PARTY_NOTICES.md
```

Adjust names to the generated SvelteKit conventions, but preserve the boundaries: `domain` has no framework dependency; `storage` is replaceable; AI returns drafts and never edits a saved case directly.

## 5. Case data and editing model

Define a versioned `CaseDocument` before building editor screens. Initial fields should cover:

- `schemaVersion`, stable case ID, title, language, description, and setting;
- map dimensions, tile/map references, and named layers;
- entities (characters, objects, clues) with stable IDs, positions, editable properties, and asset references;
- time points/events and character movement or presence;
- objectives/questions, clue relationships, hints, and the solution/deduction rules;
- asset metadata needed to identify origin and license.

Use a migration boundary keyed by `schemaVersion`. JSON import must validate size, shape, IDs, references, and asset paths before persistence; never execute imported content as code. Exported cases must not include API keys, model caches, or browser secrets.

All case changes should pass through domain commands. Implement undo/redo as a command history with bounded memory; test command behavior independently from Phaser rendering. Persist using a repository abstraction over IndexedDB. Store user-created cases separately from cached application/model assets so clearing a model cache cannot delete levels.

## 6. AI plan: local first, explicit cloud fallback

### 6.1 Local browser feasibility gate

Run this spike before committing to a model/runtime. WebLLM describes browser-local LLM inference with WebGPU and no server-side processing.[3] Transformers.js also documents in-browser inference, but notes that WebGPU is experimental in many browsers and discusses quantization for constrained environments.[4] These facts establish candidates, not acceptable KrimiMap performance.

The spike must test on one agreed desktop and one representative mid-range phone:

1. Load a small, appropriately licensed model on an explicit user action; show size, progress, cancel, and storage requirements.
2. Run structured generation for one map layout, one character, and one short case draft; validate the result against the case schema.
3. Measure initial model download, cold start, generation latency, memory use, and whether the model remains available after closing and reopening the installed PWA offline.
4. Confirm the UI stays responsive by running inference in a worker where supported.
5. Review both runtime and exact model-weight licenses; do not assume the software library's license covers a model.

Keep the model optional and independently removable. Do not bundle large model weights in the initial app download. If device coverage, quality, storage, or performance is inadequate, record the measured failure and use the cloud fallback below rather than making offline core features depend on a model.

### 6.2 Optional BYOK cloud mode

- Offer a provider only if its terms permit this application use and it supports direct browser requests from the deployed origin (including CORS). OpenCode Go documentation describes coding-agent traffic, so confirm permitted use before considering it for in-game requests.[1] A ChatGPT subscription does not imply API access or API billing coverage; ChatGPT and API billing are separate.[2]
- The browser sends the request directly to the provider over HTTPS. Do not add a KrimiMap proxy to work around CORS or hide a key; that would introduce server logic and change the agreed architecture.
- The user selects cloud mode, enters their own API key, reviews what case/prompt data will leave the device, and explicitly starts generation. Keep the key in memory for the current tab by default; provide a clear action to discard it. Never commit, log, export, or persist it.
- Do not silently switch from local to cloud, change provider/model, retry a paid request, or submit a prompt after a local failure.
- If browser access is unsupported by a provider, disable that provider and report why. No key means no cloud request.
- AI output is a draft. Validate it, show a preview/diff, and require creator approval before modifying the case.

Start with structured text generation (case drafts, characters, clue/event/timeline data, and map layouts). AI-generated images/backgrounds need a separate model/provider, licensing, storage, and performance spike; do not block the editor MVP on them.

## 7. Ordered implementation phases and exit gates

### Phase 0 — Bootstrap and technical decisions

- Add the MIT `LICENSE` and a third-party license/asset inventory policy.
- Create the static SvelteKit/TypeScript/Phaser build, lockfile, formatting/type-check/test commands, and minimal CI checks.
- Prove a production build emits static assets and runs from a static preview without any application API/server.
- Run the local-AI feasibility spike and document device results before choosing a model. Review candidate package and model licenses.

**Exit:** clean install and static production build succeed; repository contains no runtime backend; a written local-AI decision identifies local runtime/model or justifies cloud-only optional fallback.

### Phase 1 — Offline app shell and map workspace

- Add PWA manifest, icons, and versioned app-shell caching.
- Build an empty editor shell with a Phaser canvas, responsive layout, pan/zoom, and an explicit offline/online indicator.
- Add an e2e test that loads the built app once, switches the browser offline, reloads, and opens the editor.

**Exit:** installed/cached editor shell opens offline on supported test browsers; no KrimiMap API requests exist.

### Phase 2 — Domain, local storage, and case exchange

- Define and test `CaseDocument`, IDs, schema validation, and versioning.
- Add IndexedDB case CRUD, safe JSON import/export, and sample fixture cases.
- Cover corrupted files, duplicate IDs, unknown schema versions, missing assets, and storage errors.

**Exit:** a case survives app restart/offline reload and round-trips through JSON without losing supported fields.

### Phase 3 — Editor vertical slices

Implement one behavior at a time with test-first vertical slices:

1. Create/open/rename a blank case.
2. Add/select/move/delete a basic character/object/clue entity.
3. Edit properties and save/reload the result.
4. Add layers and timeline events.
5. Add undo/redo and validation feedback.

The Svelte editor panels and Phaser canvas must share the same domain state; neither may keep a separate unsaved copy.

**Exit:** a creator can make a small case manually, edit it, undo/redo representative changes, save/reopen it, and receive actionable validation messages.

### Phase 4 — Playtest and offline case workflow

- Implement clue inspection, objectives/deduction submission, optional hints, progress, and return-to-editor.
- Add offline e2e coverage: create, save, close/reopen, export/import, and playtest with network disabled.
- Test PWA update behavior so an app-shell update does not delete IndexedDB cases.

**Exit:** all editor and player acceptance criteria in `REQUIREMENTS.md` pass without a KrimiMap server.

### Phase 5 — AI generation

- If the Phase 0 local spike passes, integrate the selected local engine in a worker with opt-in model download, progress, cancellation, cache management, and schema-validated drafts.
- Otherwise, implement only an optional direct browser-to-provider adapter for a provider that permits this usage and supports the browser origin. Add BYOK consent, privacy disclosure, key-in-memory behavior, error handling, and cost controls.
- Add tests for malformed model output, cancellation, no model/no key, provider failure, consent cancellation, and no silent fallback. CI must use mocks and must never call paid services.

**Exit:** the editor remains fully usable without AI; generation never mutates a case without approval; AI mode and network behavior are explicit.

### Phase 6 — Release hardening

- Check mobile layout, keyboard access, German/English strings, large-map responsiveness, and PWA offline behavior on the agreed device matrix.
- Audit dependency, model, bundled-asset, and generated-content licensing; complete `THIRD_PARTY_NOTICES.md`.
- Scan the repository and built assets for secrets and unexpected runtime endpoints.

**Exit:** all mandatory requirements, offline tests, license review, and production static build pass; open decisions are documented rather than guessed.

## 8. Test-first workflow and agent rules

Follow RED → GREEN → REFACTOR for each behavior. Write the smallest failing test, run it and confirm it fails for the intended reason, implement the minimum change, rerun the focused test, then run the relevant suite. Keep each slice end-to-end; do not write all imagined tests first and implement them later.

Expected project commands (add them during Phase 0 and keep them working):

- `npm ci`
- `npm run check` — formatting, lint, and TypeScript checks
- `npm test` — unit/component tests
- `npm run test:e2e` — browser acceptance tests
- `npm run build` — static production build

For offline browser tests, verify both behavior and network traffic: after the app shell is cached, core operations must succeed with the browser offline, and the app must make no request to a KrimiMap runtime endpoint. Use fake provider responses in CI; never require or store a real API key.

**Agent must not:** add server-side application logic, account/cloud-save features, paid calls, telemetry, or unlicensed assets; store a user's API key; silently send data to a provider; or change the MIT license without approval. Keep all repository text in English and report tests, build output, license checks, and remaining open decisions when handing work back.

## 9. References

- Product requirements and acceptance criteria: [`REQUIREMENTS.md`](REQUIREMENTS.md).

## Sources

[1] https://opencode.ai/v2/docs/console/go — OpenCode Go: plans, API key, intended client traffic
[2] https://help.openai.com/en/articles/8156019-how-can-i-move-my-chatgpt-subscription-to-the-api — OpenAI: ChatGPT and API billing are separate
[3] https://webllm.mlc.ai/docs — WebLLM official docs: browser-local LLM inference using WebGPU
[4] https://huggingface.co/docs/transformers.js/en/index — Transformers.js official docs: browser inference and WebGPU caveats
[5] https://svelte.dev/docs/kit/adapter-static — SvelteKit: static site adapter
[6] https://phaser.io/phaser4 — Phaser official: Phaser 4 web game framework
