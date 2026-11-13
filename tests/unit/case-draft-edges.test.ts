import { describe, expect, it } from 'vitest';
import {
	extractJsonObject,
	repairDraftIds,
	toDraftId,
	validateCaseDraft
} from '../../src/lib/ai/contracts/case-draft';

const base = {
	schemaVersion: 1,
	title: 'Titel',
	premise: 'Prämisse',
	setting: 'Setting',
	objective: 'Ziel',
	solution: 'Lösung',
	characters: [{ id: 'a', name: 'A', role: 'r', description: 'd' }],
	clues: [{ id: 'c', title: 'T', description: 'D', relatedCharacterIds: ['a'] }]
};

function issuesOf(input: unknown): string[] {
	const result = validateCaseDraft(input);
	return result.ok ? [] : result.issues.map((issue) => `${issue.path}: ${issue.message}`);
}

describe('validateCaseDraft: field limits', () => {
	it('reports over-long text fields', () => {
		const issues = issuesOf({
			...base,
			title: 'x'.repeat(201),
			setting: 'y'.repeat(401)
		});
		expect(issues).toContain('$.title: longer than 200 characters');
		expect(issues).toContain('$.setting: longer than 400 characters');
	});

	it('reports over-long character and clue fields', () => {
		const issues = issuesOf({
			...base,
			characters: [
				{
					id: 'x'.repeat(81),
					name: 'n'.repeat(121),
					role: 'r'.repeat(121),
					description: 'd'
				}
			],
			clues: [{ id: 'c', title: 't'.repeat(161), description: 'd', relatedCharacterIds: [] }]
		});
		expect(issues.some((issue) => issue.includes('$.characters[0].id: longer than 80'))).toBe(true);
		expect(issues.some((issue) => issue.includes('$.characters[0].name: longer than 120'))).toBe(
			true
		);
		expect(issues.some((issue) => issue.includes('$.characters[0].role: longer than 120'))).toBe(
			true
		);
		expect(issues.some((issue) => issue.includes('$.clues[0].title: longer than 160'))).toBe(true);
	});
});

describe('validateCaseDraft: malformed collections', () => {
	it('reports entries that are not objects', () => {
		const issues = issuesOf({ ...base, characters: ['nope'], clues: [42] });
		expect(issues).toContain('$.characters[0]: expected an object');
		expect(issues).toContain('$.clues[0]: expected an object');
	});

	it('reports a missing relatedCharacterIds array', () => {
		const issues = issuesOf({
			...base,
			clues: [{ id: 'c', title: 'T', description: 'D' }]
		});
		expect(issues).toContain('$.clues[0].relatedCharacterIds: expected an array');
	});

	it('reports non-string and malformed references', () => {
		const issues = issuesOf({
			...base,
			clues: [
				{
					id: 'c',
					title: 'T',
					description: 'D',
					relatedCharacterIds: [7, 'Kein Slug']
				}
			]
		});
		expect(issues).toContain('$.clues[0].relatedCharacterIds[0]: expected a non-empty string');
		expect(issues).toContain(
			'$.clues[0].relatedCharacterIds[1]: expected a lowercase kebab-case id'
		);
	});

	it('accepts a valid reference array with an empty list', () => {
		expect(
			validateCaseDraft({
				...base,
				clues: [{ id: 'c', title: 'T', description: 'D', relatedCharacterIds: [] }]
			}).ok
		).toBe(true);
	});

	it('reports a missing schema version on otherwise valid input', () => {
		const { schemaVersion: _omitted, ...withoutVersion } = base;
		expect(issuesOf(withoutVersion)).toContain('$.schemaVersion: expected 1');
	});

	it('reports unknown references when characters are valid', () => {
		const issues = issuesOf({
			...base,
			clues: [{ id: 'c', title: 'T', description: 'D', relatedCharacterIds: ['ghost'] }]
		});
		expect(issues).toContain('$.clues[0].relatedCharacterIds[0]: unknown character id "ghost"');
	});
});

describe('extractJsonObject: fences', () => {
	it('handles a fence without a language tag', () => {
		expect(extractJsonObject('```\n{"a":3}\n```')).toEqual({ ok: true, value: { a: 3 } });
	});

	it('keeps nested braces intact', () => {
		expect(extractJsonObject('{"a":{"b":[1,2]}}')).toEqual({
			ok: true,
			value: { a: { b: [1, 2] } }
		});
	});
});

describe('repairDraftIds: fallbacks', () => {
	it('derives an id from the name when the id is missing', () => {
		const { value, changes } = repairDraftIds({
			characters: [{ name: 'Klara Mühl', role: 'Müllerin', description: 'x' }],
			clues: [{ title: 'Stiefel', description: 'y', relatedCharacterIds: [] }]
		});
		const characters = (value as { characters: { id: string }[] }).characters;
		const clues = (value as { clues: { id: string }[] }).clues;
		expect(characters[0].id).toBe('klara-muehl');
		expect(clues[0].id).toBe('stiefel');
		expect(changes.some((change) => change.includes('id missing'))).toBe(true);
	});

	it('falls back to a generic id when nothing usable is present', () => {
		const { value } = repairDraftIds({
			characters: [{ name: '🎲', role: 'r', description: 'd' }],
			clues: [{ title: '?!', description: 'd', relatedCharacterIds: [] }]
		});
		const characters = (value as { characters: { id: string }[] }).characters;
		expect(characters[0].id).toBe('charakter-1');
	});

	it('leaves entries alone that are not objects', () => {
		const { value } = repairDraftIds({ characters: ['x'], clues: [null] });
		expect((value as { characters: unknown[] }).characters).toEqual(['x']);
	});

	it('ignores non-string references', () => {
		const { value } = repairDraftIds({
			characters: [{ id: 'a', name: 'A', role: 'r', description: 'd' }],
			clues: [{ id: 'c', title: 'T', description: 'D', relatedCharacterIds: [5, 'a'] }]
		});
		const clues = (value as { clues: { relatedCharacterIds: string[] }[] }).clues;
		expect(clues[0].relatedCharacterIds).toEqual(['a']);
	});

	it('does not invent an array when relatedCharacterIds is missing', () => {
		const { value } = repairDraftIds({
			characters: [{ id: 'a', name: 'A', role: 'r', description: 'd' }],
			clues: [{ id: 'c', title: 'T', description: 'D' }]
		});
		const clues = (value as { clues: { relatedCharacterIds?: unknown }[] }).clues;
		expect(clues[0].relatedCharacterIds).toBeUndefined();
		// The validator then reports the missing array instead of silently passing.
		expect(issuesOf(value)).toContain('$.clues[0].relatedCharacterIds: expected an array');
	});

	it('treats non-object input as untouched', () => {
		expect(repairDraftIds(null)).toEqual({ value: null, changes: [] });
	});

	it('never produces an empty id', () => {
		expect(toDraftId('---')).toBe('');
	});
});
