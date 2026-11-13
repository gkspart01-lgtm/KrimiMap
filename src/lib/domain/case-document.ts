/**
 * The case document: the single source of truth for everything the editor
 * writes and the player reads.
 *
 * Framework-free on purpose — no Svelte, no Phaser, no IndexedDB. That keeps the
 * rules unit-testable in Node and stops the storage/UI layers from inventing
 * their own idea of what a case is.
 */

/** Bumped whenever the stored shape changes in a way that needs a migration. */
export const CASE_SCHEMA_VERSION = 1;

export const ENTITY_KINDS = ['character', 'clue', 'object', 'location'] as const;
export type EntityKind = (typeof ENTITY_KINDS)[number];

export const ENTITY_KIND_LABELS: Record<EntityKind, string> = {
	character: 'Figur',
	clue: 'Hinweis',
	object: 'Objekt',
	location: 'Ort'
};

export const ENTITY_KIND_COLORS: Record<EntityKind, string> = {
	character: '#4ec9a0',
	clue: '#e8a33d',
	object: '#e5657a',
	location: '#7aa2f7'
};

export interface CasePoint {
	x: number;
	y: number;
}

export interface CaseMap {
	width: number;
	height: number;
}

export interface CaseEntity {
	/** Stable, kebab-case, unique within the case. Never derived at render time. */
	id: string;
	kind: EntityKind;
	name: string;
	description: string;
	position: CasePoint;
	color: string;
	/** Ids of other entities this one points at (a clue to a character, …). */
	relatedEntityIds: string[];
}

export interface CaseDocument {
	schemaVersion: number;
	id: string;
	title: string;
	summary: string;
	language: 'de' | 'en';
	map: CaseMap;
	entities: CaseEntity[];
	/** ISO-8601, UTC. Written by the storage layer on every save. */
	createdAt: string;
	updatedAt: string;
}

export type Severity = 'error' | 'warning';

export interface CaseIssue {
	/** JSON-ish path such as `entities[2].position.x`. */
	path: string;
	/**
	 * German diagnostic text. Kept because tests, logs and the console read it;
	 * the UI translates `code` + `params` instead when it has a translation.
	 */
	message: string;
	severity: Severity;
	/** Stable key, e.g. `entity.id.duplicate`, used for translations. */
	code?: string;
	params?: Record<string, string | number>;
}

export const MAP_LIMITS = { min: 400, max: 6000 } as const;
const MAX_TITLE_LENGTH = 120;
const MAX_NAME_LENGTH = 80;
const MAX_DESCRIPTION_LENGTH = 2000;

const KEBAB = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export class CaseFormatError extends Error {
	constructor(
		message: string,
		readonly issues: CaseIssue[] = []
	) {
		super(message);
		this.name = 'CaseFormatError';
	}
}

/** Deterministic, readable ids: names are a convenience, ids are the identity. */
export function slugify(value: string): string {
	const slug = value
		.toLowerCase()
		// Umlauts first: NFD would turn "ö" into "o" + combining mark, and the
		// German transliteration (oe) is what readers expect in an id.
		.replace(/ä/g, 'ae')
		.replace(/ö/g, 'oe')
		.replace(/ü/g, 'ue')
		.replace(/ß/g, 'ss')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 48);
	return slug || 'eintrag';
}

/** `slugify`, extended with `-2`, `-3`, … until the id is free. */
export function uniqueId(base: string, taken: Iterable<string>): string {
	const used = new Set(taken);
	const slug = slugify(base);
	if (!used.has(slug)) return slug;
	let index = 2;
	while (used.has(`${slug}-${index}`)) index += 1;
	return `${slug}-${index}`;
}

export function createCaseId(now: Date = new Date()): string {
	const stamp = now
		.toISOString()
		.replace(/[-:.TZ]/g, '')
		.slice(0, 14);
	const noise = Math.floor(Math.random() * 0x1000)
		.toString(16)
		.padStart(3, '0');
	return `${stamp}-${noise}`;
}

export interface CreateCaseInput {
	title?: string;
	language?: CaseDocument['language'];
	map?: Partial<CaseMap>;
	now?: Date;
}

export function createEmptyCase(input: CreateCaseInput = {}): CaseDocument {
	const now = (input.now ?? new Date()).toISOString();
	return {
		schemaVersion: CASE_SCHEMA_VERSION,
		id: createCaseId(input.now ?? new Date()),
		title: input.title?.trim() || 'Unbenannter Fall',
		summary: '',
		language: input.language ?? 'de',
		map: {
			width: clamp(input.map?.width ?? 2400, MAP_LIMITS.min, MAP_LIMITS.max),
			height: clamp(input.map?.height ?? 1600, MAP_LIMITS.min, MAP_LIMITS.max)
		},
		entities: [],
		createdAt: now,
		updatedAt: now
	};
}

