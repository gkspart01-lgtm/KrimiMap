import { expect, test } from '@playwright/test';
import { collectProblems } from './helpers';

test('the spike reports the WebGPU state instead of failing', async ({ page }) => {
	const problems = collectProblems(page);
	await page.goto('/spike/webllm/');

	const webgpuRow = page.locator('tr', { hasText: 'WebGPU' });
	await expect(webgpuRow).toBeVisible({ timeout: 20_000 });
	// Headless Chromium exposes no WebGPU, so the honest "not available" answer is
	// what this test locks in; a real browser shows "verfügbar" instead.
	await expect(webgpuRow).toContainText(/verfügbar/);
	await expect(page.getByRole('heading', { name: /lokale KI im Browser/ })).toBeVisible();
	expect(problems).toEqual([]);
});

test('models are listed and generation is impossible before a model is loaded', async ({
	page
}) => {
	await page.goto('/spike/webllm/');

	const modelSelect = page.locator('select').first();
	await expect(modelSelect).toBeVisible();
	await expect.poll(async () => modelSelect.locator('option').count()).toBeGreaterThan(0);

	await expect(page.getByRole('button', { name: 'Test starten' })).toBeDisabled();
	expect(await modelSelect.locator('option').first().textContent()).toMatch(/SmolLM2|Llama|Qwen/);
});

test('the app only talks to its own static origin', async ({ page }) => {
	const external: string[] = [];
	page.on('request', (request) => {
		const url = new URL(request.url());
		if (url.host !== '127.0.0.1:4173') external.push(request.url());
	});

	await page.goto('/');
	await page.goto('/editor/');
	await expect(page.getByTestId('map')).toBeVisible({ timeout: 20_000 });

	// Model weights come from a CDN only after the user asks for a download.
	expect(external).toEqual([]);
});
