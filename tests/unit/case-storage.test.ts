import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import 'fake-indexeddb/auto';
import { createEmptyCase } from '#lib/domain/case-document';
import { addEntity } from '#lib/domain/case-commands';
import {
	deleteCase,
	listCases,
	loadCase,
	resetStorage,
	saveCase,
	StorageError
} from '#lib/storage/db';

const now = new Date('2026-11-13T12:00:00.000Z');

function sample(title = 'Der Fall') {
	return addEntity(
		createEmptyCase({ title, now }),
		{ kind: 'clue', name: 'Schlüssel', position: { x: 100, y: 200 } },
		now
	);
}

beforeAll(() => {
	// `fake-indexeddb/auto` installs the globals; nothing else to set up.
});

beforeEach(async () => {
	await resetStorage({ deleteDatabase: true });
});

describe('case repository', () => {
	it('starts empty', async () => {
		expect(await listCases()).toEqual([]);
	});

	it('saves, lists and loads a case', async () => {
		const document = sample();
		const stored = await saveCase(document, now);

		expect(stored.updatedAt).toBe(now.toISOString());
		const list = await listCases();
		expect(list).toEqual([
			{
				id: document.id,
				title: 'Der Fall',
				summary: '',
				language: 'de',
				updatedAt: now.toISOString(),
				entityCount: 1
			}
		]);
		expect(await loadCase(document.id)).toEqual(stored);
	});

	it('returns null for an unknown id', async () => {
		expect(await loadCase('gibtsnicht')).toBeNull();
	});

	it('sorts by last edit, newest first', async () => {
		const first = sample('Zuerst');
		const second = sample('Zuletzt');
		await saveCase(first, new Date('2026-11-13T10:00:00.000Z'));
		await saveCase(second, new Date('2026-11-13T11:00:00.000Z'));

		const list = await listCases();
		expect(list.map((entry) => entry.title)).toEqual(['Zuletzt', 'Zuerst']);
	});

	it('overwrites on save instead of duplicating', async () => {
		const document = sample();
		await saveCase(document, now);
		const renamed = { ...document, title: 'Neuer Titel' };
		await saveCase(renamed, new Date('2026-11-13T13:00:00.000Z'));

		const list = await listCases();
		expect(list).toHaveLength(1);
		expect(list[0].title).toBe('Neuer Titel');
		expect((await loadCase(document.id))?.title).toBe('Neuer Titel');
	});

	it('refuses to store an invalid document', async () => {
		const broken = { ...sample(), title: '   ' };
		await expect(saveCase(broken, now)).rejects.toThrow(/Fehler/);
		expect(await listCases()).toEqual([]);
	});

	it('deletes a case', async () => {
		const document = sample();
		await saveCase(document, now);
		await deleteCase(document.id);
		expect(await listCases()).toEqual([]);
		expect(await loadCase(document.id)).toBeNull();
	});

	it('keeps documents independent', async () => {
		const a = sample('A');
		const b = sample('B');
		await saveCase(a, now);
		await saveCase(b, now);
		await deleteCase(a.id);
		expect((await listCases()).map((entry) => entry.title)).toEqual(['B']);
	});

	it('exposes StorageError for callers that want to react to storage failures', () => {
		expect(new StorageError('kaputt')).toBeInstanceOf(Error);
		expect(new StorageError('kaputt').name).toBe('StorageError');
	});
});
