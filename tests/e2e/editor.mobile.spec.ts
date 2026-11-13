import { expect, test, type Page } from '@playwright/test';
import { dispatchTouch, readCamera, waitForMap } from './helpers';

const ZOOM_IN = 'Hineinzoomen';

async function zoomInUntilPannable(page: Page, clicks = 6) {
	for (let i = 0; i < clicks; i++) {
		await page.getByRole('button', { name: ZOOM_IN }).click();
	}
}

test('renders the canvas at the phone pixel ratio', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);

	const sizes = await page.locator('canvas').evaluate((element) => {
		const canvas = element as HTMLCanvasElement;
		const rect = canvas.getBoundingClientRect();
		return {
			backingWidth: canvas.width,
			cssWidth: rect.width,
			dpr: window.devicePixelRatio
		};
	});

	expect(sizes.dpr).toBeGreaterThan(1);
	expect(sizes.backingWidth).toBeCloseTo(sizes.cssWidth * Math.min(sizes.dpr, 3), 0);
});

test('a one-finger drag pans the map and does not scroll the page', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await zoomInUntilPannable(page);

	const before = await readCamera(page);
	const box = await page.locator('canvas').boundingBox();
	if (!box) throw new Error('canvas has no box');
	const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

	// Drag upwards: the lower half of a phone screen is the editor panel, so a
	// downward gesture would start on a DOM control instead of the canvas.
	await dispatchTouch(page, 'touchStart', [{ id: 1, x: start.x, y: start.y }]);
	await dispatchTouch(page, 'touchMove', [{ id: 1, x: start.x, y: start.y - 120 }]);
	await dispatchTouch(page, 'touchEnd', []);

	const after = await readCamera(page);
	expect(after.y - before.y).toBeCloseTo(120 / before.zoom, 0);
	expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
});

test('pinching with two fingers zooms in around the finger midpoint', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await zoomInUntilPannable(page);

	const box = await page.locator('canvas').boundingBox();
	if (!box) throw new Error('canvas has no box');
	const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	const spread = 40;

	const before = await readCamera(page);
	const worldUnderMidpoint = {
		x: (centre.x - box.x - box.width / 2) / before.zoom + before.x,
		y: (centre.y - box.y - box.height / 2) / before.zoom + before.y
	};

	await dispatchTouch(page, 'touchStart', [
		{ id: 1, x: centre.x - spread, y: centre.y },
		{ id: 2, x: centre.x + spread, y: centre.y }
	]);

	// Spread the fingers in a few steps, the way a real gesture arrives.
	for (const step of [1, 2, 3]) {
		await dispatchTouch(page, 'touchMove', [
			{ id: 1, x: centre.x - spread * (1 + step * 0.5), y: centre.y },
			{ id: 2, x: centre.x + spread * (1 + step * 0.5), y: centre.y }
		]);
	}
	await dispatchTouch(page, 'touchEnd', []);

	const after = await readCamera(page);
	// Span goes from 80 px to 200 px → 2.5×.
	expect(after.zoom / before.zoom).toBeGreaterThan(2);
	expect(after.zoom / before.zoom).toBeCloseTo(2.5, 1);

	const worldAfter = {
		x: (centre.x - box.x - box.width / 2) / after.zoom + after.x,
		y: (centre.y - box.y - box.height / 2) / after.zoom + after.y
	};
	expect(worldAfter.x).toBeCloseTo(worldUnderMidpoint.x, 0);
	expect(worldAfter.y).toBeCloseTo(worldUnderMidpoint.y, 0);
});

test('pinching back together zooms out again', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await zoomInUntilPannable(page, 8);

	const box = await page.locator('canvas').boundingBox();
	if (!box) throw new Error('canvas has no box');
	const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

	const before = await readCamera(page);
	await dispatchTouch(page, 'touchStart', [
		{ id: 1, x: centre.x - 150, y: centre.y },
		{ id: 2, x: centre.x + 150, y: centre.y }
	]);
	await dispatchTouch(page, 'touchMove', [
		{ id: 1, x: centre.x - 60, y: centre.y },
		{ id: 2, x: centre.x + 60, y: centre.y }
	]);
	await dispatchTouch(page, 'touchEnd', []);

	const after = await readCamera(page);
	expect(after.zoom).toBeLessThan(before.zoom);
});
