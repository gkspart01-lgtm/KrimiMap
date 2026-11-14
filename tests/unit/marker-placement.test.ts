import { describe, expect, it } from 'vitest';
import { findMarkerPosition } from '#lib/game/marker-placement';

const map = { width: 2400, height: 1600 };
const mobileViewport = { width: 393, height: 677 };

function hasNoScreenOverlaps(
	positions: { x: number; y: number }[],
	zoom: number,
	gap: number
): boolean {
	for (let left = 0; left < positions.length; left += 1) {
		for (let right = left + 1; right < positions.length; right += 1) {
			const dx = Math.abs(positions[left].x - positions[right].x) * zoom;
			const dy = Math.abs(positions[left].y - positions[right].y) * zoom;
			if (dx < gap && dy < gap) return false;
		}
	}
	return true;
}

describe('findMarkerPosition', () => {
	it('places at least ten compact phone markers without stacking', () => {
		const zoom = 0.164;
		const entities: { position: { x: number; y: number } }[] = [];
		for (let index = 0; index < 10; index += 1) {
			const position = findMarkerPosition({
				camera: { x: 1200, y: 800, zoom },
				map,
				viewport: mobileViewport,
				compact: true,
				existing: entities
			});
			expect(position.x).toBeGreaterThanOrEqual(50);
			expect(position.x).toBeLessThanOrEqual(map.width - 50);
			expect(position.y).toBeGreaterThanOrEqual(50);
			expect(position.y).toBeLessThanOrEqual(map.height - 50);
			entities.push({ position });
		}
		expect(
			hasNoScreenOverlaps(
				entities.map((entity) => entity.position),
				zoom,
				48
			)
		).toBe(true);
	});

	it('keeps the widest desktop label inside the map at high zoom', () => {
		const zoom = 4;
		const position = findMarkerPosition({
			camera: { x: 2370, y: 800, zoom },
			map,
			viewport: mobileViewport,
			compact: false,
			existing: []
		});

		expect(position.x).toBeLessThanOrEqual(map.width - 330 / zoom);
		expect(position.y).toBeGreaterThanOrEqual(22 / zoom);
		expect(position.y).toBeLessThanOrEqual(map.height - 22 / zoom);
	});

	it('keeps the widest desktop label inside the map at minimum zoom', () => {
		const zoom = 0.15;
		const position = findMarkerPosition({
			camera: { x: 1200, y: 800, zoom },
			map,
			viewport: { width: 1280, height: 800 },
			compact: false,
			existing: []
		});

		expect(position.x).toBeGreaterThanOrEqual(22 / zoom);
		expect(position.x).toBeLessThanOrEqual(map.width - 330 / zoom);
	});

	it('searches the full legal band at a medium desktop fit zoom', () => {
		const zoom = 0.4267;
		const entities: { position: { x: number; y: number } }[] = [];
		for (let index = 0; index < 15; index += 1) {
			const position = findMarkerPosition({
				camera: { x: 1200, y: 800, zoom },
				map,
				viewport: { width: 1024, height: 718 },
				compact: false,
				existing: entities
			});
			expect(
				entities.some(
					(entity) => entity.position.x === position.x && entity.position.y === position.y
				)
			).toBe(false);
			entities.push({ position });
		}
	});

	it('does not return an exact duplicate after the nearest visible slots fill', () => {
		const zoom = 0.4688;
		const entities: { position: { x: number; y: number } }[] = [];
		for (let index = 0; index < 31; index += 1) {
			const position = findMarkerPosition({
				camera: { x: 1200, y: 800, zoom },
				map,
				viewport: { width: 1280, height: 750 },
				compact: false,
				existing: entities
			});
			expect(
				entities.some(
					(entity) => entity.position.x === position.x && entity.position.y === position.y
				)
			).toBe(false);
			entities.push({ position });
		}
	});

	it('keeps distinct coordinates when all compact grid slots are occupied', () => {
		const zoom = 0.15;
		const entities: { position: { x: number; y: number } }[] = [];
		for (let index = 0; index < 400; index += 1) {
			const position = findMarkerPosition({
				camera: { x: 1200, y: 800, zoom },
				map,
				viewport: { width: 1280, height: 750 },
				compact: true,
				existing: entities
			});
			expect(
				entities.some(
					(entity) => entity.position.x === position.x && entity.position.y === position.y
				)
			).toBe(false);
			entities.push({ position });
		}
	});

	it('falls back to a free map position when the camera is outside the map', () => {
		const zoom = 0.15;
		const entities: { position: { x: number; y: number } }[] = [{ position: { x: 50, y: 50 } }];
		for (let index = 0; index < 8; index += 1) {
			const position = findMarkerPosition({
				camera: { x: -1000, y: -1000, zoom },
				map,
				viewport: mobileViewport,
				compact: true,
				existing: entities
			});
			expect(position).not.toEqual({ x: 50, y: 50 });
			expect(position.x).toBeGreaterThanOrEqual(50);
			expect(position.x).toBeLessThanOrEqual(map.width - 50);
			expect(position.y).toBeGreaterThanOrEqual(50);
			expect(position.y).toBeLessThanOrEqual(map.height - 50);
			entities.push({ position });
		}
		expect(
			hasNoScreenOverlaps(
				entities.map((entity) => entity.position),
				zoom,
				48
			)
		).toBe(true);
	});
});
