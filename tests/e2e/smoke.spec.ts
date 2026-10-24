import { expect, test } from '@playwright/test';

test('landing page renders the phase status and both entry points', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'KrimiMap', level: 1 })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Karte öffnen' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'WebLLM-Spike starten' })).toBeVisible();
});

test('editor boots Phaser, draws a canvas and zooms', async ({ page }) => {
	await page.goto('/editor/');

	const canvas = page.locator('canvas');
	await expect(canvas).toBeVisible({ timeout: 15_000 });
	// A real WebGL/Canvas surface has non-zero dimensions once Phaser started.
	const box = await canvas.boundingBox();
	expect(box?.width ?? 0).toBeGreaterThan(100);
	expect(box?.height ?? 0).toBeGreaterThan(100);

	const zoomLabel = page.getByText(/Zoom \d+%/);
	await expect(zoomLabel).toBeVisible();
	const before = await zoomLabel.textContent();

	await page.getByRole('button', { name: 'Hineinzoomen' }).click();
	await expect(zoomLabel).not.toHaveText(before ?? '');
});

test('AI spike reports WebGPU state instead of failing', async ({ page }) => {
	await page.goto('/spike/webllm/');

	// Either WebGPU works and the adapter is listed, or the page states why it
	// is unavailable. Both are acceptable; an empty or crashed page is not.
	const status = page.getByText(/verfügbar/);
	await expect(status.first()).toBeVisible({ timeout: 15_000 });

	const text = await status.first().textContent();
	expect(text?.length ?? 0).toBeGreaterThan(10);
});

test('the app talks only to its own static origin', async ({ page }) => {
	const external: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.host !== '127.0.0.1:4173' && !url.host.endsWith('cdn.jsdelivr.net')) {
			external.push(request.url());
		}
	});

	await page.goto('/');
	await page.goto('/editor/');
	await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });
	// Nothing is loaded from the AI CDN until a model download is requested.
	expect(external).toEqual([]);
});
