import { describe, expect, it, vi } from 'vitest';
import { MapController } from '../../src/lib/game/map-controller';
import { screenToWorld, worldToScreen, type CameraState } from '../../src/lib/game/camera';

const MAP = { width: 2400, height: 1600 };
const VIEWPORT = { width: 800, height: 600 };

/** A controller zoomed in far enough that the whole map is larger than the viewport. */
function zoomedIn(): MapController {
	const controller = new MapController({ map: MAP, viewport: VIEWPORT });
	controller.zoomBy(2);
	return controller;
}

describe('MapController: fit', () => {
	it('frames the whole map on construction', () => {
		const controller = new MapController({ map: MAP, viewport: VIEWPORT });
		expect(controller.camera.x).toBe(MAP.width / 2);
		expect(controller.camera.y).toBe(MAP.height / 2);
		// 800/2400 is the limiting axis, with the 0.94 margin.
		expect(controller.camera.zoom).toBeCloseTo((800 / 2400) * 0.94, 6);
	});

	it('cannot pan while the map is smaller than the viewport', () => {
		const controller = new MapController({ map: MAP, viewport: VIEWPORT });
		const before = controller.camera;
		controller.pointerDown({ id: 1, x: 100, y: 100 });
		controller.pointerMove({ id: 1, x: 300, y: 300 });
		controller.pointerUp(1);
		expect(controller.camera).toEqual(before);
	});
});

describe('MapController: fit and viewport', () => {
	it('exposes the viewport it was constructed with', () => {
		const controller = new MapController({ map: MAP, viewport: VIEWPORT });
		expect(controller.viewport).toEqual(VIEWPORT);
	});

	it('fit() restores the framing after zooming', () => {
		const controller = new MapController({ map: MAP, viewport: VIEWPORT });
		const fitted = controller.camera;
		controller.zoomBy(3);
		expect(controller.camera.zoom).not.toBeCloseTo(fitted.zoom, 2);
		controller.fit();
		expect(controller.camera).toEqual(fitted);
	});

	it('zoomBy anchors on an explicit point when given one', () => {
		const controller = zoomedIn();
		const anchor = { x: 120, y: 480 };
		const worldBefore = screenToWorld(controller.camera, anchor, VIEWPORT);
		controller.zoomBy(1.5, anchor);
		const worldAfter = screenToWorld(controller.camera, anchor, VIEWPORT);
		expect(worldAfter.x).toBeCloseTo(worldBefore.x, 4);
		expect(worldAfter.y).toBeCloseTo(worldBefore.y, 4);
	});
});

describe('MapController: one-finger drag', () => {
	it('moves the map exactly with the pointer', () => {
		const controller = zoomedIn();
		const world = { x: 1200, y: 800 };
		const before = worldToScreen(controller.camera, world, VIEWPORT);

		controller.pointerDown({ id: 1, x: before.x, y: before.y });
		controller.pointerMove({ id: 1, x: before.x + 150, y: before.y + 90 });
		controller.pointerUp(1);

		const after = worldToScreen(controller.camera, world, VIEWPORT);
		expect(after.x).toBeCloseTo(before.x + 150, 6);
		expect(after.y).toBeCloseTo(before.y + 90, 6);
	});

	it('accumulates several moves to the same total displacement', () => {
		const controller = zoomedIn();
		const startCamera = controller.camera;
		const world = { x: 1200, y: 800 };

		controller.pointerDown({ id: 7, x: 400, y: 300 });
		for (let step = 1; step <= 10; step++) {
			controller.pointerMove({ id: 7, x: 400 + step * 20, y: 300 });
		}
		controller.pointerUp(7);

		const moved = worldToScreen(controller.camera, world, VIEWPORT).x;
		const original = worldToScreen(startCamera, world, VIEWPORT).x;
		expect(moved - original).toBeCloseTo(200, 6);
	});

	it('ignores moves from a pointer it never saw go down', () => {
		const controller = zoomedIn();
		const before = controller.camera;
		controller.pointerMove({ id: 99, x: 10, y: 10 });
		expect(controller.camera).toEqual(before);
	});
});

