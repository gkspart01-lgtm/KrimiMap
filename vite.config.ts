import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

/**
 * The app ships as plain static files (no server, no API). GitHub Pages serves
 * this repository under a sub-path, so the base path comes from the environment
 * instead of being hard-coded.
 */
const base = (process.env.PUBLIC_BASE_PATH ?? '') as '' | `/${string}`;

export default defineConfig({
	plugins: [
		sveltekit({
			adapter: adapter({
				pages: 'build',
				assets: 'build',
				precompress: false,
				strict: true
			}),
			paths: { base },
			prerender: { entries: ['*'] }
		})
	],
	test: {
		include: ['tests/unit/**/*.test.ts'],
		environment: 'node',
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			/**
			 * Only the framework-free modules are measured here. Browser adapters
			 * (`createEditorGame`, the WebLLM runtime) cannot run in Node and are
			 * covered by the Playwright suite instead.
			 */
			include: [
				'src/lib/game/camera.ts',
				'src/lib/game/map-controller.ts',
				'src/lib/ai/contracts/case-draft.ts'
			],
			thresholds: {
				lines: 95,
				statements: 95,
				functions: 95,
				branches: 85
			}
		}
	}
});
