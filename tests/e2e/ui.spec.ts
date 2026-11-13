import { expect, test } from '@playwright/test';
import { waitForMap } from './helpers';

/**
 * The two UI contracts Falko asked for: technical numbers only in debug mode, and
 * an install hint that can actually be dismissed — for good.
 */

test('the editor hides camera numbers until debug mode is on', async ({ page }) => {
	await page.goto('/editor/');
	await waitForMap(page);

	await expect(page.getByTestId('zoom-label')).toHaveCount(0);

	await page.getByRole('button', { name: 'Debug-Ansicht umschalten' }).click();
	await expect(page.getByTestId('zoom-label')).toContainText('Zoom');
});

test('the install hint can be dismissed and stays dismissed', async ({ page }) => {
	await page.goto('/');
	// The listener is registered in `onMount`; the pill proves the layout is up.
	await expect(page.getByTestId('connection-status')).toBeVisible();

	// Chromium only fires `beforeinstallprompt` on a real installable site, so the
	// event is synthesised — the component's reaction is what is under test.
	await page.evaluate(() => {
		const event = new Event('beforeinstallprompt') as Event & {
			prompt: () => Promise<void>;
			userChoice: Promise<{ outcome: string; platform: string }>;
		};
		event.prompt = () => Promise.resolve();
		event.userChoice = Promise.resolve({ outcome: 'dismissed', platform: 'web' });
		window.dispatchEvent(event);
	});

	const banner = page.getByTestId('install-banner');
	await expect(banner).toBeVisible();
	await banner.getByRole('button', { name: 'Installationshinweis schließen' }).click();
	await expect(banner).toHaveCount(0);

	// Re-firing the event must not bring it back, not even after a reload.
	await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
	await expect(banner).toHaveCount(0);

	await page.reload();
	await expect(page.getByTestId('connection-status')).toBeVisible();
	await page.evaluate(() => window.dispatchEvent(new Event('beforeinstallprompt')));
	await expect(banner).toHaveCount(0);
});
