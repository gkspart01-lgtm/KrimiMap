/**
 * Turn a validated AI draft into real case entities.
 *
 * Applying is an explicit creator action: nothing in this module is called while
 * generating. Characters and clues are appended with distinct positions on the
 * shared map, the clue links follow the draft, and the challenge points at the
 * drafted solution character.
 */

import type { CaseDraft } from '#lib/ai/contracts/case-draft';
import { addEntity, updateCaseChallenge } from '#lib/domain/case-commands';
import { ENTITY_KIND_COLORS, type CaseDocument } from '#lib/domain/case-document';
import { SHARED_MAP_DOCUMENT } from '#lib/domain/map-document';
import { findMarkerPosition } from '#lib/game/marker-placement';

export interface ApplyCaseDraftOptions {
	now?: Date;
}

/** Scale used only to spread new markers over the whole map, not the live view. */
const PLACEMENT_ZOOM = 0.8;

export function applyCaseDraft(
	document: CaseDocument,
	draft: CaseDraft,
	{ now = new Date() }: ApplyCaseDraftOptions = {}
): CaseDocument {
	if (!draft.characters.some((character) => character.id === draft.solution)) {
		throw new Error('Die Lösung muss eine der Figuren aus dem Entwurf sein.');
	}

	const map = SHARED_MAP_DOCUMENT;
	let next: CaseDocument = { ...document, title: draft.title, summary: draft.premise };
	const characterIds = new Map<string, string>();
	const nextPosition = () =>
		findMarkerPosition({
			camera: { x: map.width / 2, y: map.height / 2, zoom: PLACEMENT_ZOOM },
			map,
			viewport: { width: map.width * PLACEMENT_ZOOM, height: map.height * PLACEMENT_ZOOM },
			compact: false,
			existing: next.entities
		});

	for (const character of draft.characters) {
		const position = nextPosition();
		next = addEntity(
			next,
			{
				kind: 'character',
				name: character.name,
				description: [character.role, character.description].filter(Boolean).join(' — '),
				position,
				color: ENTITY_KIND_COLORS.character
			},
			now
		);
		const created = next.entities[next.entities.length - 1];
		characterIds.set(character.id, created.id);
	}

	for (const clue of draft.clues) {
		const position = nextPosition();
		const relatedEntityIds = clue.relatedCharacterIds
			.map((draftId) => characterIds.get(draftId))
			.filter((id): id is string => Boolean(id));
		next = addEntity(
			next,
			{
				kind: 'clue',
				name: clue.title,
				description: clue.description,
				position,
				color: ENTITY_KIND_COLORS.clue,
				relatedEntityIds
			},
			now
		);
	}

	const solutionEntityId = characterIds.get(draft.solution) ?? null;
	return updateCaseChallenge(
		next,
		{
			objective: draft.objective,
			solutionEntityId,
			hint: next.challenge.hint
		},
		now
	);
}
