export interface MarkerPosition {
	x: number;
	y: number;
}

export interface MarkerPlacementInput {
	camera: MarkerPosition & { zoom: number };
	map: { width: number; height: number };
	viewport: { width: number; height: number };
	compact: boolean;
	existing: readonly { position: MarkerPosition }[];
}

interface Candidate extends MarkerPosition {
	visible: boolean;
	distance: number;
}

interface ScoredCandidate extends Candidate {
	overlaps: number;
	clearance: number;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
/** Screens this narrow or short drop marker labels; the detail lives in the panel. */
export const COMPACT_MARKER_QUERY = '(max-width: 46rem), (max-height: 32rem)';
/** Below this scale every viewport hides labels, so markers may sit close together. */
export const LABEL_HIDDEN_BELOW_ZOOM = 0.25;
const MAX_GRID_DIMENSION = 64;
const MAX_SPIRAL_CANDIDATES = 4096;

/** Place a marker in the nearest free cell across the full legal map band. */
export function findMarkerPosition(input: MarkerPlacementInput): MarkerPosition {
	const { camera, map, viewport, compact, existing } = input;
	const zoom = Number.isFinite(camera.zoom) && camera.zoom > 0 ? camera.zoom : 1;
	const screenStepX = compact ? 48 : 344;
	const screenStepY = 48;
	const edgeLeft = 22 / zoom;
	const edgeRight = (compact ? 22 : 330) / zoom;
	const edgeVertical = 22 / zoom;
	const minX = edgeLeft;
	const maxX = map.width - edgeRight;
	const minY = edgeVertical;
	const maxY = map.height - edgeVertical;
	const worldStepX = screenStepX / zoom;
	const worldStepY = screenStepY / zoom;
	const viewLeft = 22;
	const viewRight = viewport.width - (compact ? 22 : 330);
	const viewTop = 22;
	const viewBottom = viewport.height - 22;
	const safeCamera = {
		x: Number.isFinite(camera.x) ? camera.x : map.width / 2,
		y: Number.isFinite(camera.y) ? camera.y : map.height / 2
	};

	const makeCandidate = (position: MarkerPosition): Candidate => {
		const screenX = viewport.width / 2 + (position.x - safeCamera.x) * zoom;
		const screenY = viewport.height / 2 + (position.y - safeCamera.y) * zoom;
		return {
			...position,
			visible:
				screenX >= viewLeft && screenX <= viewRight && screenY >= viewTop && screenY <= viewBottom,
			distance: (screenX - viewport.width / 2) ** 2 + (screenY - viewport.height / 2) ** 2
		};
	};

	const isInBounds = (position: MarkerPosition) =>
		position.x >= minX && position.x <= maxX && position.y >= minY && position.y <= maxY;
	const isDuplicate = (position: MarkerPosition) =>
		existing.some(
			(entity) =>
				Math.abs(entity.position.x - position.x) < 0.01 &&
				Math.abs(entity.position.y - position.y) < 0.01
		);

	const candidates: Candidate[] = [];
	// Four offset lattices cover the legal map band instead of sampling only
	// around the camera; the half-cell offsets also fill gaps when one lattice
	// happens to align poorly with existing markers.
	for (const phaseX of [0, 0.5]) {
		for (const phaseY of [0, 0.5]) {
			const startX = minX + phaseX * worldStepX;
			const startY = minY + phaseY * worldStepY;
			const rawColumns = Math.max(1, Math.floor((maxX - startX) / worldStepX) + 1);
			const rawRows = Math.max(1, Math.floor((maxY - startY) / worldStepY) + 1);
			const columns = Math.min(rawColumns, MAX_GRID_DIMENSION);
			const rows = Math.min(rawRows, MAX_GRID_DIMENSION);
			const stepX = columns > 1 ? Math.max(worldStepX, (maxX - startX) / (columns - 1)) : 0;
			const stepY = rows > 1 ? Math.max(worldStepY, (maxY - startY) / (rows - 1)) : 0;

			for (let row = 0; row < rows; row += 1) {
				for (let column = 0; column < columns; column += 1) {
					const position = {
						x: columns > 1 ? startX + column * stepX : startX,
						y: rows > 1 ? startY + row * stepY : startY
					};
					if (isInBounds(position)) candidates.push(makeCandidate(position));
				}
			}
		}
	}

	const score = (candidate: Candidate): ScoredCandidate => {
		let overlaps = 0;
		let clearance = Number.POSITIVE_INFINITY;
		for (const entity of existing) {
			const dx = Math.abs(entity.position.x - candidate.x) * zoom;
			const dy = Math.abs(entity.position.y - candidate.y) * zoom;
			if (dx < screenStepX && dy < screenStepY) overlaps += 1;
			clearance = Math.min(clearance, Math.max(dx - screenStepX, dy - screenStepY));
		}
		return { ...candidate, overlaps, clearance };
	};

	const isBetterFallback = (candidate: ScoredCandidate, current: ScoredCandidate | null) =>
		!current ||
		candidate.overlaps < current.overlaps ||
		(candidate.overlaps === current.overlaps && candidate.clearance > current.clearance) ||
		(candidate.overlaps === current.overlaps &&
			candidate.clearance === current.clearance &&
			candidate.distance < current.distance);

	candidates.sort((a, b) => Number(b.visible) - Number(a.visible) || a.distance - b.distance);
	let fallback: ScoredCandidate | null = null;
	for (const candidate of candidates) {
		if (isDuplicate(candidate)) continue;
		const scored = score(candidate);
		if (scored.overlaps === 0) return { x: scored.x, y: scored.y };
		if (isBetterFallback(scored, fallback)) fallback = scored;
	}

	// If the normal lattice is crowded, search a deterministic screen-space
	// spiral around the nearest legal point: it finds free cells between the
	// lattice points, and once the map is saturated it returns the distinct
	// point with the most clearance instead of a duplicate coordinate.
	const origin = {
		x: Math.min(maxX, Math.max(minX, safeCamera.x)),
		y: Math.min(maxY, Math.max(minY, safeCamera.y))
	};
	for (let index = 1; index <= MAX_SPIRAL_CANDIDATES; index += 1) {
		const radius = 20 + 8 * Math.sqrt(index);
		const angle = index * GOLDEN_ANGLE;
		const position = {
			x: origin.x + (Math.cos(angle) * radius) / zoom,
			y: origin.y + (Math.sin(angle) * radius) / zoom
		};
		if (!isInBounds(position) || isDuplicate(position)) continue;
		const scored = score(makeCandidate(position));
		if (scored.overlaps === 0) return { x: scored.x, y: scored.y };
		if (isBetterFallback(scored, fallback)) fallback = scored;
	}

	if (fallback) return { x: fallback.x, y: fallback.y };

	// Saturated map: sweep the legal band at a fine pitch so the new entity still
	// gets unique coordinates. Overlap is then unavoidable, but two markers never
	// sit on exactly the same point.
	for (let y = minY; y <= maxY; y += 8 / zoom) {
		for (let x = minX; x <= maxX; x += 8 / zoom) {
			if (!isDuplicate({ x, y })) return { x, y };
		}
	}
	return { x: origin.x, y: origin.y };
}
