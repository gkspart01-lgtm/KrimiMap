/**
 * Provider-neutral contract for an AI-generated case draft.
 *
 * AI output is always a *draft*: it is parsed and validated here before a
 * creator can apply it. The validator is intentionally hand-written and
 * dependency-free so the domain layer stays framework- and vendor-free.
 */

export interface CaseDraftCharacter {
	id: string;
	name: string;
	role: string;
	description: string;
}

export interface CaseDraftClue {
	id: string;
	title: string;
	description: string;
	relatedCharacterIds: string[];
}

export interface CaseDraft {
	schemaVersion: 1;
	title: string;
	premise: string;
	setting: string;
	characters: CaseDraftCharacter[];
	clues: CaseDraftClue[];
	objective: string;
	solution: string;
}

export interface ValidationIssue {
	path: string;
	message: string;
}

export type ValidationResult =
	{ ok: true; draft: CaseDraft } | { ok: false; issues: ValidationIssue[] };

const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
	value: unknown,
	path: string,
	issues: ValidationIssue[],
	{ maxLength = 2000 }: { maxLength?: number } = {}
): string {
	if (typeof value !== 'string' || value.trim().length === 0) {
		issues.push({ path, message: 'expected a non-empty string' });
		return '';
	}
	if (value.length > maxLength) {
		issues.push({ path, message: `longer than ${maxLength} characters` });
	}
	return value;
}

function requireId(value: unknown, path: string, issues: ValidationIssue[]): string {
	const id = requireString(value, path, issues, { maxLength: 80 });
	if (id && !ID_PATTERN.test(id)) {
		issues.push({ path, message: 'expected a lowercase kebab-case id' });
	}
	return id;
}

/**
 * Validate an unknown value (parsed JSON from a model or an import) against the
 * case-draft contract. Collects every issue instead of failing fast so a
 * creator can see all problems at once.
 */
export function validateCaseDraft(input: unknown): ValidationResult {
	const issues: ValidationIssue[] = [];

	if (!isRecord(input)) {
		return { ok: false, issues: [{ path: '$', message: 'expected an object' }] };
	}

	if (input.schemaVersion !== 1) {
		issues.push({ path: '$.schemaVersion', message: 'expected 1' });
	}

	const draft: CaseDraft = {
		schemaVersion: 1,
		title: requireString(input.title, '$.title', issues, { maxLength: 200 }),
		premise: requireString(input.premise, '$.premise', issues),
		setting: requireString(input.setting, '$.setting', issues, { maxLength: 400 }),
		objective: requireString(input.objective, '$.objective', issues),
		solution: requireString(input.solution, '$.solution', issues),
		characters: [],
		clues: []
	};

	const characterIds = new Set<string>();

	if (!Array.isArray(input.characters) || input.characters.length === 0) {
		issues.push({ path: '$.characters', message: 'expected a non-empty array' });
	} else {
		input.characters.forEach((raw, index) => {
			const path = `$.characters[${index}]`;
			if (!isRecord(raw)) {
				issues.push({ path, message: 'expected an object' });
				return;
			}
			const id = requireId(raw.id, `${path}.id`, issues);
			if (id) {
				if (characterIds.has(id)) issues.push({ path: `${path}.id`, message: 'duplicate id' });
				characterIds.add(id);
			}
			draft.characters.push({
				id,
				name: requireString(raw.name, `${path}.name`, issues, { maxLength: 120 }),
				role: requireString(raw.role, `${path}.role`, issues, { maxLength: 120 }),
				description: requireString(raw.description, `${path}.description`, issues)
			});
		});
	}

	if (!Array.isArray(input.clues) || input.clues.length === 0) {
		issues.push({ path: '$.clues', message: 'expected a non-empty array' });
	} else {
		const clueIds = new Set<string>();
		input.clues.forEach((raw, index) => {
			const path = `$.clues[${index}]`;
			if (!isRecord(raw)) {
				issues.push({ path, message: 'expected an object' });
				return;
			}
			const id = requireId(raw.id, `${path}.id`, issues);
			if (id) {
				if (clueIds.has(id)) issues.push({ path: `${path}.id`, message: 'duplicate id' });
				clueIds.add(id);
			}

			const related: string[] = [];
			if (!Array.isArray(raw.relatedCharacterIds)) {
				issues.push({ path: `${path}.relatedCharacterIds`, message: 'expected an array' });
			} else {
				raw.relatedCharacterIds.forEach((reference, referenceIndex) => {
					const referencePath = `${path}.relatedCharacterIds[${referenceIndex}]`;
					if (typeof reference !== 'string' || reference.trim().length === 0) {
						issues.push({ path: referencePath, message: 'expected a non-empty string' });
						return;
					}
					if (!ID_PATTERN.test(reference)) {
						issues.push({ path: referencePath, message: 'expected a lowercase kebab-case id' });
					}
					// Broken references must be reported before a case can be saved.
					if (characterIds.size > 0 && !characterIds.has(reference)) {
						issues.push({ path: referencePath, message: `unknown character id "${reference}"` });
					}
					related.push(reference);
				});
			}

			draft.clues.push({
				id,
				title: requireString(raw.title, `${path}.title`, issues, { maxLength: 160 }),
				description: requireString(raw.description, `${path}.description`, issues),
				relatedCharacterIds: related
			});
		});
	}

	return issues.length === 0 ? { ok: true, draft } : { ok: false, issues };
}

/**
 * Pull the first JSON object out of a model response. Models wrap JSON in
 * prose or Markdown fences often enough that fenced output must not be treated
 * as a failure on its own.
 */
export function extractJsonObject(
	text: string
): { ok: true; value: unknown } | { ok: false; reason: string } {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1] : text;
	const start = candidate.indexOf('{');
	const end = candidate.lastIndexOf('}');
	if (start === -1 || end === -1 || end < start) {
		return { ok: false, reason: 'no JSON object found in the response' };
	}
	try {
		return { ok: true, value: JSON.parse(candidate.slice(start, end + 1)) };
	} catch (cause) {
		return { ok: false, reason: cause instanceof Error ? cause.message : String(cause) };
	}
}
