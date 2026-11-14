import { describe, expect, it } from 'vitest';
import {
	clampToMap,
	clampZoom,
	DEFAULT_ZOOM_LIMITS,
	fitMap,
	panBy,
	screenToWorld,
	worldToScreen,
	zoomAround
} from '../../src/lib/game/camera';

const viewport = { width: 800, height: 600 };
const map = { width: 4000, height: 3000 };

describe('clampZoom', () => {
	it('keeps zoom inside the limits', () => {
		expect(clampZoom(0.01)).toBe(DEFAULT_ZOOM_LIMITS.minZoom);
		expect(clampZoom(99)).toBe(DEFAULT_ZOOM_LIMITS.maxZoom);
		expect(clampZoom(1.5)).toBe(1.5);
	});

	it('falls back to minZoom for non-finite input', () => {
		expect(clampZoom(Number.NaN)).toBe(DEFAULT_ZOOM_LIMITS.minZoom);
	});
});

describe('screen/world conversion', () => {
	const camera = { x: 2000, y: 1500, zoom: 2 };

	it('maps the viewport centre to the camera position', () => {
		expect(screenToWorld(camera, { x: 400, y: 300 }, viewport)).toEqual({ x: 2000, y: 1500 });
	});

	it('round-trips a world point', () => {
		const world = { x: 1234, y: 987 };
		const back = screenToWorld(camera, worldToScreen(camera, world, viewport), viewport);
		expect(back.x).toBeCloseTo(world.x, 10);
		expect(back.y).toBeCloseTo(world.y, 10);
	});
});

describe('panBy', () => {
	it('moves opposite to the drag direction in world units', () => {
		const camera = { x: 1000, y: 1000, zoom: 2 };
		expect(panBy(camera, { x: 100, y: -50 })).toEqual({ x: 950, y: 1025, zoom: 2 });
	});
});

describe('zoomAround', () => {
	const camera = { x: 2000, y: 1500, zoom: 1 };
	const anchor = { x: 650, y: 120 };

	it('keeps the world point under the anchor fixed', () => {
		const before = screenToWorld(camera, anchor, viewport);
		const zoomed = zoomAround(camera, anchor, 2, viewport);
		const after = screenToWorld(zoomed, anchor, viewport);

		expect(zoomed.zoom).toBe(2);
		expect(after.x).toBeCloseTo(before.x, 8);
		expect(after.y).toBeCloseTo(before.y, 8);
	});

	it('returns the same state when the limit is already reached', () => {
		const maxed = { x: 2000, y: 1500, zoom: DEFAULT_ZOOM_LIMITS.maxZoom };
		expect(zoomAround(maxed, anchor, 2, viewport)).toBe(maxed);
	});
});

describe('clampToMap', () => {
	it('pulls the camera back inside the map edges', () => {
		const clamped = clampToMap({ x: 0, y: 0, zoom: 1 }, map, viewport);
		expect(clamped.x).toBe(400);
		expect(clamped.y).toBe(300);
	});

	it('allows a small map to move inside the empty viewport margin', () => {
		const small = { width: 200, height: 3000 };
		const withinMargin = clampToMap({ x: 250, y: 1500, zoom: 1 }, small, viewport);
		const beyondMargin = clampToMap({ x: 999, y: 1500, zoom: 1 }, small, viewport);
		expect(withinMargin.x).toBe(250);
		// With no extra allowance, the map's right edge may reach the viewport edge.
		expect(beyondMargin.x).toBe(400);
	});

	it('allows a small map to follow a short drag within its margin and slack', () => {
		const small = { width: 240, height: 180 };
		const fitted = { x: 120, y: 90, zoom: 0.5 };
		const dragged = panBy(fitted, { x: 100, y: -100 });
		const clamped = clampToMap(
			dragged,
			small,
			{ width: 800, height: 600 },
			DEFAULT_ZOOM_LIMITS,
			0.35
		);

		// This is still inside the viewport's 35% pan allowance, so a 100 CSS px
		// finger drag must not be silently converted back to the centred camera.
		expect(clamped.x).toBeCloseTo(-80, 8);
		expect(clamped.y).toBeCloseTo(290, 8);
	});

	it('applies the zoom limits while clamping', () => {
		const clamped = clampToMap({ x: 2000, y: 1500, zoom: 100 }, map, viewport);
		expect(clamped.zoom).toBe(DEFAULT_ZOOM_LIMITS.maxZoom);
	});

	it('allows dragging past the map edge by the configured allowance', () => {
		// 800 px viewport, zoom 1 → 15 % allowance is 120 px of slack.
		const allowed = clampToMap({ x: 0, y: 0, zoom: 1 }, map, viewport, DEFAULT_ZOOM_LIMITS, 0.15);
		expect(allowed.x).toBe(280);
		expect(allowed.y).toBe(210);
	});

	it('caps the allowance so the map cannot be dragged off screen', () => {
		const clamped = clampToMap({ x: 0, y: 0, zoom: 1 }, map, viewport, DEFAULT_ZOOM_LIMITS, 5);
		// Clamped to 0.9 of the viewport → 720 px of slack, so 400 - 720 < 0.
		expect(clamped.x).toBeLessThan(1);
	});
});

describe('fitMap', () => {
	it('frames the whole map with a margin', () => {
		const camera = fitMap(map, viewport);
		expect(camera.x).toBe(2000);
		expect(camera.y).toBe(1500);
		// 800/4000 = 0.2 is the limiting axis.
		expect(camera.zoom).toBeCloseTo(0.2 * 0.94, 10);
	});
});
