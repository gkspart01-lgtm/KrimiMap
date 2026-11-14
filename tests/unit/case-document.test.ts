import { describe, expect, it } from 'vitest';
import {
	CASE_SCHEMA_VERSION,
	CaseFormatError,
	caseErrors,
	createCaseId,
	createEmptyCase,
	ENTITY_KIND_COLORS,
	migrateCase,
	slugify,
	uniqueId,
	validateCase,
	type CaseDocument
} from '#lib/domain/case-document';

function withEntity(document: CaseDocument): CaseDocument {
	return {
		...document,
		entities: [
			{
				id: 'pfoertner',
				kind: 'character',
				name: 'Pförtner',
				description: '',
				position: { x: 100, y: 100 },
				color: ENTITY_KIND_COLORS.character,
				relatedEntityIds: []
			}
		]
	};
}

describe('slugify / uniqueId', () => {
	it('transliterates German umlauts and collapses punctuation', () => {
		expect(slugify('Pförtner Müller-Straße')).toBe('pfoertner-mueller-strasse');
	});

	it('never returns an empty id', () => {
		expect(slugify('***')).toBe('eintrag');
	});

	it('appends a counter until the id is free', () => {
		expect(uniqueId('Tür', [])).toBe('tuer');
		expect(uniqueId('Tür', ['tuer'])).toBe('tuer-2');
		expect(uniqueId('Tür', ['tuer', 'tuer-2'])).toBe('tuer-3');
	});

	it('builds sortable case ids from the timestamp', () => {
		const id = createCaseId(new Date('2026-11-13T10:00:00Z'));
		expect(id).toMatch(/^20261113100000-[0-9a-f]{3}$/);
	});
});

describe('createEmptyCase', () => {
	it('starts with a blank challenge and a shared-map reference', () => {
		const document = createEmptyCase({ title: '  Der Fall  ' });
		expect(document.schemaVersion).toBe(CASE_SCHEMA_VERSION);
		expect(document.title).toBe('Der Fall');
		expect(document.mapId).toBe('crime-city');
		expect(document.challenge).toEqual({ objective: '', solutionEntityId: null, hint: '' });
		expect(validateCase(document).filter((issue) => issue.severity === 'error')).toEqual([]);
	});

	it('migrates version-2 cases to a blank challenge', () => {
		const migrated = migrateCase({
			schemaVersion: 2,
			id: 'case-v2',
			title: 'Altfall',
			summary: 'Eine Spur',
			language: 'de',
			mapId: 'crime-city',
			entities: [],
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-02T00:00:00.000Z'
		});
		expect(migrated.schemaVersion).toBe(CASE_SCHEMA_VERSION);
		expect(migrated.challenge).toEqual({ objective: '', solutionEntityId: null, hint: '' });
		expect(migrated.updatedAt).toBe('2026-01-02T00:00:00.000Z');
	});

	it('migrates old map coordinates proportionally onto the shared map', () => {
		const migrated = migrateCase({
			schemaVersion: 1,
			id: 'old-case',
			title: 'Alter Fall',
			language: 'de',
			map: { width: 6000, height: 400 },
			entities: [
				{
					id: 'clue',
					kind: 'clue',
					name: 'Spur',
					description: '',
					position: { x: 3000, y: 200 },
					color: ENTITY_KIND_COLORS.clue,
					relatedEntityIds: []
				}
			],
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-01T00:00:00.000Z'
		});

		expect(migrated.schemaVersion).toBe(CASE_SCHEMA_VERSION);
		expect(migrated.mapId).toBe('crime-city');
		expect(migrated.entities[0].position).toEqual({ x: 1200, y: 800 });
	});

	it('warns about an empty case instead of rejecting it', () => {
		const issues = validateCase(createEmptyCase());
		expect(issues.map((issue) => issue.message)).toContain('Der Fall ist noch leer');
		expect(caseErrors(createEmptyCase())).toEqual([]);
	});
});

