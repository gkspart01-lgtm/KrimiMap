# KrimiMap — Software Requirements Specification

**Version:** 0.1 (draft for review)
**Status:** Requirements baseline; implementation has not been selected
**Project:** KrimiMap

## 1. Purpose and scope

KrimiMap is a browser-based 2D detective game. Players explore large, detailed maps, find characters and clues, reconstruct timelines, and solve case-based mysteries. The intended audience remains casual players, detective fans, and families; settings may include towns, villages, fantasy worlds, and science-fiction environments. Content must support age-appropriate cases.

This document defines the product requirements, not an implementation plan. Requirements use **shall** for mandatory behavior. Candidate technologies below are not binding selections.

All project documentation and repository content shall be maintained in English. The application shall support at least German and English.

## 2. Product goals and priorities

1. Make the level editor the first major product capability, so creators can author and test levels before a large catalogue of built-in cases exists.
2. Let creators build complete, solvable detective cases from maps, entities, clues, and timelines.
3. Add optional AI assistance to creation workflows where a user has configured a compatible provider; manual creation shall remain possible without AI.
4. Deliver an enjoyable mobile-first game that also works on tablets and desktop browsers.
5. Use open-source software with an active community for the application and its core dependencies. Do not make a closed-source library, platform, or AI provider a mandatory runtime dependency.

## 3. User roles and primary workflows

- **Creator:** starts a level, places and edits content, defines events and timelines, validates the case, saves or exports it, and playtests it.
- **Player:** opens a case, explores and zooms the map, inspects characters and objects, gathers clues, uses optional hints, makes a deduction, and sees progress or a result.

## 4. Functional requirements

### 4.1 Editor-first authoring

- **FR-01 — Editor access (Must):** A creator shall be able to create and edit a case without first completing a separate gameplay campaign.
- **FR-02 — Map workspace (Must):** The editor shall display a 2D map with pan and zoom controls and support touch and pointer input.
- **FR-03 — Entities (Must):** A creator shall be able to add, select, move, edit, and remove characters, objects, and clues on a map.
- **FR-04 — Layers (Should):** The editor should support named layers or an equivalent organization mechanism for map content.
- **FR-05 — Timeline (Should):** A creator should be able to define multiple case time points and associate character movements or events with them.
- **FR-06 — Undo and redo (Must):** Editing actions shall support undo and redo, including placement and property changes.
- **FR-07 — Case validation (Must):** The editor shall identify at least missing required case data and broken references before a case is marked ready to play. Solvability checks shall be added where their rules can be defined and tested.
- **FR-08 — Save and exchange (Must):** A creator shall be able to save and reload a case without losing its authored content. Case data shall have a documented, versioned exchange format; JSON is the current candidate.
- **FR-09 — Playtest (Must):** A creator shall be able to launch a case from the editor in a player/test mode and return to editing.

### 4.2 Player experience

- **FR-10 — Exploration (Must):** Players shall be able to pan and zoom large maps and inspect interactive characters, objects, and clues.
- **FR-11 — Case flow (Must):** A playable case shall present its premise and objectives, allow evidence gathering, and provide a way to submit a deduction or answer.
- **FR-12 — Hints and progress (Should):** The game should offer optional hints and communicate case progress or completion.
- **FR-13 — Authored content variety (Should):** Case data shall allow different settings, characters, clues, events, and timelines without requiring a new application build for each case.

### 4.3 AI assistance

