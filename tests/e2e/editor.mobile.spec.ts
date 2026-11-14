import { expect, test, type Page } from '@playwright/test';
import { dispatchTouch, readCamera, waitForMap } from './helpers';

const ZOOM_IN = 'Hineinzoomen';

async function zoomInUntilPannable(page: Page, clicks = 6) {
	for (let i = 0; i < clicks; i++) {
		await page.getByRole('button', { name: ZOOM_IN }).click();
	}
}

test('renders the shared map inside the phone viewport', async ({ page }) => {
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
});

test('a short drag at initial fit still tracks the finger', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);

	const before = await readCamera(page);
	const box = await page.getByTestId('map').boundingBox();
	if (!box) throw new Error('canvas has no box');
	const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
	const dx = 80;
	const dy = -80;

	await dispatchTouch(page, 'touchStart', [{ id: 1, x: start.x, y: start.y }]);
	for (let step = 1; step <= 4; step += 1) {
		await dispatchTouch(page, 'touchMove', [
			{ id: 1, x: start.x + (dx * step) / 4, y: start.y + (dy * step) / 4 }
		]);
	}
	await dispatchTouch(page, 'touchEnd', []);

	const after = await readCamera(page);
	expect((before.x - after.x) * before.zoom).toBeCloseTo(dx, 0);
	expect((before.y - after.y) * before.zoom).toBeCloseTo(dy, 0);
});

test('a one-finger drag pans the map and does not scroll the page', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await zoomInUntilPannable(page);

	const before = await readCamera(page);
	const box = await page.getByTestId('map').boundingBox();
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

	const box = await page.getByTestId('map').boundingBox();
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
	expect(Math.abs(worldAfter.x - worldUnderMidpoint.x)).toBeLessThanOrEqual(1);
	expect(Math.abs(worldAfter.y - worldUnderMidpoint.y)).toBeLessThanOrEqual(1);
});

test('pinching back together zooms out again', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await zoomInUntilPannable(page, 8);

	const box = await page.getByTestId('map').boundingBox();
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

test('a second pinch finger landing on a marker must not drag that marker', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await expect(page.getByTestId('entity-form')).toBeVisible();
	const coords = page.getByTestId('entity-form').locator('.coords');
	const beforeCoords = ((await coords.textContent()) ?? '').trim();
	const match = /x (\d+) · y (\d+)/.exec(beforeCoords);
	if (!match) throw new Error(`unexpected coords: ${beforeCoords}`);
	const entity = { x: Number(match[1]), y: Number(match[2]) };
	await page.getByRole('button', { name: 'Eigenschaften' }).click();

	const camera = await readCamera(page);
	const box = await page.getByTestId('map').boundingBox();
	if (!box) throw new Error('canvas has no box');
	const marker = {
		x: box.x + box.width / 2 + (entity.x - camera.x) * camera.zoom,
		y: box.y + box.height / 2 + (entity.y - camera.y) * camera.zoom
	};
	const emptyFinger = { x: marker.x + 100, y: marker.y };

	// Pointer 1 starts on empty map. Pointer 2 starts on the marker.
	await dispatchTouch(page, 'touchStart', [{ id: 1, ...emptyFinger }]);
	await dispatchTouch(page, 'touchStart', [
		{ id: 1, ...emptyFinger },
		{ id: 2, x: marker.x, y: marker.y }
	]);
	await dispatchTouch(page, 'touchMove', [
		{ id: 1, x: emptyFinger.x + 40, y: emptyFinger.y },
		{ id: 2, x: marker.x - 40, y: marker.y }
	]);
	await dispatchTouch(page, 'touchEnd', []);

	const after = await readCamera(page);
	expect(after.zoom).toBeGreaterThan(camera.zoom);

	// The empty-map first pointer cleared selection; re-tap the marker at its new
	// screen position and confirm the stored world coordinates did not change.
	const afterBox = await page.getByTestId('map').boundingBox();
	if (!afterBox) throw new Error('canvas has no box after pinch');
	const markerAfter = {
		x: afterBox.x + afterBox.width / 2 + (entity.x - after.x) * after.zoom,
		y: afterBox.y + afterBox.height / 2 + (entity.y - after.y) * after.zoom
	};
	await dispatchTouch(page, 'touchStart', [{ id: 3, ...markerAfter }]);
	await dispatchTouch(page, 'touchEnd', []);
	await expect(page.getByTestId('entity-form')).toBeVisible();
	await expect(coords).toHaveText(beforeCoords);
});