describe('validateCase', () => {
	it('accepts a case with one entity and warns about the missing clue', () => {
		const issues = validateCase(withEntity(createEmptyCase()));
		expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
		expect(issues.some((issue) => issue.message.includes('Kein Hinweis'))).toBe(true);
	});

	it('rejects empty titles, bad colours and out-of-map positions', () => {
		const document = withEntity(createEmptyCase());
		document.entities[0].color = 'red';
		document.entities[0].position = { x: 99999, y: -5 };
		const messages = caseErrors({ ...document, title: '   ' }).map((issue) => issue.path);
		expect(messages).toEqual(
			expect.arrayContaining(['title', 'entities[0].color', 'entities[0].position'])
		);
	});

	it('reports duplicate ids and dangling references', () => {
		const document = withEntity(createEmptyCase());
		const duplicate = { ...document.entities[0], name: 'Zweiter Pförtner' };
		const broken = {
			...document,
			entities: [{ ...document.entities[0], relatedEntityIds: ['gibtsnicht'] }, duplicate]
		};
		const issues = caseErrors(broken).map((issue) => issue.message);
		expect(issues).toContain('ID ist doppelt vergeben');
		expect(issues.some((message) => message.includes('unbekannte ID "gibtsnicht"'))).toBe(true);
	});

	it('rejects an entity that references itself', () => {
		const document = withEntity(createEmptyCase());
		const self = {
			...document,
			entities: [{ ...document.entities[0], relatedEntityIds: ['pfoertner'] }]
		};
		expect(caseErrors(self).map((issue) => issue.message)).toContain(
			'darf nicht auf sich selbst zeigen'
		);
	});

	it('rejects unknown kinds and non-kebab ids', () => {
		const document = withEntity(createEmptyCase());
		const broken = {
			...document,
			entities: [{ ...document.entities[0], id: 'Pförtner', kind: 'monster' as never }]
		};
		const paths = caseErrors(broken).map((issue) => issue.path);
		expect(paths).toEqual(expect.arrayContaining(['entities[0].id', 'entities[0].kind']));
	});

	it('treats array-shaped challenges as missing instead of reading fields from them', () => {
		const document = createEmptyCase();
		const broken = { ...document, challenge: [] as unknown as CaseDocument['challenge'] };
		expect(caseErrors(broken).map((issue) => issue.code)).toEqual(['challenge.missing']);
	});

	it('requires an existing character as the solution entity', () => {
		const document = withEntity(createEmptyCase());
		const valid = {
			...document,
			challenge: { objective: 'Identify the culprit', solutionEntityId: 'pfoertner', hint: '' }
		};
		expect(caseErrors(valid)).toEqual([]);

		const unknown = {
			...document,
			challenge: { ...valid.challenge, solutionEntityId: 'missing' }
		};
		expect(caseErrors(unknown).map((issue) => issue.code)).toContain('challenge.solution.unknown');

		const clue = {
			...document.entities[0],
			id: 'clue',
			kind: 'clue' as const,
			color: ENTITY_KIND_COLORS.clue
		};
		const notACharacter = {
			...document,
			entities: [clue],
			challenge: { ...valid.challenge, solutionEntityId: 'clue' }
		};
		expect(caseErrors(notACharacter).map((issue) => issue.code)).toContain(
			'challenge.solution.kind'
		);
	});
});

describe('migrateCase', () => {
	it('upgrades a version-0 draft and fills the required fields', () => {
		const migrated = migrateCase({
			title: 'Alter Entwurf',
			entities: [{ name: 'Leiche im Garten', kind: 'object', position: { x: 20, y: 30 } }]
		});

		expect(migrated.schemaVersion).toBe(CASE_SCHEMA_VERSION);
		expect(migrated.id).toMatch(/^[0-9a-z-]+$/);
		expect(migrated.language).toBe('de');
		expect(migrated.mapId).toBe('crime-city');
		expect(migrated.entities[0]).toMatchObject({
			id: 'leiche-im-garten',
			kind: 'object',
			position: { x: 20, y: 30 },
			color: ENTITY_KIND_COLORS.object
		});
	});

	it('keeps an existing id and timestamps untouched', () => {
		const migrated = migrateCase({
			schemaVersion: 0,
			id: 'mein-fall',
			title: 'T',
			createdAt: '2026-01-01T00:00:00.000Z',
			updatedAt: '2026-01-02T00:00:00.000Z'
		});
		expect(migrated.id).toBe('mein-fall');
		expect(migrated.createdAt).toBe('2026-01-01T00:00:00.000Z');
		expect(migrated.updatedAt).toBe('2026-01-02T00:00:00.000Z');
	});

	it('refuses documents from a newer app version instead of guessing', () => {
		expect(() => migrateCase({ schemaVersion: 99, title: 'Zukunft' })).toThrow(CaseFormatError);
		expect(() => migrateCase({ schemaVersion: 99 })).toThrow(/neueren Version/);
	});

	it('refuses values that are not objects', () => {
		for (const value of [null, 'text', 42, []]) {
			expect(() => migrateCase(value)).toThrow(CaseFormatError);
		}
	});

	it('refuses a version without a migration step', () => {
		expect(() => migrateCase({ schemaVersion: -1 })).toThrow(CaseFormatError);
	});
});
