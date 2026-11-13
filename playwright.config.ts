import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests against the built static site.
 *
 * The desktop project covers mouse interaction and the shared pages; the mobile
 * project emulates a touch phone and runs the gesture tests. Hosts without root
 * can still run these — see docs/testing.md for the library path trick.
 */
export default defineConfig({
	testDir: 'tests/e2e',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : [['list']],
	timeout: 30_000,
	expect: { timeout: 7_000 },
	use: {
		baseURL: 'http://127.0.0.1:4173',
		trace: 'retain-on-failure',
		video: 'off'
	},
	projects: [
		{
			name: 'desktop',
			testIgnore: /\.mobile\.spec\.ts$/,
			use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } }
		},
		{
			name: 'mobile',
			testMatch: /\.mobile\.spec\.ts$/,
			use: { ...devices['Pixel 5'] }
		}
	],
	webServer: {
		command: 'npm run build && npm run preview',
		url: 'http://127.0.0.1:4173',
		reuseExistingServer: !process.env.CI,
		timeout: 180_000
	}
});
