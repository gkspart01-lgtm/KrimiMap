import { describe, expect, it } from 'vitest';
import {
	extractJsonObject,
	validateCaseDraft,
	type CaseDraft
} from '../../src/lib/ai/contracts/case-draft';

const validDraft: CaseDraft = {
	schemaVersion: 1,
	title: 'Der Fall im Nebelwald',
	premise: 'Ein Förster verschwindet, kurz nachdem ein Wanderer einen Schrei gehört hat.',
	setting: 'Kleines Dorf am Waldrand, 1920er Jahre',
	objective: 'Finde heraus, wer den Förster zuletzt gesehen hat.',
	solution: 'Der Müller log, weil er die Tatzeit verschleiern wollte.',
	characters: [
		{
			id: 'forester',
			name: 'Hannes Ebert',
			role: 'Förster',
			description: 'Verschwunden seit Dienstag.'
		},
		{
			id: 'miller',
			name: 'Klara Mühl',
			role: 'Müllerin',
			description: 'Behauptet, ihn nicht gesehen zu haben.'
		}
	],
	clues: [
		{
			id: 'boots',
			title: 'Schlammige Stiefel',
			description: 'Die Stiefel der Müllerin sind frisch verschmutzt.',
			relatedCharacterIds: ['miller']
		}
	]
};

describe('validateCaseDraft', () => {
	it('accepts a complete draft', () => {
		const result = validateCaseDraft(validDraft);
		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.draft.characters).toHaveLength(2);
			expect(result.draft.clues[0].relatedCharacterIds).toEqual(['miller']);
		}
	});

	it('rejects non-objects', () => {
		const result = validateCaseDraft('nope');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.issues[0].path).toBe('$');
	});

	it('reports a missing schema version', () => {
		const result = validateCaseDraft({ ...validDraft, schemaVersion: 2 });
		expect(result.ok).toBe(false);
		if (!result.ok)
			expect(result.issues).toContainEqual({ path: '$.schemaVersion', message: 'expected 1' });
	});

	it('reports duplicate ids', () => {
		const result = validateCaseDraft({
			...validDraft,
			characters: [validDraft.characters[0], validDraft.characters[0]]
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.some((issue) => issue.message === 'duplicate id')).toBe(true);
		}
	});

	it('reports broken character references in clues', () => {
		const result = validateCaseDraft({
			...validDraft,
			clues: [{ ...validDraft.clues[0], relatedCharacterIds: ['ghost'] }]
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues).toContainEqual({
				path: '$.clues[0].relatedCharacterIds[0]',
				message: 'unknown character id "ghost"'
			});
		}
	});

	it('rejects empty arrays and blank strings', () => {
		const result = validateCaseDraft({ ...validDraft, characters: [], title: '   ' });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			const paths = result.issues.map((issue) => issue.path);
			expect(paths).toContain('$.characters');
			expect(paths).toContain('$.title');
		}
	});

	it('rejects ids that are not kebab-case', () => {
		const result = validateCaseDraft({
			...validDraft,
			characters: [{ ...validDraft.characters[0], id: 'Forester One' }]
		});
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues.some((issue) => issue.message.includes('kebab-case'))).toBe(true);
		}
	});
});

describe('extractJsonObject', () => {
	it('parses a bare object', () => {
		expect(extractJsonObject('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
	});

	it('ignores prose and code fences', () => {
		const text = 'Here is the case:\n```json\n{"a": 2}\n```\nHope that helps.';
		expect(extractJsonObject(text)).toEqual({ ok: true, value: { a: 2 } });
	});

	it('reports text without JSON', () => {
		const result = extractJsonObject('I cannot help with that.');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toContain('no JSON object');
	});

	it('reports malformed JSON', () => {
		const result = extractJsonObject('{oops}');
		expect(result.ok).toBe(false);
	});
});
