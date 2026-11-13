import {
	clampToMap,
	clampZoom,
	fitMap,
	panBy,
	zoomAround,
	type CameraState,
	type Point,
	type Size,
	type ZoomLimits
} from './camera';

/** A pointer sample already converted to CSS pixels. */
export interface PointerSample {
	id: number;
	x: number;
	y: number;
}

export interface MapControllerOptions {
	map: Size;
	limits?: ZoomLimits;
	/** How far (fraction of the viewport) the camera may move past the map edge. */
	allowance?: number;
	viewport: Size;
	onChange?: (camera: CameraState) => void;
}

const DEFAULT_LIMITS: ZoomLimits = { minZoom: 0.15, maxZoom: 4 };

/**
 * Owns the camera and the gesture state of the map workspace.
 *
 * The Phaser scene only forwards pointer samples and applies the resulting
 * camera; every rule about dragging, pinching, zooming and clamping lives here,
 * which makes the behaviour unit-testable without a browser. All coordinates
 * and distances are CSS pixels, so the maths does not change with device
 * pixel ratio.
 */
export class MapController {
	private map: Size;
	private readonly limits: ZoomLimits;
	private readonly allowance: number;
	private readonly onChange?: (camera: CameraState) => void;

	private viewportSize: Size;
	private cameraState: CameraState;
	private pointers = new Map<number, Point>();
	/**
	 * Pinch baseline: the finger span, midpoint and camera at the moment the
	 * gesture started (or the finger count changed). Computing every move from
	 * this baseline instead of the previous frame keeps the gesture stable when
	 * the browser reports one finger's movement before the other's — an
	 * incremental span ratio would zoom out and back in on every move pair.
	 */
	private pinch: { distance: number; centre: Point; camera: CameraState } | null = null;

	constructor(options: MapControllerOptions) {
		this.map = options.map;
		this.limits = options.limits ?? DEFAULT_LIMITS;
		this.allowance = options.allowance ?? 0;
		this.onChange = options.onChange;
		this.viewportSize = options.viewport;
		this.cameraState = fitMap(this.map, this.viewportSize, this.limits);
	}

	get camera(): CameraState {
		return this.cameraState;
	}

	get viewport(): Size {
		return this.viewportSize;
	}

	/** Number of pointers currently held down. */
	get activePointers(): number {
		return this.pointers.size;
	}

	/**
	 * Swap the map size (a case can change its dimensions). The camera is clamped
	 * into the new bounds instead of being re-fitted, so the user does not lose
	 * their position when a document is replaced.
	 */
	setMap(size: Size): void {
		if (size.width === this.map.width && size.height === this.map.height) return;
		this.map = { width: size.width, height: size.height };
		this.cameraState = clampToMap(
			this.cameraState,
			this.map,
			this.viewportSize,
			this.limits,
			this.allowance
		);
		this.onChange?.(this.cameraState);
	}

	/** Frame the whole map. */
	fit(): void {
		this.commit(fitMap(this.map, this.viewportSize, this.limits));
	}

	/** Zoom around the viewport centre, e.g. from a button. */
	zoomBy(factor: number, anchor?: Point): void {
		const target = anchor ?? {
			x: this.viewportSize.width / 2,
			y: this.viewportSize.height / 2
		};
		this.commit(zoomAround(this.cameraState, target, factor, this.viewportSize, this.limits));
	}

	/** Wheel/trackpad zoom anchored at the pointer position. */
	wheel(anchor: Point, deltaY: number): void {
		const factor = deltaY > 0 ? 1 / 1.12 : 1.12;
		this.commit(zoomAround(this.cameraState, anchor, factor, this.viewportSize, this.limits));
	}

	pointerDown(sample: PointerSample): void {
		this.pointers.set(sample.id, { x: sample.x, y: sample.y });
		this.measurePinch();
	}

	pointerMove(sample: PointerSample): void {
		const tracked = this.pointers.get(sample.id);
		if (!tracked) return;

		const previous = { x: tracked.x, y: tracked.y };
		tracked.x = sample.x;
		tracked.y = sample.y;

		const active = this.activeSamples();

		// Two fingers: pinch around the midpoint and pan with the midpoint, so a
		// two-finger gesture can both scale and move the map.
		if (active.length === 2) {
			const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
			const centre = {
				x: (active[0].x + active[1].x) / 2,
				y: (active[0].y + active[1].y) / 2
			};

			const base = this.pinch;
			if (base && base.distance > 0 && distance > 0) {
				const factor = distance / base.distance;
				let next = zoomAround(base.camera, base.centre, factor, this.viewportSize, this.limits);
				const drift = { x: centre.x - base.centre.x, y: centre.y - base.centre.y };
				if (drift.x !== 0 || drift.y !== 0) next = panBy(next, drift);
				this.commit(next);
			}
			return;
		}

		// One finger or mouse: the map follows the pointer exactly.
		const delta = { x: tracked.x - previous.x, y: tracked.y - previous.y };
		if (delta.x !== 0 || delta.y !== 0) {
			this.commit(panBy(this.cameraState, delta));
		}
	}

	/**
	 * A pointer left the surface. The remaining pointer keeps its position, so
	 * resuming a one-finger drag does not jump by the distance between the two
	 * fingers.
	 */
	pointerUp(id: number): void {
		if (!this.pointers.delete(id)) return;
		this.measurePinch();
	}

	/** Drop every pointer, e.g. when the tab loses focus mid-gesture. */
	releaseAll(): void {
		this.pointers.clear();
		this.pinch = null;
	}

	/** Viewport changed (rotation, window resize, browser zoom). */
	setViewport(viewport: Size): void {
		this.viewportSize = viewport;
		// Re-clamp so the map cannot end up half outside the new viewport.
		this.commit(this.cameraState);
	}

	private activeSamples(): Point[] {
		return [...this.pointers.values()].slice(0, 2);
	}

	/** Reset the pinch baseline whenever the finger count changes. */
	private measurePinch(): void {
		const active = this.activeSamples();
		this.pinch =
			active.length === 2
				? {
						distance: Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y),
						centre: {
							x: (active[0].x + active[1].x) / 2,
							y: (active[0].y + active[1].y) / 2
						},
						camera: this.cameraState
					}
				: null;
	}

	private commit(next: CameraState): void {
		const clamped = clampToMap(
			{ ...next, zoom: clampZoom(next.zoom, this.limits) },
			this.map,
			this.viewportSize,
			this.limits,
			this.allowance
		);
		const changed =
			clamped.x !== this.cameraState.x ||
			clamped.y !== this.cameraState.y ||
			clamped.zoom !== this.cameraState.zoom;
		this.cameraState = clamped;
		if (changed) this.onChange?.(clamped);
	}
}
