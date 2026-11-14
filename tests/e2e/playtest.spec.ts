import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { waitForMap } from './helpers';

test('creator can playtest a case, inspect clues, reveal a hint and submit a deduction', async ({
	page
}) => {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL(/\/editor\/\?id=/);
	await waitForMap(page);

	await page.getByRole('textbox', { name: 'Titel des Falls' }).fill('Die gestohlene Uhr');
	await page.getByLabel('Fallbeschreibung').fill('In der Nacht verschwand eine wertvolle Uhr.');
	await page.getByLabel('Spielziel').fill('Finde heraus, wer die Uhr gestohlen hat.');

	await page.getByRole('button', { name: '+ Figur' }).click();
	await page.getByLabel('Name').fill('Mara');
	await page.getByRole('button', { name: '+ Figur' }).click();
	await page.getByLabel('Name').fill('Leo');
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await page.getByLabel('Name').fill('Abdruck am Fenster');
	await page
		.getByTestId('entity-form')
		.getByLabel('Beschreibung')
		.fill('Der Abdruck passt zu Maras Stiefeln.');
	await page.getByLabel('Gesuchte Figur').selectOption({ label: 'Mara' });
	await page.getByLabel('Optionaler Tipp').fill('Untersuche die Spuren am Fenster.');

	await expect(page.getByTestId('playtest-button')).toBeEnabled();
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
		timeout: 10_000
	});
	await page.getByTestId('playtest-button').click();
	await page.waitForURL(/\/play\/\?id=/);
	await waitForMap(page);

	await expect(page.getByRole('heading', { name: 'Die gestohlene Uhr' })).toBeVisible();
	await expect(page.getByTestId('play-objective')).toContainText(
		'Finde heraus, wer die Uhr gestohlen hat.'
	);
	await expect(page.getByTestId('clue-progress')).toContainText('0 / 1');
	await expect(page.getByRole('button', { name: 'Verdacht prüfen' })).toBeDisabled();
	await expect(page.getByRole('button', { name: /Abdruck am Fenster/ })).toHaveAttribute(
		'data-draggable',
		'false'
	);

	await page.getByRole('button', { name: /Abdruck am Fenster/ }).click();
	await expect(page.getByTestId('play-entity-details')).toContainText(
		'Der Abdruck passt zu Maras Stiefeln.'
	);
	await expect(page.getByTestId('clue-progress')).toContainText('1 / 1');
	await expect(page.getByRole('button', { name: 'Verdacht prüfen' })).toBeDisabled();

	await page.getByRole('button', { name: 'Tipp anzeigen' }).click();
	await expect(page.getByTestId('play-hint')).toContainText('Untersuche die Spuren am Fenster.');

	await page.getByLabel('Wer war es?').selectOption({ label: 'Leo' });
	await expect(page.getByRole('button', { name: 'Verdacht prüfen' })).toBeEnabled();
	await page.getByRole('button', { name: 'Verdacht prüfen' }).click();
	await expect(page.getByTestId('play-feedback')).toContainText(
		'Das ist noch nicht die richtige Lösung'
	);

	await page.getByLabel('Wer war es?').selectOption({ label: 'Mara' });
	await page.getByRole('button', { name: 'Verdacht prüfen' }).click();
	await expect(page.getByTestId('play-feedback')).toContainText('Der Fall ist gelöst');

	await page.getByRole('link', { name: 'Zurück zum Editor' }).click();
	await page.waitForURL(/\/editor\/\?id=/);
	await waitForMap(page);
	await expect(page.getByLabel('Spielziel')).toHaveValue(
		'Finde heraus, wer die Uhr gestohlen hat.'
	);
});

test('the whole playtest workflow and local map work offline', async ({ page, context }) => {
	const failedRequests: string[] = [];
	page.on('requestfailed', (request) => failedRequests.push(request.url()));
	await page.goto('/');
	await page.evaluate(async () => navigator.serviceWorker.ready);
	await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
	await context.setOffline(true);

	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL(/\/editor\/\?id=/);
	await waitForMap(page);
	await page.getByRole('textbox', { name: 'Titel des Falls' }).fill('Offline-Fall');
	await page.getByLabel('Spielziel').fill('Finde die gesuchte Figur.');
	await page.getByRole('button', { name: '+ Figur' }).click();
	await page.getByLabel('Name').fill('Mara');
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await page.getByLabel('Name').fill('Spur am Fenster');
	await page.getByLabel('Gesuchte Figur').selectOption({ label: 'Mara' });
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
		timeout: 10_000
	});
	await page.getByTestId('playtest-button').click();
	await page.waitForURL(/\/play\/\?id=/);
	await waitForMap(page);
	await expect
		.poll(() =>
			page
				.getByTestId('map')
				.locator('img.leaflet-image-layer')
				.evaluate((image) => (image as HTMLImageElement).naturalWidth)
		)
		.toBeGreaterThan(0);
	await page.getByRole('button', { name: /Spur am Fenster/ }).click();
	await expect(page.getByTestId('clue-progress')).toContainText('1 / 1');
	await page.getByLabel('Wer war es?').selectOption({ label: 'Mara' });
	await page.getByRole('button', { name: 'Verdacht prüfen' }).click();
	await expect(page.getByTestId('play-feedback')).toContainText('Der Fall ist gelöst');

	await page.reload();
	await waitForMap(page);
	await expect(page.getByTestId('play-objective')).toContainText('Finde die gesuchte Figur.');
	await expect
		.poll(() =>
			page
				.getByTestId('map')
				.locator('img.leaflet-image-layer')
				.evaluate((image) => (image as HTMLImageElement).naturalWidth)
		)
		.toBeGreaterThan(0);

	await page.goto('/cases/');
	const [download] = await Promise.all([
		page.waitForEvent('download'),
		page.getByTestId('case-list').getByRole('button', { name: 'Export' }).click()
	]);
	const filePath = await download.path();
	if (!filePath) throw new Error('case export did not produce a file');
	await page.getByRole('button', { name: 'JSON importieren' }).click();
	await page.locator('input[type=file]').setInputFiles({
		name: download.suggestedFilename(),
		mimeType: 'application/json',
		buffer: await readFile(filePath)
	});
	await page.waitForURL((url) => url.pathname.endsWith('/editor/') && url.searchParams.has('id'));
	await waitForMap(page);
	await expect(page.getByRole('textbox', { name: 'Titel des Falls' })).toHaveValue(
		'Offline-Fall (importiert)'
	);
	await expect(page.getByLabel('Spielziel')).toHaveValue('Finde die gesuchte Figur.');
	await page.getByTestId('playtest-button').click();
	await page.waitForURL((url) => url.pathname.endsWith('/play/') && url.searchParams.has('id'));
	await waitForMap(page);
	await expect(page.getByTestId('play-objective')).toContainText('Finde die gesuchte Figur.');
	await expect(failedRequests).toEqual([]);
});
