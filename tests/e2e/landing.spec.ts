import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';

test('landing page describes the phase and links to both tools', async ({ page }) => {
	const problems = collectProblems(page);
	await page.goto('/');

	await expect(page.getByRole('heading', { name: 'KrimiMap', level: 1 })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Karte öffnen' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'WebLLM-Spike starten' })).toBeVisible();

	expect(problems).toEqual([]);
});

test('navigation reaches the editor and back', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: 'Karte öffnen' }).click();
	await expect(page).toHaveURL(/\/editor\/$/);
	await expect(page.locator('canvas')).toBeVisible();

	await page.getByRole('link', { name: 'KrimiMap' }).click();
	await expect(page).toHaveURL(/\/$/);
});
