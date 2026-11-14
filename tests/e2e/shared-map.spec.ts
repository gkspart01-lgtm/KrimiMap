import { expect, test } from '@playwright/test';
import { waitForMap } from './helpers';

test('all cases share one map and other cases are visible but inactive', async ({ page }) => {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL(/\/editor\/\?id=/);
	await waitForMap(page);
	await page.getByRole('textbox', { name: 'Titel des Falls' }).fill('Fall A');
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
		timeout: 10_000
	});

	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL(/\/editor\/\?id=/);
	await waitForMap(page);
	await page.getByRole('textbox', { name: 'Titel des Falls' }).fill('Fall B');
	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await page.getByTestId('entity-form').getByRole('textbox').first().fill('Spur aus Fall B');
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved', {
		timeout: 10_000
	});

	await page.goto('/cases/');
	await page
		.getByTestId('case-list')
		.getByRole('button', { name: /Fall A/ })
		.click();
	await waitForMap(page);

	const inactive = page.locator('[data-case-layer="inactive"]');
	await expect(inactive).toHaveCount(1);
	await expect(inactive).toContainText('Spur aus Fall B');
	await expect(inactive).toHaveAttribute('aria-hidden', 'true');
	await expect(inactive).toHaveAttribute('data-draggable', 'false');
	await expect(inactive).toHaveCSS('pointer-events', 'none');
	await expect(page.getByTestId('entity-form')).toHaveCount(0);

	const box = await inactive.boundingBox();
	if (!box) throw new Error('inactive marker has no rendered position');
	await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
	await expect(page.getByTestId('entity-form')).toHaveCount(0);
});
