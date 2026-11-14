/**
 * Framework-free camera math for the map workspace.
 *
 * The editor canvas is a 2D map that can be panned and zoomed. All camera
 * behaviour that can be reasoned about without a renderer lives here so it can
 * be unit tested; the Phaser scene only applies the resulting state.
 *
 * Coordinate systems:
 * - world: map pixels, independent of zoom (0,0 = map top-left)
 * - screen: CSS pixels inside the canvas viewport (0,0 = viewport top-left)
 * - camera: `x`/`y` are the world coordinates shown at the viewport centre,
 *   `zoom` is world pixels per screen pixel.
 */

export interface Point {
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface ZoomLimits {
	minZoom: number;
	maxZoom: number;
}

export interface CameraState {
	x: number;
	y: number;
	zoom: number;
}

export const DEFAULT_ZOOM_LIMITS: ZoomLimits = { minZoom: 0.1, maxZoom: 4 };

export function clampZoom(zoom: number, limits: ZoomLimits = DEFAULT_ZOOM_LIMITS): number {
	if (!Number.isFinite(zoom)) return limits.minZoom;
	return Math.min(limits.maxZoom, Math.max(limits.minZoom, zoom));
}

export function screenToWorld(camera: CameraState, screen: Point, viewport: Size): Point {
	return {
		x: (screen.x - viewport.width / 2) / camera.zoom + camera.x,
		y: (screen.y - viewport.height / 2) / camera.zoom + camera.y
	};
}

export function worldToScreen(camera: CameraState, world: Point, viewport: Size): Point {
	return {
		x: (world.x - camera.x) * camera.zoom + viewport.width / 2,
		y: (world.y - camera.y) * camera.zoom + viewport.height / 2
	};
}

/** Pan by a screen-space delta (e.g. a pointer drag). */
export function panBy(camera: CameraState, deltaScreen: Point): CameraState {
	return {
		x: camera.x - deltaScreen.x / camera.zoom,
		y: camera.y - deltaScreen.y / camera.zoom,
		zoom: camera.zoom
	};
}

/**
 * Zoom by `factor` while keeping the world point under `anchor` fixed, so that
 * pinch-zooming and wheel-zooming feel attached to the pointer or fingers.
 */
export function zoomAround(
	camera: CameraState,
	anchor: Point,
	factor: number,
	viewport: Size,
	limits: ZoomLimits = DEFAULT_ZOOM_LIMITS
): CameraState {
	const zoom = clampZoom(camera.zoom * factor, limits);
	if (zoom === camera.zoom) return camera;

	const worldAnchor = screenToWorld(camera, anchor, viewport);
	// Solve for the camera centre that keeps `worldAnchor` under `anchor`.
	return {
		x: worldAnchor.x - (anchor.x - viewport.width / 2) / zoom,
		y: worldAnchor.y - (anchor.y - viewport.height / 2) / zoom,
		zoom
	};
}

/**
 * Clamp the camera to the map with a little pan slack.
 *
 * For an axis where the map is smaller than the visible world, the old code
 * returned `map / 2` unconditionally. That hard-locks the camera at fit zoom:
 * touch drags appear to move slowly (actually they are discarded). Instead let
 * the whole small map travel through its empty viewport margin, plus `slack`.
 * For a larger map keep the viewport covered, with the same extra slack at the
 * edge. `allowance` is a screen-space fraction of the viewport (0..0.9).
 */
export function clampToMap(
	camera: CameraState,
	map: Size,
	viewport: Size,
	limits: ZoomLimits = DEFAULT_ZOOM_LIMITS,
	allowance = 0
): CameraState {
	const zoom = clampZoom(camera.zoom, limits);
	const halfWidth = viewport.width / 2 / zoom;
	const halfHeight = viewport.height / 2 / zoom;

	const slack = Math.min(Math.max(allowance, 0), 0.9);
	const slackX = (viewport.width * slack) / zoom;
	const slackY = (viewport.height * slack) / zoom;

	const clampAxis = (centre: number, mapSize: number, halfViewport: number, slackWorld: number) => {
		const small = mapSize <= halfViewport * 2;
		const min = small ? mapSize - halfViewport - slackWorld : halfViewport - slackWorld;
		const max = small ? halfViewport + slackWorld : mapSize - halfViewport + slackWorld;
		return Math.min(max, Math.max(min, centre));
	};
	const x = clampAxis(camera.x, map.width, halfWidth, slackX);
	const y = clampAxis(camera.y, map.height, halfHeight, slackY);

	return { x, y, zoom };
}

/** A camera framing the whole map with a small margin. */
export function fitMap(
	map: Size,
	viewport: Size,
	limits: ZoomLimits = DEFAULT_ZOOM_LIMITS,
	margin = 0.94
): CameraState {
	const scale = Math.min(viewport.width / map.width, viewport.height / map.height) * margin;
	return {
		x: map.width / 2,
		y: map.height / 2,
		zoom: clampZoom(scale, limits)
	};
}
