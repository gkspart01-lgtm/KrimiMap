/**
 * Service-worker registration without a PWA framework.
 *
 * Two behaviours matter and are easy to get wrong:
 *
 * 1. "Offline ready" may only be promised once a worker actually controls the
 *    page, otherwise the next reload without a network fails.
 * 2. An update must not reload the editor under the user's fingers: the waiting
 *    worker stays waiting until `applyUpdate()` asks it to take over.
 *
 * The rules about *what to show* live in `status.ts`; this module only talks to
 * the browser.
 */
import { resolve } from '$app/paths';

export interface ServiceWorkerHooks {
	onOfflineReady: () => void;
	onUpdateAvailable: () => void;
	onError: (message: string) => void;
}

export interface ServiceWorkerHandle {
	/** Activate a waiting worker and reload into the new version. */
	applyUpdate: () => void;
}

let reloadOnControllerChange = false;

export function registerServiceWorker(hooks: ServiceWorkerHooks): ServiceWorkerHandle {
	const noop: ServiceWorkerHandle = { applyUpdate: () => {} };

	// Registration is pointless during `vite dev` (no build output) and in
	// browsers without service workers; the app stays fully usable there.
	if (import.meta.env.DEV || !('serviceWorker' in navigator)) return noop;

	// `resolve('/')` carries the configured base path, so the worker also works
	// when the site is served from a sub-path (GitHub Pages project site). The
	// worker is generated into the build, not into `static`, so `asset()` — which
	// is typed to the files in `static` — cannot be used here.
	const scope = resolve('/');
	const swUrl = `${scope}sw.js`;

	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (!reloadOnControllerChange) return;
		reloadOnControllerChange = false;
		location.reload();
	});

	void (async () => {
		try {
			const registration = await navigator.serviceWorker.register(swUrl, { scope });

			// A worker that is already waiting means a previous visit installed an
			// update and never applied it.
			if (registration.waiting && navigator.serviceWorker.controller) {
				hooks.onUpdateAvailable();
			}

			registration.addEventListener('updatefound', () => {
				const installing = registration.installing;
				if (!installing) return;
				installing.addEventListener('statechange', () => {
					if (installing.state !== 'installed') return;
					if (navigator.serviceWorker.controller) hooks.onUpdateAvailable();
				});
			});

			await navigator.serviceWorker.ready;
			hooks.onOfflineReady();

			// Long-lived tabs would otherwise never notice a new deployment.
			document.addEventListener('visibilitychange', () => {
				if (document.visibilityState === 'visible') void registration.update();
			});
		} catch (cause) {
			hooks.onError(cause instanceof Error ? cause.message : String(cause));
		}
	})();

	return {
		applyUpdate() {
			reloadOnControllerChange = true;
			// Ask the waiting worker to activate; `controllerchange` then reloads.
			// Without a waiting worker (e.g. the cache was cleared) a plain reload
			// is the best that can be done.
			void navigator.serviceWorker.getRegistration().then((registration) => {
				const waiting = registration?.waiting;
				if (!waiting) {
					location.reload();
					return;
				}
				waiting.postMessage({ type: 'SKIP_WAITING' });
			});
		}
	};
}