function clamp(value: number, min: number, max: number): number {
	return Math.min(max, Math.max(min, Math.round(value)));
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value);
}

/**
 * All problems with a case, errors first. Warnings are things a creator should
 * see but that do not make the document unloadable.
 */
export function validateCase(document: CaseDocument): CaseIssue[] {
	const issues: CaseIssue[] = [];
	const error = (
		path: string,
		message: string,
		code?: string,
		params?: Record<string, string | number>
	) => issues.push({ path, message, severity: 'error', code, params });
	const warn = (
		path: string,
		message: string,
		code?: string,
		params?: Record<string, string | number>
	) => issues.push({ path, message, severity: 'warning', code, params });

	if (document.schemaVersion !== CASE_SCHEMA_VERSION) {
		error(
			'schemaVersion',
			`erwartet ${CASE_SCHEMA_VERSION}, gefunden ${document.schemaVersion}`,
			'schema.version',
			{ expected: CASE_SCHEMA_VERSION, found: document.schemaVersion }
		);
	}
	if (!document.id || typeof document.id !== 'string') {
		error('id', 'Fall-ID fehlt', 'id.missing');
	}
	if (!document.title.trim()) {
		error('title', 'Titel darf nicht leer sein', 'title.empty');
	} else if (document.title.length > MAX_TITLE_LENGTH) {
		error('title', `Titel ist länger als ${MAX_TITLE_LENGTH} Zeichen`, 'title.long', {
			max: MAX_TITLE_LENGTH
		});
	}
	if (document.language !== 'de' && document.language !== 'en') {
		error('language', 'Sprache muss "de" oder "en" sein', 'language.invalid');
	}
	if (!isFiniteNumber(document.map?.width) || !isFiniteNumber(document.map?.height)) {
		error('map', 'Kartenmaße fehlen', 'map.missing');
	} else {
		for (const axis of ['width', 'height'] as const) {
			const value = document.map[axis];
			if (value < MAP_LIMITS.min || value > MAP_LIMITS.max) {
				error(
					`map.${axis}`,
					`muss zwischen ${MAP_LIMITS.min} und ${MAP_LIMITS.max} liegen`,
					'map.range',
					{ min: MAP_LIMITS.min, max: MAP_LIMITS.max }
				);
			}
		}
	}

	const seen = new Set<string>();
	document.entities?.forEach((entity, index) => {
		const at = `entities[${index}]`;
		if (!KEBAB.test(entity.id)) {
			error(`${at}.id`, 'muss ein kleingeschriebener kebab-case-Identifier sein', 'entity.id');
		}
		if (seen.has(entity.id)) error(`${at}.id`, 'ID ist doppelt vergeben', 'entity.id.duplicate');
		seen.add(entity.id);

		if (!ENTITY_KINDS.includes(entity.kind)) {
			error(`${at}.kind`, `unbekannte Art "${String(entity.kind)}"`, 'entity.kind', {
				kind: String(entity.kind)
			});
		}
		if (!entity.name?.trim()) error(`${at}.name`, 'Name darf nicht leer sein', 'entity.name.empty');
		else if (entity.name.length > MAX_NAME_LENGTH) {
			error(`${at}.name`, `Name ist länger als ${MAX_NAME_LENGTH} Zeichen`, 'entity.name.long', {
				max: MAX_NAME_LENGTH
			});
		}
		if ((entity.description ?? '').length > MAX_DESCRIPTION_LENGTH) {
			error(
				`${at}.description`,
				`Beschreibung ist länger als ${MAX_DESCRIPTION_LENGTH} Zeichen`,
				'entity.description.long',
				{ max: MAX_DESCRIPTION_LENGTH }
			);
		}
		if (!HEX_COLOR.test(entity.color ?? '')) {
			error(`${at}.color`, 'Farbe muss ein Hex-Wert wie #4ec9a0 sein', 'entity.color');
		}
		if (!isFiniteNumber(entity.position?.x) || !isFiniteNumber(entity.position?.y)) {
			error(`${at}.position`, 'Position fehlt', 'entity.position.missing');
		} else if (
			entity.position.x < 0 ||
			entity.position.y < 0 ||
			entity.position.x > document.map.width ||
			entity.position.y > document.map.height
		) {
			error(`${at}.position`, 'liegt außerhalb der Karte', 'entity.position.outside');
		}
		if (!Array.isArray(entity.relatedEntityIds)) {
			error(`${at}.relatedEntityIds`, 'muss eine Liste sein', 'entity.related.notList');
		}
	});

	// References can only be checked once every id is known.
	document.entities?.forEach((entity, index) => {
		for (const related of entity.relatedEntityIds ?? []) {
			if (related === entity.id) {
				error(
					`entities[${index}].relatedEntityIds`,
					'darf nicht auf sich selbst zeigen',
					'entity.related.self'
				);
			} else if (!seen.has(related)) {
				error(
					`entities[${index}].relatedEntityIds`,
					`unbekannte ID "${related}"`,
					'entity.related.unknown',
					{ id: related }
				);
			}
		}
	});

	if (document.entities?.length === 0) {
		warn('entities', 'Der Fall ist noch leer', 'case.empty');
	} else if (!document.entities?.some((entity) => entity.kind === 'clue')) {
		warn('entities', 'Kein Hinweis im Fall — Spieler können nichts entdecken', 'case.noClue');
	}

	return issues;
}

