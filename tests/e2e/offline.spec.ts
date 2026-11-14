import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { collectProblems, waitForMap } from './helpers';

/**
 * Phase 1 exit gate: load the built app once, go offline, reload, open the
 * editor. The service worker has to serve every route, chunk and icon from its
 * own cache — and nothing may leave the app origin.
 *
 * One deliberate exception: the WebLLM spike bundles ~6 MB of model runtime, so
 * it stays out of the precache (see `scripts/build-sw.mjs`). That page is
 * online-only; the shell and the editor are not.
 */

const ORIGIN = 'http://127.0.0.1:4173';

async function expectSharedMapArtLoaded(page: Page): Promise<void> {
	const image = page.getByTestId('map').locator('img.leaflet-image-layer');
	await expect(image).toBeVisible();
	await expect
		.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth))
		.toBeGreaterThan(0);
}

async function primeShell(page: Page): Promise<void> {
	await page.goto('/');

	// `ready` resolves once the worker is active and, through `clientsClaim`, in
	// control of the page.
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
}

test('the app reloads and opens the editor with the network disabled', async ({
	page,
	context
}) => {
	const problems = collectProblems(page);
	await primeShell(page);

	await context.setOffline(true);

	await page.goto('/?utm_source=playtest');
	await expect(page.getByRole('heading', { level: 1 })).toContainText('KrimiMap');
	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.getByRole('heading', { level: 1 })).toContainText('KrimiMap');
	await expect(page.getByTestId('connection-status')).toHaveAttribute('data-connection', 'offline');
	await expect(page.getByTestId('connection-status')).toHaveAttribute('data-offline-ready', 'true');

	// Client-side navigation loads Leaflet and the map image from the offline cache.
	await page.getByRole('link', { name: 'Editor' }).click();
	await expect(page).toHaveURL(/\/editor\/\?id=/);
	const camera = await waitForMap(page);
	await expectSharedMapArtLoaded(page);
	expect(camera.zoom).toBeGreaterThan(0);

	// A direct visit — a fresh navigation, not client-side routing — works offline
	// too, which is what a bookmarked or installed editor does on a cold start.
	await page.goto('/editor/');
	await waitForMap(page);
	await expectSharedMapArtLoaded(page);

	expect(problems, problems.join('\n')).toEqual([]);
});

test('serves the manifest and the icon set from the same origin', async ({ page }) => {
	await primeShell(page);

	const href = await page.locator('link[rel="manifest"]').getAttribute('href');
	expect(href, 'the build must link a web app manifest').toBeTruthy();

	const response = await page.request.get(new URL(href!, page.url()).toString());
	expect(response.ok()).toBe(true);
	const manifest = await response.json();
	expect(manifest.name).toBe('KrimiMap');
	expect(manifest.display).toBe('standalone');
	expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toContain('512x512');

	for (const icon of manifest.icons as { src: string }[]) {
		const iconResponse = await page.request.get(new URL(icon.src, page.url()).toString());
		expect(iconResponse.ok(), `icon ${icon.src} must exist`).toBe(true);
	}
});

test('a service-worker update keeps locally saved cases', async ({ page }) => {
	const workerPath = resolve(process.cwd(), 'build/sw.js');
	const originalScript = await readFile(workerPath, 'utf8');
	try {
		await primeShell(page);
		await page.getByRole('link', { name: 'Fälle' }).click();
		await page.waitForURL((url) => url.pathname.endsWith('/cases/'));
		await page.getByRole('button', { name: 'Neuer Fall' }).click();
		await page.waitForURL((url) => url.pathname.endsWith('/editor/') && url.searchParams.has('id'));
		await waitForMap(page);
		await page.getByRole('textbox', { name: 'Titel des Falls' }).fill('Bleibt lokal erhalten');
		await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');

		// Change only the worker bytes. The static server serves from build/ on
		// every request, so registration.update() installs a waiting successor.
		await writeFile(workerPath, `${originalScript}\n// Playwright update probe`);
		await page.evaluate(async () => {
			const registration = await navigator.serviceWorker.getRegistration();
			if (!registration) throw new Error('service worker registration missing');
			await registration.update();
		});
		await expect
			.poll(() =>
				page.evaluate(async () => {
					const registration = await navigator.serviceWorker.getRegistration();
					return registration?.waiting?.state ?? 'none';
				})
			)
			.toBe('installed');

		await expect(page.getByTestId('pwa-banner')).toHaveAttribute('data-phase', 'update-available');
		await page.getByRole('button', { name: 'Neu laden' }).click();
		await waitForMap(page);
		await expect(page.getByRole('textbox', { name: 'Titel des Falls' })).toHaveValue(
			'Bleibt lokal erhalten'
		);
	} finally {
		await writeFile(workerPath, originalScript);
	}
});

test('issues no requests outside its own origin', async ({ page }) => {
	const foreign: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.protocol === 'data:' || url.protocol === 'blob:') return;
		if (url.origin !== ORIGIN) foreign.push(url.href);
	});

	await primeShell(page);
	await page.getByRole('link', { name: 'Editor' }).click();
	await waitForMap(page);

	expect(foreign, `unexpected external requests: ${foreign.join(', ')}`).toEqual([]);
});
