import { expect, test } from '@playwright/test';
import { waitForMap } from './helpers';

/**
 * FR-16: the editor must stay usable when no local model can run. Headless
 * Chromium reports no WebGPU, so this is exactly the graceful-absence path a
 * creator sees on an unsupported device.
 */
test('the AI panel reports a missing local runtime and leaves the editor usable', async ({
	page
}) => {
	await page.goto('/editor/');
	await waitForMap(page);

	await page.getByTestId('ai-open').click();
	const dialog = page.locator('dialog.ai-dialog');
	await expect(dialog).toBeVisible();
	await expect(page.getByTestId('ai-status')).toContainText(/nicht verfügbar|not available/i);
	await expect(
		page.getByRole('button', { name: /Entwurf erzeugen|Generate draft/ })
	).toBeDisabled();
	await expect(page.getByTestId('ai-preview')).toHaveCount(0);

	await dialog.getByRole('button', { name: /Schließen|Close/ }).click();
	await expect(dialog).toBeHidden();

	// The case is still editable: no AI state leaked into the document.
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await expect(page.getByTestId('entity-form')).toBeVisible();
	await page.getByLabel('Name').fill('Spur am Fenster');
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
});
