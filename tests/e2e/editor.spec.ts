import { expect, test, type Page } from '@playwright/test';
import { clickRepeatedly, collectProblems, readCamera, waitForMap } from './helpers';

/** Zoom in until the map is larger than the viewport, so panning has room. */
async function zoomInUntilPannable(page: Page, clicks = 4) {
	await clickRepeatedly(page, 'Hineinzoomen', clicks);
}

test('renders the shared map to the edge of its container', async ({ page }) => {
	const problems = collectProblems(page);
	await page.goto('/editor/');
	await waitForMap(page);

	const sizes = await page.getByTestId('map').evaluate((element) => {
		const rect = element.getBoundingClientRect();
		const image = element.querySelector('img.leaflet-image-layer') as HTMLImageElement | null;
		return {
			width: rect.width,
			height: rect.height,
			imageLoaded: Boolean(image?.complete && image.naturalWidth > 0)
		};
	});

	expect(sizes.width).toBeGreaterThan(300);
	expect(sizes.height).toBeGreaterThan(300);
	expect(sizes.imageLoaded).toBe(true);
	expect(problems).toEqual([]);
});

test('dragging the map follows the pointer exactly', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await zoomInUntilPannable(page);

	const before = await readCamera(page);
	const box = await page.getByTestId('map').boundingBox();
	if (!box) throw new Error('canvas has no box');

	const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	await page.mouse.move(start.x, start.y);
	await page.mouse.down();
	await page.mouse.move(start.x + 200, start.y + 100, { steps: 10 });
	await page.mouse.up();

	const after = await readCamera(page);
	// Content follows the pointer: the camera moves the opposite way in world units.
	expect(before.x - after.x).toBeCloseTo(200 / before.zoom, 0);
	expect(before.y - after.y).toBeCloseTo(100 / before.zoom, 0);
	expect(after.zoom).toBeCloseTo(before.zoom, 4);
});

test('the zoom buttons scale by 1.25 per step and stay inside the limits', async ({ page }) => {
	// ~28 clicks, each redrawing a WebGL canvas: under software rendering in CI
	// that is slower than the default budget, and the assertion is about limits,
	// not about speed.
	test.setTimeout(90_000);
	await page.goto('/editor/');
	const initial = await waitForMap(page);

	// The camera reaches the DOM through Svelte's reactive update, so the reading
	// right after a click can still be the previous one — poll instead of sampling
	// once, otherwise this test fails only under load.
	await page.getByRole('button', { name: 'Hineinzoomen' }).click();
	await expect.poll(async () => (await readCamera(page)).zoom / initial.zoom).toBeCloseTo(1.25, 3);

	await clickRepeatedly(page, 'Hineinzoomen', 10);
	await expect.poll(async () => (await readCamera(page)).zoom).toBeLessThanOrEqual(4.0001);

	await clickRepeatedly(page, 'Herauszoomen', 17);
	await expect.poll(async () => (await readCamera(page)).zoom).toBeGreaterThanOrEqual(0.1499);
});

test('the map fits back to the whole map', async ({ page }) => {
	await page.goto('/editor/');
	const initial = await waitForMap(page);
	await zoomInUntilPannable(page);

	await page.getByRole('button', { name: 'Ganze Karte' }).click();
	const fitted = await readCamera(page);
	expect(fitted.zoom).toBeCloseTo(initial.zoom, 4);
	expect(fitted.x).toBeCloseTo(initial.x, 1);
});

test('the wheel zooms around the pointer', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await zoomInUntilPannable(page);

	const box = await page.getByTestId('map').boundingBox();
	if (!box) throw new Error('canvas has no box');
	const anchor = { x: box.x + box.width * 0.25, y: box.y + box.height * 0.25 };

	const before = await readCamera(page);
	await page.mouse.move(anchor.x, anchor.y);
	await page.mouse.wheel(0, -240);
	await page.waitForFunction(
		({ previous }) =>
			Number(document.querySelector('[data-testid=map]')?.getAttribute('data-zoom')) > previous,
		{ previous: before.zoom }
	);

	const after = await readCamera(page);
	expect(after.zoom).toBeGreaterThan(before.zoom);

	// The world point under the cursor must not slide away.
	const worldBefore = {
		x: (anchor.x - box.x - box.width / 2) / before.zoom + before.x,
		y: (anchor.y - box.y - box.height / 2) / before.zoom + before.y
	};
	const worldAfter = {
		x: (anchor.x - box.x - box.width / 2) / after.zoom + after.x,
		y: (anchor.y - box.y - box.height / 2) / after.zoom + after.y
	};
	expect(worldAfter.x).toBeCloseTo(worldBefore.x, 0);
	expect(worldAfter.y).toBeCloseTo(worldBefore.y, 0);
});

test('a drag that starts on the info panel still moves the map', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await zoomInUntilPannable(page);

	const hud = page.getByTestId('map-hud');
	const hudBox = await hud.boundingBox();
	if (!hudBox) throw new Error('hud not visible');

	const before = await readCamera(page);
	await page.mouse.move(hudBox.x + 5, hudBox.y + 5);
	await page.mouse.down();
	await page.mouse.move(hudBox.x + 5, hudBox.y + 105, { steps: 5 });
	await page.mouse.up();

	const after = await readCamera(page);
	expect(before.y - after.y).toBeGreaterThan(10);
});
