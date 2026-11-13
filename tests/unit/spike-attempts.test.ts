import { describe, expect, it } from 'vitest';
import {
	runCaseDraftAttempts,
	type LoadedEngine,
	type StructuredMode
} from '../../src/lib/ai/local/webllm-spike';

const validDraft = JSON.stringify({
	schemaVersion: 1,
	title: 'Der Fall im Nebelwald',
	premise: 'Ein Förster verschwindet.',
	setting: 'Dorf am Waldrand',
	objective: 'Finde den Täter.',
	solution: 'Die Müllerin log.',
	characters: [
		{ id: 'forester', name: 'Hannes', role: 'Förster', description: 'Verschwunden.' },
		{ id: 'miller', name: 'Klara', role: 'Müllerin', description: 'Log.' }
	],
	clues: [
		{
			id: 'boots',
			title: 'Stiefel',
			description: 'Verschmutzt.',
			relatedCharacterIds: ['miller']
		}
	]
});

/** Engine double: replays canned answers and records the requests it received. */
function fakeEngine(responses: string[]) {
	const requests: Record<string, unknown>[] = [];
	let call = 0;
	const engine = {
		chat: {
			completions: {
				create: async (request: Record<string, unknown>) => {
					requests.push(request);
					const text = responses[Math.min(call, responses.length - 1)];
					call += 1;
					return (async function* () {
						yield { choices: [{ delta: { content: text } }] };
						yield { choices: [{ delta: {} }], usage: { completion_tokens: 10, prompt_tokens: 5 } };
					})();
				}
			}
		},
		interruptGenerate: () => undefined,
		unload: () => undefined
	};
	return { engine: engine as unknown as LoadedEngine, requests };
}

describe('runCaseDraftAttempts', () => {
	it('retries after a broken JSON answer and reports both attempts', async () => {
		const { engine } = fakeEngine(['{"schemaVersion": 1, "title": "Der Fa', validDraft]);
		const result = await runCaseDraftAttempts(engine, 'Nebelwald', {
			maxAttempts: 2,
			mode: 'text'
		});

		expect(result.ok).toBe(true);
		expect(result.attempts).toHaveLength(2);
		expect(result.attempts[0].jsonOk).toBe(false);
		expect(result.attempts[0].validation).toContain('JSON parse failed');
		expect(result.attempts[1].validation).toBe('schema-conform');
		expect(result.draft?.title).toBe('Der Fall im Nebelwald');
	});

	it('gives up after the configured number of attempts', async () => {
		const { engine } = fakeEngine(['not json at all']);
		const result = await runCaseDraftAttempts(engine, 'Nebelwald', {
			maxAttempts: 3,
			mode: 'text'
		});

		expect(result.ok).toBe(false);
		expect(result.attempts).toHaveLength(3);
		expect(result.draft).toBeUndefined();
	});

	it('reports schema violations instead of accepting the draft', async () => {
		const broken = JSON.stringify({ ...JSON.parse(validDraft), characters: [] });
		const { engine } = fakeEngine([broken]);
		const result = await runCaseDraftAttempts(engine, 'Nebelwald', {
			maxAttempts: 1,
			mode: 'json_object'
		});

		expect(result.ok).toBe(false);
		expect(result.attempts[0].jsonOk).toBe(true);
		expect(result.attempts[0].validation).toContain('$.characters');
	});

	it('asks the runtime to constrain the answer in structured modes only', async () => {
		const text = fakeEngine([validDraft]);
		await runCaseDraftAttempts(text.engine, 'Nebelwald', { maxAttempts: 1, mode: 'text' });
		expect(text.requests[0].response_format).toBeUndefined();

		for (const mode of ['json_object', 'json_schema'] as StructuredMode[]) {
			const structured = fakeEngine([validDraft]);
			await runCaseDraftAttempts(structured.engine, 'Nebelwald', { maxAttempts: 1, mode });
			const format = structured.requests[0].response_format as Record<string, unknown>;
			expect(format.type).toBe('json_object');
			if (mode === 'json_schema') {
				expect(typeof format.schema).toBe('string');
				expect(format.schema as string).toContain('schemaVersion');
			} else {
				expect(format.schema).toBeUndefined();
			}
		}
	});
});
