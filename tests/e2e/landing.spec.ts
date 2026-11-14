import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';

test('landing page opens the editor and keeps technical details behind debug', async ({ page }) => {
	const problems = collectProblems(page);
	await page.goto('/');

	await expect(page.getByRole('heading', { name: 'KrimiMap', level: 1 })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Karte öffnen' })).toBeVisible();

	// The spike and the build stamp are developer tools, not landing content.
	await expect(page.getByTestId('debug-panel')).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'AI-Spike' })).toHaveCount(0);

	await page.getByRole('button', { name: 'Debug-Ansicht umschalten' }).click();
	await expect(page.getByTestId('debug-panel')).toBeVisible();
	await expect(
		page.getByTestId('debug-panel').getByRole('link', { name: 'WebLLM-Spike' })
	).toBeVisible();
	await expect(page.getByRole('link', { name: 'AI-Spike' })).toBeVisible();

	// Persisted: a reload keeps debug on.
	await page.reload();
	await expect(page.getByTestId('debug-panel')).toBeVisible();

	await page.getByRole('button', { name: 'Debug-Ansicht umschalten' }).click();
	await expect(page.getByTestId('debug-panel')).toHaveCount(0);

	expect(problems).toEqual([]);
});

test('navigation reaches the editor and back', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Karte öffnen' }).click();
	await expect(page).toHaveURL(/\/editor\/\?id=/);
	await expect(page.getByTestId('map')).toBeVisible();

	await page.getByRole('link', { name: 'KrimiMap' }).click();
	await expect(page).toHaveURL(/\/$/);
});
