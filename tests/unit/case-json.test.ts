import { describe, expect, it } from 'vitest';
import { createEmptyCase } from '#lib/domain/case-document';
import { addEntity } from '#lib/domain/case-commands';
import {
	MAX_IMPORT_BYTES,
	exportFileName,
	parseCaseJson,
	toJson,
	withFreshIdentity
} from '#lib/storage/json';

const later = new Date('2026-11-13T12:00:00.000Z');

function sample() {
	return addEntity(
		createEmptyCase({ title: 'Der Fall im Moor', now: later }),
		{ kind: 'clue', name: 'Schlüssel', position: { x: 100, y: 200 } },
		later
	);
}

describe('JSON round trip', () => {
	it('survives export and import without losing fields', () => {
		const original = sample();
		const parsed = parseCaseJson(toJson(original));
		expect(parsed.ok).toBe(true);
		if (!parsed.ok) return;
		expect(parsed.document).toEqual(original);
	});

	it('builds a readable file name from title and id', () => {
		const document = sample();
		expect(exportFileName(document)).toBe(`der-fall-im-moor-${document.id}.json`);
	});
});

describe('parseCaseJson rejects', () => {
	it('broken JSON', () => {
		const result = parseCaseJson('{ "title": ');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].message).toMatch(/Kein gültiges JSON/);
	});

	it('a document of another app', () => {
		const result = parseCaseJson('{"hello":"world"}');
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].message).toBe('Das ist kein KrimiMap-Fall.');
	});

	it('files above the size limit before parsing them', () => {
		const big = 'x'.repeat(MAX_IMPORT_BYTES + 1);
		const result = parseCaseJson(big);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].message).toMatch(/erlaubt sind 2048 KiB/);
	});

	it('invalid content, with the exact paths', () => {
		const broken = { ...sample(), title: '   ' };
		const result = parseCaseJson(JSON.stringify(broken));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues.map((issue) => issue.path)).toContain('title');
	});

	it('documents from a newer schema version', () => {
		const result = parseCaseJson(JSON.stringify({ ...sample(), schemaVersion: 42 }));
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].message).toMatch(/neueren Version/);
	});

	it('unknown migrations reach the caller as an issue, not an exception', () => {
		const result = parseCaseJson(
			JSON.stringify({ schemaVersion: -3, id: 'x', title: 'y', entities: [] })
		);
		expect(result.ok).toBe(false);
		if (result.ok) return;
		expect(result.issues[0].message).toMatch(/keine Migration/);
	});
});

describe('parseCaseJson migrates', () => {
	it('upgrades a version-0 draft', () => {
		const result = parseCaseJson(
			JSON.stringify({
				title: 'Altes Ding',
				entities: [{ name: 'Tür', kind: 'object', position: { x: 10, y: 10 } }]
			})
		);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.document.schemaVersion).toBe(3);
		expect(result.document.mapId).toBe('crime-city');
		expect(result.document.challenge).toEqual({ objective: '', solutionEntityId: null, hint: '' });
		expect(result.document.entities[0].id).toBe('tuer');
	});
});

describe('withFreshIdentity', () => {
	it('keeps the identity when the id is free', () => {
		const document = sample();
		expect(withFreshIdentity(document, [], later).id).toBe(document.id);
	});

	it('renames a colliding import instead of overwriting the original', () => {
		const document = sample();
		const imported = withFreshIdentity(document, [document.id], later);
		expect(imported.id).not.toBe(document.id);
		expect(imported.title).toBe('Der Fall im Moor (importiert)');
		expect(imported.entities).toEqual(document.entities);
	});
});
