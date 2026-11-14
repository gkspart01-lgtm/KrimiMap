/**
 * Every change to a case goes through one of these functions.
 *
 * They are pure: a document goes in, a new document comes out, nothing is
 * mutated. That makes undo/redo a matter of keeping old documents, keeps Svelte
 * reactivity honest (new object = new render), and lets the editor and the
 * storage layer share exactly one definition of "add an entity".
 */
import {
	ENTITY_KIND_COLORS,
	ENTITY_KINDS,
	type CaseDocument,
	type CaseEntity,
	type CasePoint,
	type EntityKind,
	slugify,
	uniqueId
} from './case-document';
import { SHARED_MAP_DOCUMENT } from './map-document';

function touch(document: CaseDocument, now: Date): CaseDocument {
	return { ...document, updatedAt: now.toISOString() };
}

function clampToMap(value: number, max: number): number {
	return Math.min(max, Math.max(0, Math.round(value)));
}

export function renameCase(
	document: CaseDocument,
	title: string,
	now: Date = new Date()
): CaseDocument {
	return touch({ ...document, title: title.trim() || 'Unbenannter Fall' }, now);
}

export function updateCaseMeta(
	document: CaseDocument,
	patch: { summary?: string; language?: CaseDocument['language'] },
	now: Date = new Date()
): CaseDocument {
	return touch(
		{
			...document,
			summary: patch.summary ?? document.summary,
			language: patch.language ?? document.language
		},
		now
	);
}

export interface NewEntityInput {
	kind: EntityKind;
	name?: string;
	position: CasePoint;
	description?: string;
	color?: string;
	relatedEntityIds?: string[];
	/** Optional explicit id (imports and tests); otherwise derived from the name. */
	id?: string;
}

function entityKindOrThrow(kind: string): EntityKind {
	if (!ENTITY_KINDS.includes(kind as EntityKind)) {
		throw new Error(`Unbekannte Art "${kind}"`);
	}
	return kind as EntityKind;
}

export function addEntity(
	document: CaseDocument,
	input: NewEntityInput,
	now: Date = new Date()
): CaseDocument {
	const kind = entityKindOrThrow(input.kind);
	const taken = document.entities.map((entity) => entity.id);
	const name = (input.name ?? '').trim();
	// Unnamed entities get a readable default ("clue 1") and an id from it, so a
	// fresh marker is not called "clue" and then "clue-2".
	const displayName = name || `${kind} ${document.entities.length + 1}`;
	const entity: CaseEntity = {
		id: input.id ?? uniqueId(displayName, taken),
		kind,
		name: displayName,
		description: input.description ?? '',
		position: {
			x: clampToMap(input.position.x, SHARED_MAP_DOCUMENT.width),
			y: clampToMap(input.position.y, SHARED_MAP_DOCUMENT.height)
		},
		color: input.color ?? ENTITY_KIND_COLORS[kind],
		relatedEntityIds: (input.relatedEntityIds ?? []).filter((id) => id !== undefined)
	};

	return touch({ ...document, entities: [...document.entities, entity] }, now);
}

export function updateEntity(
	document: CaseDocument,
	id: string,
	patch: Partial<Omit<CaseEntity, 'id'>>,
	now: Date = new Date()
): CaseDocument {
	let changed = false;
	const entities = document.entities.map((entity) => {
		if (entity.id !== id) return entity;
		changed = true;
		return {
			...entity,
			...patch,
			kind: patch.kind ? entityKindOrThrow(patch.kind) : entity.kind,
			position: patch.position
				? {
						x: clampToMap(patch.position.x, SHARED_MAP_DOCUMENT.width),
						y: clampToMap(patch.position.y, SHARED_MAP_DOCUMENT.height)
					}
				: entity.position,
			relatedEntityIds: patch.relatedEntityIds
				? patch.relatedEntityIds.filter((related) => related !== id)
				: entity.relatedEntityIds
		};
	});
	if (!changed) return document;
	return touch({ ...document, entities }, now);
}

export function moveEntity(
	document: CaseDocument,
	id: string,
	position: CasePoint,
	now: Date = new Date()
): CaseDocument {
	return updateEntity(document, id, { position }, now);
}

/** Deleting an entity also removes references to it — no dangling ids. */
export function removeEntity(
	document: CaseDocument,
	id: string,
	now: Date = new Date()
): CaseDocument {
	if (!document.entities.some((entity) => entity.id === id)) return document;
	const entities = document.entities
		.filter((entity) => entity.id !== id)
		.map((entity) =>
			entity.relatedEntityIds.includes(id)
				? {
						...entity,
						relatedEntityIds: entity.relatedEntityIds.filter((related) => related !== id)
					}
				: entity
		);
	return touch({ ...document, entities }, now);
}

export function linkEntities(
	document: CaseDocument,
	fromId: string,
	toId: string,
	now: Date = new Date()
): CaseDocument {
	if (fromId === toId) return document;
	const source = document.entities.find((entity) => entity.id === fromId);
	if (!source || !document.entities.some((entity) => entity.id === toId)) return document;
	if (source.relatedEntityIds.includes(toId)) return document;
	return updateEntity(
		document,
		fromId,
		{ relatedEntityIds: [...source.relatedEntityIds, toId] },
		now
	);
}

export function unlinkEntities(
	document: CaseDocument,
	fromId: string,
	toId: string,
	now: Date = new Date()
): CaseDocument {
	const source = document.entities.find((entity) => entity.id === fromId);
	if (!source?.relatedEntityIds.includes(toId)) return document;
	return updateEntity(
		document,
		fromId,
		{ relatedEntityIds: source.relatedEntityIds.filter((id) => id !== toId) },
		now
	);
}

export function suggestEntityIdByName(document: CaseDocument, name: string): string {
	return uniqueId(
		slugify(name),
		document.entities.map((entity) => entity.id)
	);
}