- **FR-14 — Optional AI integration (Should):** Creators should be able to request drafts or structured suggestions for case text, characters, map layouts, objects, scenes, and timelines. The preferred mode is local inference in the browser where it meets the supported-device and quality criteria; cloud inference is an optional online fallback only after user consent.
- **FR-15 — Human approval (Must):** AI output shall be shown for review and editing before it changes saved case content. It shall never silently overwrite a creator's work.
- **FR-16 — Graceful absence (Must):** The editor and player workflows shall remain usable when no AI credentials are configured, a provider is unavailable, or a request fails.
- **FR-17 — User-provided credentials (Must):** Cloud AI shall use credentials supplied by the user. A key shall be entered by the user, kept in memory only by default, and sent directly from the browser to the selected provider over HTTPS; it shall not be sent through a KrimiMap server, committed to the repository, embedded in a public bundle, or saved in a case file. The UI shall warn that browser-side keys are not secret from the device owner or compromised scripts.
- **FR-18 — Provider choice and cost consent (Must):** The application shall make the selected provider/model and any known cost or usage limits visible. It shall not switch to another provider, enable paid usage, or submit prompts without the user's explicit action.
- **FR-19 — Data disclosure (Must):** Before the first cloud request, the application shall explain what prompt and case data will be sent to the selected provider and let the user cancel.

## 5. Quality and platform requirements

- **NFR-01 — Mobile-first:** Core editor and player workflows shall adapt to phone, tablet, and desktop layouts and support touch as well as mouse/keyboard input.
- **NFR-02 — Performance:** Map navigation and ordinary editor interactions shall remain responsive on representative mid-range phones. Exact test devices, map size, entity count, and response-time thresholds are open decisions and must be set before performance acceptance.
- **NFR-03 — Offline PWA:** The application shall be installable as a Progressive Web App and, after its static application files are installed/cached, core editor, player, and local case workflows shall run offline. The only planned online AI actions are an explicitly requested local-model download and a user-approved cloud inference request; neither is required to edit or play. Local AI shall work offline after its selected model files are available on the device.
- **NFR-04 — Local persistence and portability:** Cases and settings shall be stored on the user's device using browser-local storage (IndexedDB is the implementation candidate) and shall be exportable/importable in a documented, versioned format. No account or cloud sync is required for the first release.
- **NFR-05 — Open-source dependencies and license:** The KrimiMap application source code shall be licensed under MIT. Required application libraries shall use open-source licenses compatible with MIT. Licenses for dependencies, models, and bundled media shall be audited and documented; user-created cases and third-party/generated media shall have separate, explicit licensing terms.
- **NFR-06 — Security and privacy:** Secrets shall not appear in source control, logs, exported case files, or client assets. A cloud API key shall be ephemeral by default and held only in browser memory; browser-side keys are not secret from the device owner or compromised scripts. Prompts and case data shall never leave the device for local inference; cloud requests shall go directly to the user-selected provider only after explicit consent.
- **NFR-07 — Localization:** User-facing text shall be separable from game logic and support German and English at minimum.
- **NFR-08 — Extensibility:** Map data, case rules, presentation, editor UI, and optional AI-provider integration should be separable enough to evolve without tying authored cases to a single provider or renderer.
- **NFR-09 — No application backend:** The product shall not require KrimiMap-operated server-side application logic, APIs, databases, authentication services, or cloud storage. The application shall be buildable as static files. A static host may deliver the initial app and later updates, but core runtime workflows shall not call it for business logic or data persistence.

## 6. Candidate technical direction (not a commitment)

Existing planning material names Phaser 4, Svelte 5/SvelteKit, Vite, WebGL, Tiled JSON, and local browser storage. These remain candidates only and may be reused if they satisfy this specification, have suitable open-source licenses and active communities, and pass technical validation. No programming language, framework, map format, database, or AI vendor is selected by this specification. Application runtime and persistence must remain client-side; the no-backend requirement is mandatory.

A static SvelteKit build and Phaser 4 canvas remain candidates for validation.[5][6]

Browser-local inference engines such as WebLLM and Transformers.js are candidates for a feasibility test: their documentation describes in-browser inference, while Transformers.js notes that WebGPU remains experimental in many browsers.[3][4] Suitability for target devices, output quality, model download size, and model licensing are not yet established.

The AI integration should be provider-agnostic at the product boundary. A provider adapter is a candidate design; it must not make the application unusable when a provider changes terms, becomes unavailable, or charges for use.

