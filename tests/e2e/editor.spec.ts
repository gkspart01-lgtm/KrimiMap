import { expect, test, type Page } from '@playwright/test';
import { collectProblems, readCamera, waitForMap } from './helpers';

/** Zoom in until the map is larger than the viewport, so panning has room. */
async function zoomInUntilPannable(page: Page, clicks = 4) {
	for (let i = 0; i < clicks; i++) {
		await page.getByRole('button', { name: 'Hineinzoomen' }).click();
	}
}

test('canvas fills its container at device resolution', async ({ page }) => {
	const problems = collectProblems(page);
	await page.goto('/editor/');
	await waitForMap(page);

	const sizes = await page.locator('canvas').evaluate((element) => {
		const canvas = element as HTMLCanvasElement;
		const rect = canvas.getBoundingClientRect();
		return {
			backingWidth: canvas.width,
			backingHeight: canvas.height,
			cssWidth: rect.width,
			cssHeight: rect.height,
			dpr: window.devicePixelRatio
		};
	});

	expect(sizes.cssWidth).toBeGreaterThan(300);
	expect(sizes.backingWidth).toBeCloseTo(sizes.cssWidth * Math.min(sizes.dpr, 3), 0);
	expect(sizes.backingHeight).toBeCloseTo(sizes.cssHeight * Math.min(sizes.dpr, 3), 0);
	expect(problems).toEqual([]);
});

test('dragging the map follows the pointer exactly', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await zoomInUntilPannable(page);

	const before = await readCamera(page);
	const box = await page.locator('canvas').boundingBox();
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
	await page.goto('/editor/');
	const initial = await waitForMap(page);

	// The camera reaches the DOM through Svelte's reactive update, so the reading
	// right after a click can still be the previous one — poll instead of sampling
	// once, otherwise this test fails only under load.
	await page.getByRole('button', { name: 'Hineinzoomen' }).click();
	await expect.poll(async () => (await readCamera(page)).zoom / initial.zoom).toBeCloseTo(1.25, 3);

	for (let i = 0; i < 12; i++) {
		await page.getByRole('button', { name: 'Hineinzoomen' }).click();
	}
	await expect.poll(async () => (await readCamera(page)).zoom).toBeLessThanOrEqual(4.0001);

	for (let i = 0; i < 25; i++) {
		await page.getByRole('button', { name: 'Herauszoomen' }).click();
	}
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

	const box = await page.locator('canvas').boundingBox();
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

	const hud = page.getByText('Ziehen = verschieben · Mausrad / zwei Finger = zoomen');
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
