import { describe, expect, it } from 'vitest';
import {
	aiSessionBusy,
	canRequestDraft,
	INITIAL_AI_SESSION,
	reduceAiSession,
	type AiSessionState
} from '#lib/ai/session';
import type { CaseDraft } from '#lib/ai/contracts/case-draft';

const draft: CaseDraft = {
	schemaVersion: 1,
	title: 'Der Förster im Nebelwald',
	premise: 'Ein Förster verschwindet.',
	setting: 'Nebelwald',
	characters: [
		{ id: 'mara', name: 'Mara', role: 'Revierleiterin', description: 'Kennt jeden Pfad.' }
	],
	clues: [
		{ id: 'laterne', title: 'Laterne', description: 'Erloschen.', relatedCharacterIds: ['mara'] }
	],
	objective: 'Finde die gesuchte Figur.',
	solution: 'mara'
};

function state(overrides: Partial<AiSessionState> = {}): AiSessionState {
	return { ...INITIAL_AI_SESSION, status: 'idle', ...overrides };
}

describe('reduceAiSession', () => {
	it('reports an unavailable provider without offering generation', () => {
		const next = reduceAiSession(INITIAL_AI_SESSION, {
			type: 'unavailable',
			reason: 'Kein WebGPU'
		});
		expect(next.status).toBe('unavailable');
		expect(next.error).toBe('Kein WebGPU');
		expect(canRequestDraft(next, 'Ein Förster verschwindet')).toBe(false);
	});

	it('tracks preparation progress and stays busy', () => {
		const preparing = reduceAiSession(state(), { type: 'preparing', message: 'Modell lädt 42 %' });
		expect(preparing.status).toBe('preparing');
		expect(preparing.message).toBe('Modell lädt 42 %');
		expect(aiSessionBusy(preparing)).toBe(true);
	});

	it('offers generation only for a real topic while idle', () => {
		expect(canRequestDraft(state(), 'ab')).toBe(false);
		expect(canRequestDraft(state(), 'Der Förster im Nebelwald')).toBe(true);
		expect(canRequestDraft(state({ status: 'generating' }), 'Der Förster im Nebelwald')).toBe(
			false
		);
	});

	it('keeps the draft and its repairs separate from the case', () => {
		const next = reduceAiSession(state({ status: 'generating' }), {
			type: 'draft',
			draft,
			repairs: ['characters[0].id "Mara" → "mara"']
		});
		expect(next.status).toBe('draft');
		expect(next.draft?.title).toBe(draft.title);
		expect(next.repairs).toEqual(['characters[0].id "Mara" → "mara"']);
		expect(aiSessionBusy(next)).toBe(false);
	});

	it('shows a failure and allows a new attempt', () => {
		const failed = reduceAiSession(state({ status: 'generating' }), {
			type: 'failed',
			message: 'Modell abgebrochen'
		});
		expect(failed.status).toBe('failed');
		expect(failed.error).toBe('Modell abgebrochen');
		expect(failed.draft).toBeNull();
		expect(canRequestDraft(failed, 'Der Förster im Nebelwald')).toBe(true);
	});

	it('drops a pending draft on reset', () => {
		const withDraft = reduceAiSession(state(), { type: 'draft', draft, repairs: [] });
		const reset = reduceAiSession(withDraft, { type: 'reset' });
		expect(reset.status).toBe('idle');
		expect(reset.draft).toBeNull();
		expect(reset.repairs).toEqual([]);
	});
});
