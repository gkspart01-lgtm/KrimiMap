# Third-party notices

KrimiMap's own source code is MIT licensed (see [`LICENSE`](LICENSE)). This file
tracks the third-party software, model weights and assets that are used or
bundled, so licence obligations and attribution stay visible as the project
grows. Entries are added when a dependency is introduced, not at release time.

## Runtime dependencies

| Package                                              | Version | Licence    | Why it is used                                                              |
| ---------------------------------------------------- | ------- | ---------- | --------------------------------------------------------------------------- |
| [phaser](https://phaser.io/)                         | 4.2.1   | MIT        | Map rendering, camera, pointer input on the canvas.                         |
| [@mlc-ai/web-llm](https://github.com/mlc-ai/web-llm) | 0.2.86  | Apache-2.0 | Browser-local LLM inference over WebGPU, loaded only on the AI spike route. |

## Build and test dependencies

| Package                                                                                       | Version | Licence    |
| --------------------------------------------------------------------------------------------- | ------- | ---------- |
| [svelte](https://svelte.dev/)                                                                 | 5.57.2  | MIT        |
| [@sveltejs/kit](https://svelte.dev/docs/kit)                                                  | 3.1.0   | MIT        |
| [@sveltejs/adapter-static](https://github.com/sveltejs/kit/tree/main/packages/adapter-static) | 4.0.0   | MIT        |
| [@sveltejs/vite-plugin-svelte](https://github.com/sveltejs/vite-plugin-svelte)                | 7.3.1   | MIT        |
| [vite](https://vite.dev/)                                                                     | 8.3.5   | MIT        |
| [vitest](https://vitest.dev/)                                                                 | 5.0.5   | MIT        |
| [typescript](https://www.typescriptlang.org/)                                                 | 6.0.3   | Apache-2.0 |
| [svelte-check](https://github.com/sveltejs/language-tools)                                    | 4.7.7   | MIT        |
| [prettier](https://prettier.io/)                                                              | 3.9.10  | MIT        |
| [prettier-plugin-svelte](https://github.com/sveltejs/prettier-plugin-svelte)                  | 4.1.1   | MIT        |
| [@playwright/test](https://playwright.dev/)                                                   | 1.64.1  | Apache-2.0 |

## Model weights

Model weights are **not** bundled with the application. The AI spike downloads
them in the browser on explicit user action, and each model carries its own
licence:

| Model                              | Licence                     | Used in                     |
| ---------------------------------- | --------------------------- | --------------------------- |
| SmolLM2-360M-Instruct (q4f16, MLC) | Apache-2.0                  | AI spike, default candidate |
| Qwen3.5-0.8B (q4f16, MLC)          | Apache-2.0                  | AI spike                    |
| Llama-3.2-1B-Instruct (q4f16, MLC) | Llama 3.2 Community License | AI spike                    |

A runtime library's licence never covers model weights. Re-check the exact model
licence before any of them becomes a default in a shipped feature, and record
the outcome here.

## Bundled assets

| Asset                | Source                   | Licence                      |
| -------------------- | ------------------------ | ---------------------------- |
| `static/favicon.svg` | Created for this project | MIT (same as the repository) |

No third-party art, tilesets, fonts or audio are bundled yet. Any asset added
later must be listed here with its origin and licence before it is committed.
