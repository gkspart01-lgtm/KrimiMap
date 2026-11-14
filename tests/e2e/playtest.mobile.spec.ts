import { expect, test } from '@playwright/test';
import { waitForMap } from './helpers';

test('new clue and culprit markers remain separate on a phone-sized map', async ({ page }) => {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL((url) => url.pathname.endsWith('/editor/') && url.searchParams.has('id'));
	await waitForMap(page);

	await page.getByRole('button', { name: '+ Hinweis' }).click();
	await page.getByLabel('Name').fill('Spur am Fenster');
	await page.getByRole('button', { name: '+ Figur' }).click();
	await page.getByLabel('Name').fill('Mara');
	await expect(page.locator('.krimimap-map-marker-icon')).toHaveCount(2);

	const markers = await page.locator('.krimimap-map-marker').evaluateAll((elements) =>
		elements.map((element) => {
			const rect = element.getBoundingClientRect();
			return {
				name: element.parentElement?.getAttribute('aria-label'),
				left: rect.left,
				right: rect.right,
				top: rect.top,
				bottom: rect.bottom
			};
		})
	);
	const clue = markers.find((marker) => marker.name?.includes('Spur am Fenster'));
	const culprit = markers.find((marker) => marker.name?.includes('Mara'));
	expect(clue).toBeDefined();
	expect(culprit).toBeDefined();
	const overlapX = Math.min(clue!.right, culprit!.right) - Math.max(clue!.left, culprit!.left);
	const overlapY = Math.min(clue!.bottom, culprit!.bottom) - Math.max(clue!.top, culprit!.top);
	expect(Math.max(0, overlapX) * Math.max(0, overlapY)).toBe(0);
});

test('ten phone markers can be placed without falling back to a stack', async ({ page }) => {
	await page.goto('/cases/');
	await page.getByRole('button', { name: 'Neuer Fall' }).click();
	await page.waitForURL((url) => url.pathname.endsWith('/editor/') && url.searchParams.has('id'));
	await waitForMap(page);

	for (let index = 1; index <= 10; index += 1) {
		await page.getByRole('button', { name: '+ Hinweis' }).click();
		await page.getByLabel('Name').fill(`Hinweis ${index}`);
	}
	await expect(page.locator('.krimimap-map-marker-icon')).toHaveCount(10);
	const touchTarget = await page.locator('.krimimap-map-marker-icon').first().boundingBox();
	expect(touchTarget).not.toBeNull();
	expect(touchTarget!.width).toBeGreaterThanOrEqual(44);
	expect(touchTarget!.height).toBeGreaterThanOrEqual(44);

	const markers = await page.locator('.krimimap-map-marker-icon').evaluateAll((elements) =>
		elements.map((element) => {
			const rect = element.getBoundingClientRect();
			return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom };
		})
	);
	expect(markers).toHaveLength(10);
	const overlaps: Array<[number, number]> = [];
	for (let left = 0; left < markers.length; left += 1) {
		for (let right = left + 1; right < markers.length; right += 1) {
			const overlapX =
				Math.min(markers[left].right, markers[right].right) -
				Math.max(markers[left].left, markers[right].left);
			const overlapY =
				Math.min(markers[left].bottom, markers[right].bottom) -
				Math.max(markers[left].top, markers[right].top);
			if (overlapX > 0 && overlapY > 0) overlaps.push([left, right]);
		}
	}
	expect(overlaps).toEqual([]);
});

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
	await page.getByLabel('Optionaler Tipp').fill('Untersuche die Spuren am Fenster.');
	await page.getByLabel('Gesuchte Figur').selectOption({ label: 'Mara' });
	await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
	await page.getByTestId('playtest-button').tap();
	await page.waitForURL((url) => url.pathname.endsWith('/play/') && url.searchParams.has('id'));
	await waitForMap(page);
	// A cold play-route reload must not inherit editor-only marker styles.
	await page.reload();
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
	const markerStyle = await clue.evaluate((icon) => {
		const marker = icon.querySelector('.krimimap-map-marker')!;
		const dot = marker.querySelector('.krimimap-map-marker__dot')!;
		const label = marker.querySelector('.krimimap-map-marker__label')!;
		return {
			markerDisplay: getComputedStyle(marker).display,
			dotWidth: getComputedStyle(dot).width,
			labelBackground: getComputedStyle(label).backgroundColor
		};
	});
	expect(markerStyle).toEqual({
		markerDisplay: 'inline-flex',
		dotWidth: '26px',
		labelBackground: 'rgba(249, 244, 232, 0.94)'
	});
	const dotAlignment = await clue.evaluate((icon) => {
		const iconRect = icon.getBoundingClientRect();
		const dotRect = icon.querySelector('.krimimap-map-marker__dot')!.getBoundingClientRect();
		return dotRect.top + dotRect.height / 2 - (iconRect.top + iconRect.height / 2);
	});
	expect(Math.abs(dotAlignment)).toBeLessThanOrEqual(1);
	await clue.tap();
	await expect(page.getByTestId('clue-progress')).toContainText('1 / 1');
	await page.getByRole('button', { name: 'Tipp anzeigen' }).tap();
	const hint = page.getByTestId('play-hint');
	await expect(hint).toBeVisible();
	await expect
		.poll(() =>
			hint.evaluate((card) => {
				const panel = document.querySelector('[data-testid="play-panel"]')!;
				const panelRect = panel.getBoundingClientRect();
				const cardRect = card.getBoundingClientRect();
				return cardRect.top >= panelRect.top && cardRect.bottom <= panelRect.bottom;
			})
		)
		.toBe(true);
	const hintLayout = await page.evaluate(() => {
		const panel = document.querySelector('[data-testid="play-panel"]')!;
		const map = document.querySelector('[data-testid="map"]')!;
		const card = document.querySelector('[data-testid="play-hint"]')!;
		const panelRect = panel.getBoundingClientRect();
		const mapRect = map.getBoundingClientRect();
		const cardRect = card.getBoundingClientRect();
		const notice = document.querySelector('[data-testid="pwa-banner"]');
		const noticeRect = notice?.getBoundingClientRect();
		const hit = document.elementFromPoint(
			cardRect.left + cardRect.width / 2,
			cardRect.top + cardRect.height / 2
		);
		return {
			mapEndsBeforePanel: mapRect.bottom <= panelRect.top,
			fullyVisible: cardRect.top >= panelRect.top && cardRect.bottom <= panelRect.bottom,
			bottomGap: panelRect.bottom - cardRect.bottom,
			topmostPointBelongsToCard: card.contains(hit),
			noticeOverlapsCard: Boolean(
				noticeRect &&
				cardRect.left < noticeRect.right &&
				cardRect.right > noticeRect.left &&
				cardRect.top < noticeRect.bottom &&
				cardRect.bottom > noticeRect.top
			)
		};
	});
	expect(hintLayout.mapEndsBeforePanel).toBe(true);
	expect(hintLayout.fullyVisible).toBe(true);
	expect(hintLayout.bottomGap).toBeGreaterThanOrEqual(8);
	expect(hintLayout.topmostPointBelongsToCard).toBe(true);
	expect(hintLayout.noticeOverlapsCard).toBe(false);
	await page.getByLabel('Wer war es?').selectOption({ label: 'Mara' });
	await page.getByRole('button', { name: 'Verdacht prüfen' }).tap();
	await expect(page.getByTestId('play-feedback')).toContainText('Der Fall ist gelöst');
});