test('pinching over a marker zooms instead of dragging the marker', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);

	// A marker in the middle of the view; the panel shows its coordinates.
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await expect(page.getByTestId('entity-form')).toBeVisible();
	const coords = page.getByTestId('entity-form').locator('.coords');
	const before = ((await coords.textContent()) ?? '').trim();
	const match = /x (\d+) · y (\d+)/.exec(before);
	if (!match) throw new Error(`unexpected coords: ${before}`);
	const entity = { x: Number(match[1]), y: Number(match[2]) };

	// Close the drawer so both fingers land on the canvas.
	await page.getByRole('button', { name: 'Eigenschaften' }).click();

	const cameraBefore = await readCamera(page);
	const box = await page.getByTestId('map').boundingBox();
	if (!box) throw new Error('canvas has no box');
	const view = { width: box.width, height: box.height };
	// Where the marker actually is on screen — the finger has to land on it, not
	// merely near the view centre.
	const marker = {
		x: box.x + view.width / 2 + (entity.x - cameraBefore.x) * cameraBefore.zoom,
		y: box.y + view.height / 2 + (entity.y - cameraBefore.y) * cameraBefore.zoom
	};
	const spread = 30;

	// Finger 1 on the marker, finger 2 beside it, then spread: a pinch, not a drag.
	await dispatchTouch(page, 'touchStart', [
		{ id: 1, x: marker.x, y: marker.y },
		{ id: 2, x: marker.x + spread * 2, y: marker.y }
	]);
	for (const step of [1, 2, 3]) {
		await dispatchTouch(page, 'touchMove', [
			{ id: 1, x: marker.x - spread * step * 0.5, y: marker.y },
			{ id: 2, x: marker.x + spread * 2 + spread * step * 0.5, y: marker.y }
		]);
	}
	await dispatchTouch(page, 'touchEnd', []);

	const cameraAfter = await readCamera(page);
	expect(cameraAfter.zoom).toBeGreaterThan(cameraBefore.zoom);

	await page.getByRole('button', { name: 'Eigenschaften' }).click();
	await expect(coords).toHaveText(before);
});

test('the open mobile properties drawer stays above the map and clear of its toggle', async ({
	page
}) => {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL((url) => url.pathname.endsWith('/editor/') && url.searchParams.has('id'));
	await waitForMap(page);
	const panel = page.getByTestId('editor-panel');
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await expect(panel).toHaveClass(/open/);
	await expect(page.getByTestId('entity-form')).toBeVisible();
	await panel.evaluate(async (element) => {
		await Promise.all(element.getAnimations().map((animation) => animation.finished));
	});

	const layering = await page.evaluate(() => {
		const drawer = document.querySelector('[data-testid="editor-panel"]')!;
		const panelRect = drawer.getBoundingClientRect();
		const marker = document.querySelector('.krimimap-map-marker')!;
		const markerRect = marker.getBoundingClientRect();
		const hit = document.elementFromPoint(
			markerRect.left + markerRect.width / 2,
			markerRect.top + markerRect.height / 2
		);
		return {
			markerOverlapsDrawer:
				markerRect.left < panelRect.right &&
				markerRect.right > panelRect.left &&
				markerRect.top < panelRect.bottom &&
				markerRect.bottom > panelRect.top,
			topmostPointBelongsToDrawer: drawer.contains(hit)
		};
	});
	expect(layering.markerOverlapsDrawer).toBe(true);
	expect(layering.topmostPointBelongsToDrawer).toBe(true);

	const geometry = await page.evaluate(() => {
		const drawer = document.querySelector('[data-testid="editor-panel"]')!.getBoundingClientRect();
		const button = document.querySelector('.panel-toggle')!.getBoundingClientRect();
		return {
			overlap: Math.max(
				0,
				Math.min(drawer.bottom, button.bottom) - Math.max(drawer.top, button.top)
			),
			drawer: drawer.toJSON(),
			button: button.toJSON(),
			viewport: { height: innerHeight },
			workspace: document.querySelector('.workspace')!.getBoundingClientRect().toJSON()
		};
	});
	expect(geometry.overlap, JSON.stringify(geometry)).toBe(0);
});

test('touch tap selects a marker and a second tap on empty map clears it', async ({ page }) => {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL((url) => url.pathname.endsWith('/editor/') && url.searchParams.has('id'));
	await waitForMap(page);

	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await expect(page.getByTestId('entity-form')).toBeVisible();
	const coords = page.getByTestId('entity-form').locator('.coords');
	const text = (await coords.textContent()) ?? '';
	const match = /x ([0-9]+) · y ([0-9]+)/.exec(text);
	if (!match) throw new Error(`unexpected marker coordinates: ${text}`);
	const world = { x: Number(match[1]), y: Number(match[2]) };

	// Close the properties drawer; tap an empty spot to deselect.
	await page.getByRole('button', { name: 'Eigenschaften' }).click();
	const box = await page.getByTestId('map').boundingBox();
	if (!box) throw new Error('canvas has no box');
	const t = (type: 'touchStart' | 'touchEnd', points: { id: number; x: number; y: number }[]) =>
		dispatchTouch(page, type, points);
	await t('touchStart', [{ id: 7, x: box.x + 40, y: box.y + 80 }]);
	await t('touchEnd', []);
	await expect(page.getByTestId('entity-form')).toHaveCount(0);

	// Recompute the screen point from the live camera, then tap the marker.
	const camera = await readCamera(page);
	const marker = {
		x: box.x + box.width / 2 + (world.x - camera.x) * camera.zoom,
		y: box.y + box.height / 2 + (world.y - camera.y) * camera.zoom
	};
	await t('touchStart', [{ id: 8, ...marker }]);
	await t('touchEnd', []);
	await expect(page.getByTestId('entity-form')).toBeVisible();
	await expect(page.getByTestId('entity-form').locator('.coords')).toHaveText(text);
});
