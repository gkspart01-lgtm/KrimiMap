import { describe, expect, it } from 'vitest';
import { applyCaseDraft } from '#lib/domain/case-draft-apply';
import type { CaseDraft } from '#lib/ai/contracts/case-draft';
import { createEmptyCase } from '#lib/domain/case-document';

const draft: CaseDraft = {
	schemaVersion: 1,
	title: 'Der Förster im Nebelwald',
	premise: 'Ein Förster verschwindet, und niemand will etwas gesehen haben.',
	setting: 'Nebelwald am Rand der Stadt',
	characters: [
		{ id: 'mara', name: 'Mara', role: 'Revierleiterin', description: 'Kennt jeden Pfad im Wald.' },
		{ id: 'olaf', name: 'Olaf', role: 'Förster', description: 'Verschwand in der Nacht.' }
	],
	clues: [
		{
			id: 'laterne',
			title: 'Erloschene Laterne',
			description: 'Die Laterne am Waldrand wurde gelöscht.',
			relatedCharacterIds: ['olaf']
		},
		{
			id: 'stiefel',
			title: 'Schlammige Stiefel',
			description: 'Vor Maras Hütte stehen schlammige Stiefel.',
			relatedCharacterIds: ['mara']
		}
	],
	objective: 'Finde heraus, wer den Förster zuletzt gesehen hat.',
	solution: 'mara'
};

describe('applyCaseDraft', () => {
	it('adds the drafted characters and clues with unique map positions', () => {
		const base = createEmptyCase({ title: 'Alt', now: new Date('2026-11-14T10:00:00Z') });
		const next = applyCaseDraft(base, draft, { now: new Date('2026-11-14T12:00:00Z') });

		const characters = next.entities.filter((entity) => entity.kind === 'character');
		const clues = next.entities.filter((entity) => entity.kind === 'clue');
		expect(characters.map((entity) => entity.name)).toEqual(['Mara', 'Olaf']);
		expect(clues.map((entity) => entity.name)).toEqual([
			'Erloschene Laterne',
			'Schlammige Stiefel'
		]);

		const positions = next.entities.map((entity) => `${entity.position.x}:${entity.position.y}`);
		expect(new Set(positions).size).toBe(positions.length);

		for (const entity of next.entities) {
			expect(entity.position.x).toBeGreaterThanOrEqual(0);
			expect(entity.position.x).toBeLessThanOrEqual(2400);
			expect(entity.position.y).toBeGreaterThanOrEqual(0);
			expect(entity.position.y).toBeLessThanOrEqual(1600);
		}
	});

	it('points the challenge at the drafted solution character', () => {
		const base = createEmptyCase({ title: 'Alt', now: new Date('2026-11-14T10:00:00Z') });
		const next = applyCaseDraft(base, draft, { now: new Date('2026-11-14T12:00:00Z') });

		const solution = next.entities.find((entity) => entity.id === next.challenge.solutionEntityId);
		expect(solution?.name).toBe('Mara');
		expect(solution?.kind).toBe('character');
		expect(next.challenge.objective).toBe(draft.objective);
	});

	it('links clues to the entities of their related characters', () => {
		const base = createEmptyCase({ title: 'Alt', now: new Date('2026-11-14T10:00:00Z') });
		const next = applyCaseDraft(base, draft, { now: new Date('2026-11-14T12:00:00Z') });

		const lantern = next.entities.find((entity) => entity.name === 'Erloschene Laterne');
		const olaf = next.entities.find((entity) => entity.name === 'Olaf');
		expect(lantern?.relatedEntityIds).toEqual([olaf?.id]);
	});

	it('takes the case title and summary from the draft', () => {
		const base = createEmptyCase({ title: 'Alt', now: new Date('2026-11-14T10:00:00Z') });
		const next = applyCaseDraft(base, draft, { now: new Date('2026-11-14T12:00:00Z') });
		expect(next.title).toBe(draft.title);
		expect(next.summary).toBe(draft.premise);
	});

	it('leaves the existing case untouched', () => {
		const base = createEmptyCase({ title: 'Alt', now: new Date('2026-11-14T10:00:00Z') });
		const snapshot = JSON.parse(JSON.stringify(base));
		applyCaseDraft(base, draft, { now: new Date('2026-11-14T12:00:00Z') });
		expect(base).toEqual(snapshot);
	});

	it('rejects a draft whose solution is not one of its characters', () => {
		const base = createEmptyCase({ title: 'Alt', now: new Date('2026-11-14T10:00:00Z') });
		const broken: CaseDraft = { ...draft, solution: 'unbekannt' };
		expect(() => applyCaseDraft(base, broken, { now: new Date() })).toThrowError(/Lösung/);
	});
});
