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

- **FR-14 — Optional AI integration (Should):** Where a compatible provider is configured, creators should be able to request suggestions or drafts for case text, characters, objects, scenes, and timelines from within the editor.
- **FR-15 — Human approval (Must):** AI output shall be shown for review and editing before it changes saved case content. It shall never silently overwrite a creator's work.
- **FR-16 — Graceful absence (Must):** The editor and player workflows shall remain usable when no AI credentials are configured, a provider is unavailable, or a request fails.
- **FR-17 — User-provided credentials (Must):** AI shall use credentials supplied by the user. Credentials shall not be committed to the repository, embedded in a public client bundle, or transmitted except to the provider selected by the user.
- **FR-18 — Provider choice and cost consent (Must):** The application shall make the selected provider/model and any known cost or usage limits visible. It shall not switch to another provider, enable paid usage, or submit prompts without the user's explicit action.
- **FR-19 — Data disclosure (Must):** Before the first cloud request, the application shall explain what prompt and case data will be sent to the selected provider and let the user cancel.

## 5. Quality and platform requirements

- **NFR-01 — Mobile-first:** Core editor and player workflows shall adapt to phone, tablet, and desktop layouts and support touch as well as mouse/keyboard input.
- **NFR-02 — Performance:** Map navigation and ordinary editor interactions shall remain responsive on representative mid-range phones. Exact test devices, map size, entity count, and response-time thresholds are open decisions and must be set before performance acceptance.
- **NFR-03 — PWA/offline:** The application should be installable as a Progressive Web App. A case that has been saved or explicitly made available offline should remain playable without a network connection; cloud AI features may be unavailable offline.
- **NFR-04 — Persistence and portability:** A creator shall be able to keep local work and export it so that it is not dependent on a single hosted account or service. Cloud sync is not assumed for the first release.
- **NFR-05 — Open-source dependencies:** Core application software and required libraries shall use open-source licenses compatible with the project license. Licenses and material third-party assets shall be documented; dependency maintenance and community activity shall be reviewed before adoption.
- **NFR-06 — Security:** Secrets shall not appear in source control, logs, exported case files, or client assets. Credential handling and storage must be reviewed before implementation; browser-side storage shall not be described as secret from the device owner.
- **NFR-07 — Localization:** User-facing text shall be separable from game logic and support German and English at minimum.
- **NFR-08 — Extensibility:** Map data, case rules, presentation, editor UI, and optional AI-provider integration should be separable enough to evolve without tying authored cases to a single provider or renderer.

## 6. Candidate technical direction (not a commitment)

Existing planning material names Phaser 4, Svelte 5/SvelteKit, Vite, WebGL, Tiled JSON, and local storage with possible later cloud storage. These may be reused only if they satisfy the requirements above, have suitable open-source licenses and active communities, and pass a small technical validation before adoption. No programming language, framework, map format, database, or AI vendor is selected by this specification.

The AI integration should be provider-agnostic at the product boundary. A provider adapter is a candidate design; it must not make the application unusable when a provider changes terms, becomes unavailable, or charges for use.

## 7. Acceptance criteria for the first editor-led release

The first release is acceptable when all of the following are demonstrated:

- **AC-01:** A creator can start a case, create or load a map, and add, move, edit, and remove at least characters, objects, and clues.
- **AC-02:** Pan and zoom work on a touch device and with desktop input.
- **AC-03:** A creator can undo and redo representative map/entity edits.
- **AC-04:** A case can be saved, closed, reloaded, and exported/imported without losing its required content.
- **AC-05:** Validation reports configured missing fields or invalid references and explains how to fix them.
- **AC-06:** A creator can playtest a case and return to the editor.
- **AC-07:** With AI disabled and no credentials present, the editor and playtest remain usable and do not make network calls to an AI provider.
- **AC-08:** If AI is enabled in a later release, a generated suggestion is reviewable and editable before application; a failed request leaves the case unchanged.
- **AC-09:** The repository's core application and required dependencies pass a license review against the project's chosen open-source license.

Specific browser versions, screen sizes, map scale, entity counts, performance limits, and offline installation targets must be agreed before final release acceptance.

## 8. Open decisions

1. **AI provider and price ceiling:** Which providers are acceptable for player/creator-facing requests, and what maximum recurring or per-use cost is acceptable? Free tiers can change or be limited, so free availability must not be a product dependency.
2. **OpenCode Go:** The official documentation describes OpenCode Go as a paid subscription (currently listing Go at $10/month and Go Plus at $40/month), with API-key setup, and describes its intended traffic as coding-agent requests.[1] Therefore, do not assume it is suitable or permitted as KrimiMap's in-game AI provider until its terms and integration constraints are confirmed. Treat it as an optional candidate, not a requirement.
3. **ChatGPT API access:** ChatGPT subscription billing and API billing are separate; a ChatGPT subscription alone does not establish that the user has API access or a free API allowance.[2]
4. **AI media:** Decide whether AI image generation is required in the first editor release or may follow text/case assistance; confirm provider, asset rights, and prompt-data policy.
5. **Supported browsers/devices:** Set the minimum browser versions, viewport sizes, and representative mid-range phone for acceptance tests.
6. **Case format and storage:** Confirm the JSON candidate, compatibility/versioning policy, and whether any account-based cloud sync is needed later.
7. **Project and content licensing:** Existing project notes state MIT, but confirm the intended license for application code, user-authored cases, generated assets, and bundled art before release.
8. **Game rules:** Define required deduction/question formats, scoring, hints, and the rules by which a case is considered solvable.
9. **Sharing and accounts:** Decide whether creators need accounts, online publishing/sharing, multiplayer, or moderation; none is required by this baseline.

## Sources

[1] https://opencode.ai/v2/docs/console/go — OpenCode Go: plans, API key, intended client traffic
[2] https://help.openai.com/en/articles/8156019-how-can-i-move-my-chatgpt-subscription-to-the-api — OpenAI: ChatGPT and API billing are separate
