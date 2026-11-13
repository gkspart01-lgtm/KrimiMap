#!/usr/bin/env node
/**
 * Generate the service worker after the static build.
 *
 * `vite-plugin-pwa` cannot be used here: its `closeBundle` hook runs before
 * `adapter-static` writes `build/`, so the generated worker was deleted again by
 * the adapter, and SvelteKit never calls `transformIndexHtml`, which the plugin
 * needs for its manifest/registration injection. Running Workbox as an explicit
 * post-build step removes both problems and keeps the precache manifest honest:
 * it is computed from the finished `build/` directory.
 *
 *   node scripts/build-sw.mjs
 */
import { generateSW } from 'workbox-build';

const base = (process.env.PUBLIC_BASE_PATH ?? '').replace(/\/$/, '');
const MAX_CACHED_BYTES = 2 * 1024 * 1024;

const result = await generateSW({
	globDirectory: 'build',
	globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2,webmanifest,json}'],
	swDest: 'build/sw.js',
	// Assets above the Workbox limit are skipped instead of failing the build;
	// today that is only the WebLLM spike bundle, which is online-only by design.
	maximumFileSizeToCacheInBytes: MAX_CACHED_BYTES,
	// The site may be served from a sub-path (GitHub Pages project sites), so the
	// precached URLs need the same prefix the pages use.
	modifyURLPrefix: base ? { '': `${base}/` } : {},
	/**
	 * No `navigateFallback`: Workbox maps a navigation to the precached
	 * `<route>/index.html` itself (`directoryIndex`). A single fallback document
	 * would serve the root shell for `/editor/`, and its relative asset URLs then
	 * resolve below `/editor/` — every chunk 404s and the editor never boots.
	 */
	directoryIndex: 'index.html',
	cleanupOutdatedCaches: true,
	// Updates must wait for the user (see `register.ts`), but a first visit
	// should control the page immediately so "offline ready" means something.
	skipWaiting: false,
	clientsClaim: true
});

console.log(
	`PWA: ${result.count} entries precached (${(result.size / 1024).toFixed(0)} KiB) -> build/sw.js`
);
for (const warning of result.warnings) console.warn(`PWA warning: ${warning}`);
if (result.warnings.length > 0) {
	console.log('PWA: assets above the limit stay online-only; see docs/testing.md.');
}
