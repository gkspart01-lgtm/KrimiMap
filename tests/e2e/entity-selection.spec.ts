import { expect, test, type Page } from '@playwright/test';
import { readCamera, waitForMap } from './helpers';

async function createCaseOnMap(page: Page) {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL(/\/editor\/\?id=/);
	await waitForMap(page);
	await expect(page.getByTestId('editor-panel')).toBeVisible();
}

function markerScreenPoint(
	box: { x: number; y: number; width: number; height: number },
	camera: { x: number; y: number; zoom: number },
	world: { x: number; y: number }
) {
	return {
		x: box.x + box.width / 2 + (world.x - camera.x) * camera.zoom,
		y: box.y + box.height / 2 + (world.y - camera.y) * camera.zoom
	};
}

function markerWorldPoint(text: string): { x: number; y: number } {
	const match = /x (\d+) · y (\d+)/.exec(text);
	if (!match) throw new Error(`unexpected marker coordinates: ${text}`);
	return { x: Number(match[1]), y: Number(match[2]) };
}

test('mouse click selects a marker, clicking empty map clears selection', async ({ page }) => {
	await createCaseOnMap(page);
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await expect(page.getByTestId('entity-form')).toBeVisible();

	const name = page.getByTestId('entity-form').getByRole('textbox').first();
	await name.fill('Messerspur');
	const point = markerWorldPoint(
		(await page.getByTestId('entity-form').locator('.coords').textContent()) ?? ''
	);

	// Click empty canvas space to clear the selection before selecting the marker.
	const canvas = page.getByTestId('map');
	const box = await canvas.boundingBox();
	if (!box) throw new Error('canvas has no box');
	await page.mouse.click(box.x + 40, box.y + 80);
	await expect(page.getByTestId('entity-form')).toHaveCount(0);

	const camera = await readCamera(page);
	const marker = markerScreenPoint(box, camera, point);
	await page.mouse.click(marker.x, marker.y);
	await expect(page.getByTestId('entity-form')).toBeVisible();
	await expect(page.getByTestId('entity-form').getByRole('textbox').first()).toHaveValue(
		'Messerspur'
	);
});

test('dragging an active marker updates its shared-map coordinates', async ({ page }) => {
	await createCaseOnMap(page);
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await expect(page.getByTestId('entity-form')).toBeVisible();

	const coords = page.getByTestId('entity-form').locator('.coords');
	const beforeText = (await coords.textContent()) ?? '';
	const before = markerWorldPoint(beforeText);
	const marker = page.locator('[data-case-layer="active"]').first();
	const box = await marker.boundingBox();
	if (!box) throw new Error('active marker has no rendered position');

	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 35, { steps: 5 });
	await page.mouse.up();

	await expect
		.poll(async () => markerWorldPoint((await coords.textContent()) ?? ''))
		.not.toEqual(before);
	const after = markerWorldPoint((await coords.textContent()) ?? '');
	expect(after.x).toBeGreaterThan(before.x);
	expect(after.y).toBeGreaterThan(before.y);
});