describe('MapController: pinch', () => {
	it('doubles the zoom when the fingers move twice as far apart', () => {
		const controller = zoomedIn();
		const startZoom = controller.camera.zoom;

		controller.pointerDown({ id: 1, x: 300, y: 300 });
		controller.pointerDown({ id: 2, x: 500, y: 300 });
		controller.pointerMove({ id: 1, x: 200, y: 300 });
		controller.pointerMove({ id: 2, x: 600, y: 300 });

		expect(controller.camera.zoom / startZoom).toBeCloseTo(2, 3);
	});

	it('keeps the world point under the finger midpoint in place', () => {
		const controller = zoomedIn();
		const midpoint = { x: 400, y: 300 };
		const worldUnderMidpoint = screenToWorld(controller.camera, midpoint, VIEWPORT);

		controller.pointerDown({ id: 1, x: 350, y: 300 });
		controller.pointerDown({ id: 2, x: 450, y: 300 });
		controller.pointerMove({ id: 1, x: 300, y: 300 });
		controller.pointerMove({ id: 2, x: 500, y: 300 });

		const moved = screenToWorld(controller.camera, midpoint, VIEWPORT);
		expect(moved.x).toBeCloseTo(worldUnderMidpoint.x, 4);
		expect(moved.y).toBeCloseTo(worldUnderMidpoint.y, 4);
	});

	it('pans when both fingers move together', () => {
		const controller = zoomedIn();
		const startZoom = controller.camera.zoom;
		const world = { x: 1200, y: 800 };
		const before = worldToScreen(controller.camera, world, VIEWPORT);

		controller.pointerDown({ id: 1, x: 350, y: 300 });
		controller.pointerDown({ id: 2, x: 450, y: 300 });
		controller.pointerMove({ id: 1, x: 400, y: 300 });
		controller.pointerMove({ id: 2, x: 500, y: 300 });

		expect(controller.camera.zoom).toBeCloseTo(startZoom, 6);
		expect(worldToScreen(controller.camera, world, VIEWPORT).x - before.x).toBeCloseTo(50, 4);
	});

	it('does not jump when one finger of a pinch is lifted', () => {
		const controller = zoomedIn();
		controller.pointerDown({ id: 1, x: 300, y: 300 });
		controller.pointerDown({ id: 2, x: 500, y: 300 });
		controller.pointerMove({ id: 1, x: 280, y: 300 });

		const afterPinch = controller.camera;
		expect(controller.activePointers).toBe(2);

		controller.pointerUp(2);
		expect(controller.camera).toEqual(afterPinch);
		expect(controller.activePointers).toBe(1);

		controller.pointerMove({ id: 1, x: 300, y: 300 });
		// 20 CSS px at the current zoom, exactly like a one-finger drag.
		const expected = afterPinch.x - 20 / afterPinch.zoom;
		expect(controller.camera.x).toBeCloseTo(expected, 6);
	});

	it('treats three fingers as a two-finger pinch', () => {
		const controller = zoomedIn();
		controller.pointerDown({ id: 1, x: 300, y: 300 });
		controller.pointerDown({ id: 2, x: 500, y: 300 });
		controller.pointerDown({ id: 3, x: 400, y: 500 });
		expect(() => controller.pointerMove({ id: 3, x: 400, y: 550 })).not.toThrow();
	});
});

describe('MapController: wheel', () => {
	it('zooms in and keeps the pointer anchor fixed', () => {
		const controller = zoomedIn();
		const anchor = { x: 600, y: 200 };
		const anchorWorld = screenToWorld(controller.camera, anchor, VIEWPORT);
		const startZoom = controller.camera.zoom;

		controller.wheel(anchor, -100);
		expect(controller.camera.zoom).toBeGreaterThan(startZoom);

		controller.setViewport({ ...VIEWPORT });
		const afterWorld = screenToWorld(controller.camera, anchor, VIEWPORT);
		expect(afterWorld.x).toBeCloseTo(anchorWorld.x, 5);
		expect(afterWorld.y).toBeCloseTo(anchorWorld.y, 5);
	});

	it('respects the zoom limits', () => {
		const controller = new MapController({ map: MAP, viewport: VIEWPORT });
		for (let i = 0; i < 50; i++) controller.wheel({ x: 400, y: 300 }, -100);
		expect(controller.camera.zoom).toBeCloseTo(4, 6);

		for (let i = 0; i < 100; i++) controller.wheel({ x: 400, y: 300 }, 100);
		expect(controller.camera.zoom).toBeCloseTo(0.15, 6);
	});
});

