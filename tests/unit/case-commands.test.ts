import { describe, expect, it } from 'vitest';
import { createEmptyCase, ENTITY_KIND_COLORS } from '#lib/domain/case-document';
import {
	addEntity,
	linkEntities,
	moveEntity,
	removeEntity,
	renameCase,
	unlinkEntities,
	updateCaseChallenge,
	updateCaseMeta,
	updateEntity
} from '#lib/domain/case-commands';

const later = new Date('2026-11-13T12:00:00.000Z');

function base() {
	return createEmptyCase({ title: 'Der Fall', now: new Date('2026-11-13T10:00:00.000Z') });
}

describe('addEntity', () => {
	it('derives a unique id from the name and uses the kind colour', () => {
		const document = addEntity(
			base(),
			{ kind: 'clue', name: 'Schlüssel', position: { x: 10, y: 20 } },
			later
		);
		expect(document.entities[0]).toMatchObject({
			id: 'schluessel',
			kind: 'clue',
			color: ENTITY_KIND_COLORS.clue,
			position: { x: 10, y: 20 }
		});
		expect(document.updatedAt).toBe(later.toISOString());
	});

	it('numbers unnamed entities and keeps ids unique', () => {
		let document = addEntity(base(), { kind: 'object', position: { x: 1, y: 1 } }, later);
		document = addEntity(document, { kind: 'object', position: { x: 2, y: 2 } }, later);
		expect(document.entities.map((entity) => entity.id)).toEqual(['object-1', 'object-2']);
	});

	it('clamps positions into the map and rejects unknown kinds', () => {
		const document = addEntity(
			base(),
			{ kind: 'character', position: { x: 99999, y: -10 } },
			later
		);
		expect(document.entities[0].position).toEqual({ x: 2400, y: 0 });
		expect(() => addEntity(base(), { kind: 'monster' as never, position: { x: 0, y: 0 } })).toThrow(
			/Unbekannte Art/
		);
	});

	it('does not mutate the input document', () => {
		const document = base();
		addEntity(document, { kind: 'clue', position: { x: 5, y: 5 } }, later);
		expect(document.entities).toHaveLength(0);
	});
});

describe('updateEntity / moveEntity', () => {
	it('patches fields and clamps moves', () => {
		let document = addEntity(
			base(),
			{ kind: 'clue', name: 'Messer', position: { x: 5, y: 5 } },
			later
		);
		const id = document.entities[0].id;
		document = updateEntity(document, id, { description: 'Blutig' }, later);
		document = moveEntity(document, id, { x: 5000, y: 20 }, later);
		expect(document.entities[0]).toMatchObject({
			description: 'Blutig',
			position: { x: 2400, y: 20 }
		});
	});

	it('ignores unknown ids and never lets an entity reference itself', () => {
		const document = addEntity(
			base(),
			{ kind: 'clue', name: 'Messer', position: { x: 5, y: 5 } },
			later
		);
		const id = document.entities[0].id;
		expect(updateEntity(document, 'nope', { name: 'x' })).toBe(document);
		expect(
			updateEntity(document, id, { relatedEntityIds: [id] }).entities[0].relatedEntityIds
		).toEqual([]);
	});

	it('rejects an invalid kind in a patch', () => {
		const document = addEntity(
			base(),
			{ kind: 'clue', name: 'Messer', position: { x: 5, y: 5 } },
			later
		);
		expect(() =>
			updateEntity(document, document.entities[0].id, { kind: 'monster' as never })
		).toThrow(/Unbekannte Art/);
	});
});

describe('references', () => {
	it('links two entities once and unlinks again', () => {
		let document = addEntity(
			base(),
			{ kind: 'clue', name: 'Messer', position: { x: 5, y: 5 } },
			later
		);
		document = addEntity(
			document,
			{ kind: 'character', name: 'Gärtner', position: { x: 50, y: 50 } },
			later
		);
		const [clue, character] = document.entities;

		document = linkEntities(document, clue.id, character.id, later);
		document = linkEntities(document, clue.id, character.id, later);
		expect(document.entities[0].relatedEntityIds).toEqual([character.id]);

		document = unlinkEntities(document, clue.id, character.id, later);
		expect(document.entities[0].relatedEntityIds).toEqual([]);
	});

	it('ignores links to itself or to unknown targets', () => {
		const document = addEntity(
			base(),
			{ kind: 'clue', name: 'Messer', position: { x: 5, y: 5 } },
			later
		);
		const id = document.entities[0].id;
		expect(linkEntities(document, id, id)).toBe(document);
		expect(linkEntities(document, id, 'nope')).toBe(document);
		expect(unlinkEntities(document, id, 'nope')).toBe(document);
	});
});

describe('removeEntity', () => {
	it('removes the entity and every reference pointing at it', () => {
		let document = addEntity(
			base(),
			{ kind: 'clue', name: 'Messer', position: { x: 5, y: 5 } },
			later
		);
		document = addEntity(
			document,
			{ kind: 'character', name: 'Gärtner', position: { x: 50, y: 50 } },
			later
		);
		const [clue, character] = document.entities;
		document = linkEntities(document, clue.id, character.id, later);

		const removed = removeEntity(document, character.id, later);
		expect(removed.entities.map((entity) => entity.id)).toEqual([clue.id]);
		expect(removed.entities[0].relatedEntityIds).toEqual([]);
	});

	it('is a no-op for unknown ids', () => {
		const document = base();
		expect(removeEntity(document, 'nope')).toBe(document);
	});
});

describe('case metadata', () => {
	it('renames with a trimmed title and never leaves it empty', () => {
		expect(renameCase(base(), '  Neuer Titel  ', later).title).toBe('Neuer Titel');
		expect(renameCase(base(), '   ', later).title).toBe('Unbenannter Fall');
	});

	it('updates summary and language without changing the shared map reference', () => {
		const document = updateCaseMeta(base(), { summary: 'Kurz', language: 'en' }, later);
		expect(document.summary).toBe('Kurz');
		expect(document.language).toBe('en');
		expect(document.mapId).toBe('crime-city');
	});

	it('updates the objective, culprit and hint as one history-friendly command', () => {
		const document = addEntity(
			base(),
			{ kind: 'character', name: 'Gärtner', position: { x: 50, y: 50 } },
			later
		);
		const changed = updateCaseChallenge(
			document,
			{
				objective: 'Wer hat den Schlüssel gestohlen?',
				solutionEntityId: 'gaertner',
				hint: 'Suche beim Bahnhof.'
			},
			later
		);
		expect(changed.challenge).toEqual({
			objective: 'Wer hat den Schlüssel gestohlen?',
			solutionEntityId: 'gaertner',
			hint: 'Suche beim Bahnhof.'
		});
		expect(changed.updatedAt).toBe(later.toISOString());
		expect(document.challenge).toEqual({ objective: '', solutionEntityId: null, hint: '' });
	});
});
