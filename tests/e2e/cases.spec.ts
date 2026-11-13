import { expect, test, type Page } from '@playwright/test';
import { waitForMap } from './helpers';

/**
 * Phase 2 exit gate at UI level: a case can be created, edited, and is still
 * there after a reload — including with the network disabled, which is what makes
 * the local-first promise real.
 */

async function createCase(page: Page): Promise<void> {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL(/\/editor\/\?id=/);
	await waitForMap(page);
}

test('creates a case, adds an entity and keeps it after a reload', async ({ page }) => {
	await createCase(page);

	await page.getByRole('textbox', { name: 'Titel des Falls' }).fill('Der Fall im Moor');
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await expect(page.getByTestId('entity-form')).toBeVisible();

	await page.getByTestId('entity-form').getByRole('textbox').first().fill('Taschenlampe');
	// Autosave is debounced; the status pill is the UI contract.
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
		timeout: 10_000
	});

	await page.reload();
	await waitForMap(page);
	await expect(page.getByRole('textbox', { name: 'Titel des Falls' })).toHaveValue(
		'Der Fall im Moor'
	);

	// The entity survived and is listed in the case overview.
	await page.goto('/cases/');
	await expect(page.getByTestId('case-list')).toContainText('Der Fall im Moor');
	await expect(page.getByTestId('case-list')).toContainText('1 Eintrag');
});

test('edits survive offline', async ({ page, context }) => {
	await createCase(page);
	await page.getByRole('textbox', { name: 'Titel des Falls' }).fill('Offline-Fall');
	await page.getByRole('button', { name: '+ Figur' }).click();
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
		timeout: 10_000
	});

	// Prime the service worker, then cut the network.
	await page.goto('/cases/');
	await page.evaluate(async () => {
		await navigator.serviceWorker.ready;
	});
	await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
	await context.setOffline(true);

	await page.reload({ waitUntil: 'domcontentloaded' });
	await expect(page.getByTestId('case-list')).toContainText('Offline-Fall');
	await page.getByTestId('case-list').getByRole('button').first().click();
	await page.waitForURL(/\/editor\/\?id=/);
	await waitForMap(page);
});

test('imports a version-0 draft and migrates it', async ({ page }) => {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'JSON importieren' }).click();

	const draft = {
		title: 'Alter Entwurf',
		entities: [{ name: 'Tür', kind: 'object', position: { x: 120, y: 140 } }]
	};
	await page.locator('input[type=file]').setInputFiles({
		name: 'alt.json',
		mimeType: 'application/json',
		buffer: Buffer.from(JSON.stringify(draft))
	});

	await page.waitForURL(/\/editor\/\?id=/);
	await waitForMap(page);
	await expect(page.getByRole('textbox', { name: 'Titel des Falls' })).toHaveValue('Alter Entwurf');

	await page.goto('/cases/');
	await expect(page.getByTestId('case-list')).toContainText('Alter Entwurf');
});

test('rejects a broken import with a readable message', async ({ page }) => {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'JSON importieren' }).click();
	await page.locator('input[type=file]').setInputFiles({
		name: 'kaputt.json',
		mimeType: 'application/json',
		buffer: Buffer.from('{ "title": ')
	});

	await expect(page.getByTestId('case-error')).toContainText('Kein gültiges JSON');
	await expect(page).toHaveURL(/\/cases\/$/);
});

test('deletes a case from the overview', async ({ page }) => {
	await createCase(page);
	await page.getByRole('textbox', { name: 'Titel des Falls' }).fill('Wegwerf-Fall');
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
		timeout: 10_000
	});

	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Löschen' }).first().click();
	await expect(page.getByTestId('case-list')).toHaveCount(0);
});

test('switches the interface language and remembers it', async ({ page }) => {
	await page.goto('/cases/');
	await expect(page.getByRole('heading', { name: 'Deine Fälle' })).toBeVisible();

	await page.getByRole('button', { name: 'Sprache wechseln' }).click();
	await expect(page.getByRole('heading', { name: 'Your cases' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'New case' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Editor' })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Cases' })).toBeVisible();

	await page.reload();
	await expect(page.getByRole('heading', { name: 'Your cases' })).toBeVisible();

	// Entities and diagnostics follow the language as well.
	await page.getByRole('button', { name: 'New case' }).click();
	await page.waitForURL(/\/editor\//);
	await expect(page.getByRole('button', { name: '+ Clue' })).toBeVisible();
	await page.getByRole('button', { name: 'Toggle debug view' }).click();
	await expect(page.getByTestId('zoom-label')).toContainText('Zoom');

	// Back to German for the rest of the suite.
	await page.getByRole('button', { name: 'Switch language' }).click();
	await expect(page.getByRole('button', { name: '+ Hinweis' })).toBeVisible();
});