describe('MapController: clamping', () => {
	it('stops at the map edge without allowance', () => {
		const controller = zoomedIn();
		controller.pointerDown({ id: 1, x: 400, y: 300 });
		for (let i = 0; i < 60; i++) controller.pointerMove({ id: 1, x: 400 + i * 50, y: 300 });
		controller.pointerUp(1);

		const halfWidth = VIEWPORT.width / 2 / controller.camera.zoom;
		expect(controller.camera.x).toBeCloseTo(halfWidth, 4);
	});

	it('allows the configured overshoot past the edge', () => {
		const controller = new MapController({ map: MAP, viewport: VIEWPORT, allowance: 0.15 });
		controller.zoomBy(2);
		controller.pointerDown({ id: 1, x: 400, y: 300 });
		for (let i = 0; i < 60; i++) controller.pointerMove({ id: 1, x: 400 + i * 50, y: 300 });

		const halfWidth = VIEWPORT.width / 2 / controller.camera.zoom;
		const slack = (VIEWPORT.width * 0.15) / controller.camera.zoom;
		expect(controller.camera.x).toBeCloseTo(halfWidth - slack, 4);
	});

	it('re-clamps when the viewport changes', () => {
		const controller = zoomedIn();
		controller.pointerDown({ id: 1, x: 400, y: 300 });
		controller.pointerMove({ id: 1, x: 900, y: 300 });
		controller.pointerUp(1);
		controller.setViewport({ width: 1000, height: 800 });
		// The map is still larger than the new viewport, so it clamps to the edge.
		const halfWidth = 1000 / 2 / controller.camera.zoom;
		expect(controller.camera.x).toBeCloseTo(halfWidth, 4);
	});
});

describe('MapController: change notifications', () => {
	it('notifies on real changes and stays quiet otherwise', () => {
		const onChange = vi.fn<(camera: CameraState) => void>();
		const controller = new MapController({ map: MAP, viewport: VIEWPORT, onChange });

		controller.pointerDown({ id: 1, x: 100, y: 100 });
		controller.pointerUp(1);
		expect(onChange).not.toHaveBeenCalled();

		controller.zoomBy(2);
		expect(onChange).toHaveBeenCalledTimes(1);
	});

	it('drops every pointer on releaseAll', () => {
		const controller = zoomedIn();
		controller.pointerDown({ id: 1, x: 100, y: 100 });
		controller.pointerDown({ id: 2, x: 200, y: 200 });
		controller.releaseAll();
		expect(controller.activePointers).toBe(0);

		const before = controller.camera;
		controller.pointerMove({ id: 1, x: 400, y: 400 });
		expect(controller.camera).toEqual(before);
	});
});

describe('setMap', () => {
	it('keeps the camera inside the new map and notifies once', () => {
		const changes: CameraState[] = [];
		const controller = new MapController({
			map: { width: 2400, height: 1600 },
			viewport: { width: 800, height: 600 },
			onChange: (camera) => changes.push(camera)
		});
		controller.zoomBy(2);
		const before = controller.camera;

		controller.setMap({ width: 1200, height: 800 });
		const after = controller.camera;

		expect(changes.length).toBeGreaterThan(0);
		expect(after.x).toBeLessThanOrEqual(1200);
		expect(after.y).toBeLessThanOrEqual(800);
		expect(after.zoom).toBeCloseTo(before.zoom, 5);
	});

	it('does nothing when the size is unchanged', () => {
		const changes: CameraState[] = [];
		const controller = new MapController({
			map: { width: 2400, height: 1600 },
			viewport: { width: 800, height: 600 },
			onChange: (camera) => changes.push(camera)
		});
		controller.setMap({ width: 2400, height: 1600 });
		expect(changes).toEqual([]);
	});
});
