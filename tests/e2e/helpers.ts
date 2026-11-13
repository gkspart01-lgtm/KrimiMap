import { expect, type CDPSession, type Page } from '@playwright/test';

const sessions = new WeakMap<Page, CDPSession>();

export interface CameraReading {
	x: number;
	y: number;
	zoom: number;
}

/** Read the camera the map publishes on its container element. */
export async function readCamera(page: Page): Promise<CameraReading> {
	const map = page.getByTestId('map');
	await expect(map).toHaveAttribute('data-zoom', /\d/);
	const [x, y, zoom] = await map.evaluate((element) => [
		Number(element.dataset.cameraX),
		Number(element.dataset.cameraY),
		Number(element.dataset.zoom)
	]);
	return { x, y, zoom };
}

/** Wait until the Phaser canvas has booted and published a camera. */
export async function waitForMap(page: Page): Promise<CameraReading> {
	await expect(page.locator('canvas')).toBeVisible();
	await expect(page.getByTestId('map')).toHaveAttribute('data-zoom', /\d/, { timeout: 20_000 });
	return readCamera(page);
}

export interface TouchPoint {
	id: number;
	x: number;
	y: number;
}

/**
 * Dispatch a real multi-touch gesture through the DevTools protocol. Playwright's
 * `touchscreen` helper only taps, so pinch has to go through CDP.
 */
export async function dispatchTouch(
	page: Page,
	type: 'touchStart' | 'touchMove' | 'touchEnd',
	points: TouchPoint[]
): Promise<void> {
	// One session per page: Chromium tracks the touch stream per CDP session, so a
	// fresh session per call makes `touchMove` fail with "Must send a TouchStart
	// first".
	let client = sessions.get(page);
	if (!client) {
		client = await page.context().newCDPSession(page);
		sessions.set(page, client);
	}
	await client.send('Input.dispatchTouchEvent', {
		type,
		touchPoints: points.map((point) => ({
			x: point.x,
			y: point.y,
			id: point.id,
			radiusX: 5,
			radiusY: 5,
			force: 1
		}))
	});
}

/** Collect console errors and page crashes so a test can assert "nothing broke". */
export function collectProblems(page: Page): string[] {
	const problems: string[] = [];
	page.on('console', (message) => {
		if (message.type() === 'error') problems.push(`console: ${message.text()}`);
	});
	page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
	page.on('requestfailed', (request) => {
		problems.push(`requestfailed: ${request.url()} ${request.failure()?.errorText ?? ''}`);
	});
	return problems;
}