export function caseErrors(document: CaseDocument): CaseIssue[] {
	return validateCase(document).filter((issue) => issue.severity === 'error');
}

export function assertValidCase(document: CaseDocument): void {
	const issues = caseErrors(document);
	if (issues.length > 0) {
		throw new CaseFormatError(
			`Der Fall enthält ${issues.length} Fehler: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`,
			issues
		);
	}
}

/** True for anything shaped like a case — used before touching properties. */
export function looksLikeCase(value: unknown): value is CaseDocument {
	if (typeof value !== 'object' || value === null) return false;
	const candidate = value as Partial<CaseDocument>;
	// Version-0 drafts carry no `schemaVersion` at all, so the check must not
	// require it — `migrateCase` owns the version question.
	return Array.isArray(candidate.entities) && typeof candidate.title === 'string';
}

/**
 * Migration boundary. Every stored or imported document goes through here, so a
 * future schema change has exactly one place to live.
 */
const MIGRATIONS: Record<number, (raw: Record<string, unknown>) => Record<string, unknown>> = {
	// Version 0: pre-Phase-2 drafts had no id, no timestamps, no language and no
	// map size — they were only ever produced by early hand-written JSON.
	0: (raw) => {
		const now = new Date().toISOString();
		return {
			...raw,
			schemaVersion: 1,
			id: typeof raw.id === 'string' && raw.id ? raw.id : createCaseId(),
			language: raw.language === 'en' ? 'en' : 'de',
			summary: typeof raw.summary === 'string' ? raw.summary : '',
			map: {
				width: 2400,
				height: 1600,
				...(typeof raw.map === 'object' && raw.map !== null ? raw.map : {})
			},
			entities: Array.isArray(raw.entities)
				? raw.entities.map((entity) => {
						const item = (entity ?? {}) as Record<string, unknown>;
						const kind = ENTITY_KINDS.includes(item.kind as EntityKind)
							? (item.kind as EntityKind)
							: 'object';
						return {
							id:
								typeof item.id === 'string' && item.id
									? item.id
									: slugify(String(item.name ?? 'eintrag')),
							kind,
							name: typeof item.name === 'string' && item.name ? item.name : 'Unbenannt',
							description: typeof item.description === 'string' ? item.description : '',
							position: {
								x: Number((item.position as CasePoint | undefined)?.x ?? 100),
								y: Number((item.position as CasePoint | undefined)?.y ?? 100)
							},
							color:
								typeof item.color === 'string' && item.color
									? item.color
									: ENTITY_KIND_COLORS[kind],
							relatedEntityIds: Array.isArray(item.relatedEntityIds)
								? item.relatedEntityIds.filter((id): id is string => typeof id === 'string')
								: []
						};
					})
				: [],
			createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : now,
			updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : now
		};
	}
};

/**
 * Bring an unknown document to the current schema version.
 *
 * Throws instead of guessing when the version is missing or newer than this
 * build: silently "fixing" a document from a newer app version is how data gets
 * destroyed.
 */
export function migrateCase(raw: unknown): CaseDocument {
	if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
		throw new CaseFormatError('Der Inhalt ist kein Fall-Objekt');
	}

	const source = raw as Record<string, unknown>;
	const version = typeof source.schemaVersion === 'number' ? source.schemaVersion : 0;

	if (version > CASE_SCHEMA_VERSION) {
		throw new CaseFormatError(
			`Dieser Fall wurde mit einer neueren Version erstellt (Schema ${version}). Bitte die App aktualisieren.`
		);
	}

	let migrated = source;
	for (let from = version; from < CASE_SCHEMA_VERSION; from += 1) {
		const step = MIGRATIONS[from];
		if (!step) {
			throw new CaseFormatError(`Für Schema ${from} gibt es keine Migration`);
		}
		migrated = step(migrated);
	}

	return migrated as unknown as CaseDocument;
}
