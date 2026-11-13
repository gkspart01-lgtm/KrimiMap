import { describe, expect, it } from 'vitest';
import { describeConnection, initialPwaState, reducePwa, type PwaState } from '#lib/pwa/status';

describe('reducePwa', () => {
	it('moves from idle to offline-ready once the shell is cached', () => {
		expect(reducePwa(initialPwaState, { type: 'offline-ready' })).toEqual({
			phase: 'offline-ready',
			error: null
		});
	});

	it('keeps a pending update visible when the cache also becomes ready', () => {
		// A first visit can report both; the update is the message that needs a
		// decision, so it must not be replaced by the informational one.
		const updated = reducePwa(initialPwaState, { type: 'update-available' });
		expect(reducePwa(updated, { type: 'offline-ready' })).toEqual(updated);
	});

	it('announces an update even when offline-ready was shown before', () => {
		const ready = reducePwa(initialPwaState, { type: 'offline-ready' });
		expect(reducePwa(ready, { type: 'update-available' })?.phase).toBe('update-available');
	});

	it('returns to idle when the notice is dismissed', () => {
		const ready = reducePwa(initialPwaState, { type: 'offline-ready' });
		expect(reducePwa(ready, { type: 'dismiss' })).toEqual(initialPwaState);
	});

	it('keeps the error text so the UI can explain what failed', () => {
		const failed = reducePwa(initialPwaState, { type: 'error', message: 'bad scope' });
		expect(failed).toEqual({ phase: 'error', error: 'bad scope' });
	});

	it('clears a previous error when a later event succeeds', () => {
		const failed = reducePwa(initialPwaState, { type: 'error', message: 'bad scope' });
		expect(reducePwa(failed, { type: 'offline-ready' })).toEqual({
			phase: 'offline-ready',
			error: null
		});
	});

	it('leaves the state untouched for unknown events', () => {
		const state: PwaState = { phase: 'offline-ready', error: null };
		const unknown = { type: 'nonsense' } as unknown as Parameters<typeof reducePwa>[1];
		expect(reducePwa(state, unknown)).toBe(state);
	});
});

describe('describeConnection', () => {
	it('promises offline capability only when a worker controls the page', () => {
		expect(describeConnection('online', true).offlineReady).toBe(true);
		expect(describeConnection('online', false).offlineReady).toBe(false);
		expect(describeConnection('offline', true).offlineReady).toBe(true);
	});

	it('warns when the network is gone and no cache can serve the reload', () => {
		const status = describeConnection('offline', false);
		expect(status.label).toBe('Offline');
		expect(status.title).toContain('Neuladen wird scheitern');
	});

	it('labels the online case and explains the cache state', () => {
		expect(describeConnection('online', true).label).toBe('Online');
		expect(describeConnection('online', false).title).toContain('noch nicht aktiv');
	});
});