## 7. Acceptance criteria for the first editor-led release

The first release is acceptable when all of the following are demonstrated:

- **AC-01:** A creator can start a case, create or load a map, and add, move, edit, and remove at least characters, objects, and clues.
- **AC-02:** Pan and zoom work on a touch device and with desktop input.
- **AC-03:** A creator can undo and redo representative map/entity edits.
- **AC-04:** A case can be saved, closed, reloaded, and exported/imported without losing its required content.
- **AC-05:** Validation reports configured missing fields or invalid references and explains how to fix them.
- **AC-06:** A creator can playtest a case and return to the editor.
- **AC-07:** With AI disabled and no credentials present, the editor and playtest remain usable and make no AI-provider requests.
- **AC-08:** If AI is enabled, generated content is reviewable and editable before application; a failed request leaves the case unchanged.
- **AC-09:** The repository's core application and required dependencies pass a license review against the project's MIT license.
- **AC-10 — Offline core:** After the static app shell and required assets have been installed/cached, disconnecting the network does not prevent creating, editing, saving, reopening, exporting, importing, or playtesting a local case. These workflows make no request to a KrimiMap-owned backend.
- **AC-11 — AI modes:** Local AI makes no network requests after the selected model is present locally. If local inference is unavailable, cloud AI is only used after the user selects it, supplies a key, and accepts the data disclosure; an error never triggers silent cloud fallback.

Specific browser versions, screen sizes, map scale, entity counts, performance limits, and offline installation targets must be agreed before final release acceptance.

## 8. Open decisions

1. **AI runtime and device baseline:** Which local model/task combinations are good enough on the target phones and desktops, what model download size is acceptable, and what minimum WebGPU/device support is required? The local-inference spike must answer this before choosing a model.
2. **Cloud AI provider and price ceiling:** If local AI is unavailable or insufficient, which browser-callable providers are acceptable, and what maximum recurring or per-use cost is acceptable? Free tiers can change or be limited, so free availability must not be a product dependency.
3. **OpenCode Go:** The official documentation describes OpenCode Go as a paid subscription (currently listing Go at $10/month and Go Plus at $40/month), with API-key setup, and describes its intended traffic as coding-agent requests.[1] Therefore, do not assume it is suitable or permitted as KrimiMap's in-game AI provider until its terms and integration constraints are confirmed. Treat it as an optional candidate, not a requirement.
4. **ChatGPT API access:** ChatGPT subscription billing and API billing are separate; a ChatGPT subscription alone does not establish that the user has API access or a free API allowance.[2]
5. **AI media:** Decide whether AI image generation is required in the first editor release or may follow text/case assistance; confirm provider, asset rights, and prompt-data policy.
6. **Supported browsers/devices:** Set the minimum browser versions, viewport sizes, and representative mid-range phone for acceptance tests.
7. **Case format and storage:** Confirm the JSON candidate and compatibility/versioning policy.
8. **Content licensing:** Define separate licenses/terms for user-authored cases, generated assets, bundled art, and other third-party media; the application source code license is MIT.
9. **Game rules:** Define required deduction/question formats, scoring, hints, and the rules by which a case is considered solvable.
10. **Sharing:** Decide later whether users need online publishing/sharing or moderation; these are not required by the offline baseline.

## Sources

[1] https://opencode.ai/v2/docs/console/go — OpenCode Go: plans, API key, intended client traffic
[2] https://help.openai.com/en/articles/8156019-how-can-i-move-my-chatgpt-subscription-to-the-api — OpenAI: ChatGPT and API billing are separate
[3] https://webllm.mlc.ai/docs — WebLLM official docs: browser-local LLM inference using WebGPU
[4] https://huggingface.co/docs/transformers.js/en/index — Transformers.js official docs: browser inference and WebGPU caveats
[5] https://svelte.dev/docs/kit/adapter-static — SvelteKit: static site adapter
[6] https://phaser.io/phaser4 — Phaser official: Phaser 4 web game framework
