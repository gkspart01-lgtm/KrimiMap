/**
 * Service-worker registration plus the small bits of browser state the PWA
 * affordances need (connection, install prompt, update readiness).
 *
 * Everything here touches `window`, so it must only run from `onMount`.
 * The rules about *what to show* live in `status.ts`, the worker plumbing in
 * `register.ts`.
 */
import { registerServiceWorker, type ServiceWorkerHandle } from './register';
import {
	describeConnection,
	initialPwaState,
	reducePwa,
	type Connection,
	type PwaEvent,
	type PwaState
} from './status';

interface BeforeInstallPromptEvent extends Event {
	readonly platforms: string[];
	prompt(): Promise<void>;
	userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let state = $state<PwaState>(initialPwaState);
let connection = $state<Connection>('online');
let controlled = $state(false);
let canInstall = $state(false);
let started = false;

let worker: ServiceWorkerHandle | null = null;
let installEvent: BeforeInstallPromptEvent | null = null;

function send(event: PwaEvent): void {
	state = reducePwa(state, event);
}

/** Register the service worker and start listening; safe to call twice. */
export function startPwa(): void {
	if (started || typeof window === 'undefined') return;
	started = true;

	connection = navigator.onLine ? 'online' : 'offline';
	controlled = Boolean(navigator.serviceWorker?.controller);

	window.addEventListener('online', () => {
		connection = 'online';
	});
	window.addEventListener('offline', () => {
		connection = 'offline';
	});

	navigator.serviceWorker?.addEventListener('controllerchange', () => {
		controlled = Boolean(navigator.serviceWorker.controller);
	});

	window.addEventListener('beforeinstallprompt', (event) => {
		// Keep the event so a button can trigger the browser's own prompt later;
		// firing it during page load is what gets install prompts suppressed.
		event.preventDefault();
		installEvent = event as BeforeInstallPromptEvent;
		canInstall = true;
	});

	window.addEventListener('appinstalled', () => {
		installEvent = null;
		canInstall = false;
		send({ type: 'dismiss' });
	});

	worker = registerServiceWorker({
		onOfflineReady() {
			controlled = true;
			send({ type: 'offline-ready' });
		},
		onUpdateAvailable() {
			send({ type: 'update-available' });
		},
		onError(error: { message?: string } | string) {
			const message = typeof error === 'string' ? error : (error.message ?? 'unbekannt');
			send({ type: 'error', message });
		}
	});
}

export function pwa() {
	return {
		get state() {
			return state;
		},
		get connection() {
			return connection;
		},
		get canInstall() {
			return canInstall;
		},
		get status() {
			return describeConnection(connection, controlled);
		}
	};
}

/** Activate the waiting worker and reload into the new version. */
export function applyUpdate(): void {
	worker?.applyUpdate();
}

export function dismissNotice(): void {
	send({ type: 'dismiss' });
}

/** Show the browser's install prompt; no-op when it is not available. */
export async function promptInstall(): Promise<void> {
	if (!installEvent) return;
	await installEvent.prompt();
	await installEvent.userChoice;
	installEvent = null;
	canInstall = false;
}
