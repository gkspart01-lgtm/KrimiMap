import { describe, expect, it } from 'vitest';
import {
	repairDraftIds,
	toDraftId,
	validateCaseDraft
} from '../../src/lib/ai/contracts/case-draft';

describe('toDraftId', () => {
	it('slugifies names and umlauts', () => {
		expect(toDraftId('Klara Mühl')).toBe('klara-muehl');
		expect(toDraftId('Hannes Ebert!')).toBe('hannes-ebert');
		expect(toDraftId('   ')).toBe('');
		expect(toDraftId('ÖL-Fass Nr. 7')).toBe('oel-fass-nr-7');
	});
});

describe('repairDraftIds', () => {
	it('lowercases ids and keeps them referencable', () => {
		const input = {
			characters: [
				{ id: 'Forester', name: 'Hannes', role: 'Förster', description: 'x' },
				{ id: 'Müllerin', name: 'Klara', role: 'Müllerin', description: 'y' }
			],
			clues: [
				{
					id: 'Boots',
					title: 'Stiefel',
					description: 'z',
					relatedCharacterIds: ['Forester']
				}
			]
		};

		const { value, changes } = repairDraftIds(input);
		const characters = (value as { characters: { id: string }[] }).characters;
		const clues = (value as { clues: { id: string; relatedCharacterIds: string[] }[] }).clues;

		expect(characters[0].id).toBe('forester');
		expect(characters[1].id).toBe('muellerin');
		expect(clues[0].id).toBe('boots');
		expect(clues[0].relatedCharacterIds).toEqual(['forester']);
		expect(changes.length).toBeGreaterThan(0);
	});

	it('makes duplicate ids unique', () => {
		const input = {
			characters: [
				{ id: 'zeuge', name: 'A', role: 'a', description: 'a' },
				{ id: 'zeuge', name: 'B', role: 'b', description: 'b' }
			],
			clues: []
		};

		const { value, changes } = repairDraftIds(input);
		const ids = (value as { characters: { id: string }[] }).characters.map((c) => c.id);
		expect(new Set(ids).size).toBe(2);
		expect(changes.some((change) => change.includes('→ "zeuge-2"'))).toBe(true);
	});

	it('resolves a dangling reference by a unique slug match', () => {
		const input = {
			characters: [{ id: 'eorid-der-foerster', name: 'Eorid', role: 'Förster', description: 'x' }],
			clues: [{ id: 'spur', title: 'Spur', description: 'y', relatedCharacterIds: ['eorid'] }]
		};

		const { value, changes } = repairDraftIds(input);
		const clues = (value as { clues: { relatedCharacterIds: string[] }[] }).clues;
		expect(clues[0].relatedCharacterIds).toEqual(['eorid-der-foerster']);
		expect(changes.some((change) => change.includes('"eorid" → "eorid-der-foerster"'))).toBe(true);
	});

	it('drops references that cannot be resolved', () => {
		const input = {
			characters: [{ id: 'zeuge', name: 'A', role: 'a', description: 'a' }],
			clues: [{ id: 'spur', title: 'Spur', description: 'y', relatedCharacterIds: ['unbekannt'] }]
		};

		const { value, changes } = repairDraftIds(input);
		const clues = (value as { clues: { relatedCharacterIds: string[] }[] }).clues;
		expect(clues[0].relatedCharacterIds).toEqual([]);
		expect(changes.some((change) => change.includes('dropped'))).toBe(true);
	});

	it('turns a broken model answer into a valid draft', () => {
		// Shape reported from the phone run: capitalised ids, a repeated id and a
		// reference to an id that was never defined.
		const modelAnswer = {
			schemaVersion: 1,
			title: 'Der Fall im Nebelwald',
			premise: 'Ein Förster verschwindet.',
			setting: 'Dorf am Waldrand',
			objective: 'Finde den Täter.',
			solution: 'Die Müllerin log.',
			characters: [
				{ id: 'Eorid', name: 'Eorid', role: 'Förster', description: 'Verschwunden.' },
				{ id: 'Eorid', name: 'Klara', role: 'Müllerin', description: 'Log.' }
			],
			clues: [
				{
					id: 'Boots',
					title: 'Stiefel',
					description: 'Verschmutzt.',
					relatedCharacterIds: ['eorid']
				}
			]
		};

		expect(validateCaseDraft(modelAnswer).ok).toBe(false);

		const { value } = repairDraftIds(modelAnswer);
		const result = validateCaseDraft(value);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.draft.characters.map((c) => c.id)).toEqual(['eorid', 'eorid-2']);
			expect(result.draft.clues[0].relatedCharacterIds).toEqual(['eorid']);
		}
	});

	it('leaves non-objects untouched', () => {
		expect(repairDraftIds('nope').value).toBe('nope');
	});
});
