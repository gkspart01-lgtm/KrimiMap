import { expect, test } from '@playwright/test';
import { waitForMap } from './helpers';

test('playtest controls fit on a phone and clue markers remain tappable', async ({ page }) => {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL((url) => url.pathname.endsWith('/editor/') && url.searchParams.has('id'));
	await waitForMap(page);

	await page.getByRole('textbox', { name: 'Titel des Falls' }).fill('Telefon-Fall');
	await page.getByLabel('Spielziel').fill('Finde die gesuchte Figur.');
	await page.getByRole('button', { name: '+ Figur' }).click();
	await page.getByLabel('Name').fill('Mara');
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await page.getByLabel('Name').fill('Spur am Fenster');
	await page.getByLabel('Gesuchte Figur').selectOption({ label: 'Mara' });
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
	await page.getByTestId('playtest-button').tap();
	await page.waitForURL((url) => url.pathname.endsWith('/play/') && url.searchParams.has('id'));
	await waitForMap(page);

	const viewport = page.viewportSize();
	const panel = await page.getByTestId('play-panel').boundingBox();
	expect(viewport).not.toBeNull();
	expect(panel).not.toBeNull();
	expect(panel!.x).toBeGreaterThanOrEqual(0);
	expect(panel!.y).toBeGreaterThanOrEqual(0);
	expect(panel!.x + panel!.width).toBeLessThanOrEqual(viewport!.width);
	expect(panel!.y + panel!.height).toBeLessThanOrEqual(viewport!.height);

	const clue = page.getByRole('button', { name: /Spur am Fenster/ });
	await expect(clue).toHaveAttribute('data-draggable', 'false');
	await clue.tap();
	await expect(page.getByTestId('clue-progress')).toContainText('1 / 1');
	await page.getByLabel('Wer war es?').selectOption({ label: 'Mara' });
	await page.getByRole('button', { name: 'Verdacht prüfen' }).tap();
	await expect(page.getByTestId('play-feedback')).toContainText('Der Fall ist gelöst');
});
