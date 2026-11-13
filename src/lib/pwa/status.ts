/**
 * Framework-free state machine for the service-worker lifecycle.
 *
 * The Svelte layer only translates browser events into these events, which
 * keeps the "what does the UI show" rules unit-testable in Node.
 */

export type PwaPhase = 'idle' | 'offline-ready' | 'update-available' | 'error';

export interface PwaState {
	phase: PwaPhase;
	/** Message for the error phase; `null` otherwise. */
	error: string | null;
}

export type PwaEvent =
	| { type: 'offline-ready' }
	| { type: 'update-available' }
	| { type: 'dismiss' }
	| { type: 'error'; message: string };

export const initialPwaState: PwaState = { phase: 'idle', error: null };

export function reducePwa(state: PwaState, event: PwaEvent): PwaState {
	switch (event.type) {
		case 'offline-ready':
			// A pending update is the more important message: do not replace it.
			return state.phase === 'update-available' ? state : { phase: 'offline-ready', error: null };
		case 'update-available':
			return { phase: 'update-available', error: null };
		case 'dismiss':
			return initialPwaState;
		case 'error':
			return { phase: 'error', error: event.message };
		default:
			return state;
	}
}

export type Connection = 'online' | 'offline';

/**
 * What the header pill shows. `controlled` means a service worker is serving
 * the page, which is the only case where "offline ready" is a real promise.
 */
export function describeConnection(
	connection: Connection,
	controlled: boolean
): {
	label: string;
	title: string;
	offlineReady: boolean;
} {
	if (connection === 'offline') {
		return {
			label: 'Offline',
			title: controlled
				? 'Keine Netzwerkverbindung — die App läuft aus dem Cache.'
				: 'Keine Netzwerkverbindung und kein aktiver Cache — Neuladen wird scheitern.',
			offlineReady: controlled
		};
	}

	return {
		label: 'Online',
		title: controlled
			? 'Netzwerk verfügbar — die App ist zusätzlich offline verfügbar.'
			: 'Netzwerk verfügbar — der Offline-Cache ist noch nicht aktiv.',
		offlineReady: controlled
	};
}
