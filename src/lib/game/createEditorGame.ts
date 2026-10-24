import Phaser from 'phaser';
import {
	clampToMap,
	fitMap,
	panBy,
	zoomAround,
	type CameraState,
	type Point,
	type Size,
	type ZoomLimits
} from './camera';

/** Placeholder map size in world pixels; replaced by case data in Phase 2. */
export const MAP_SIZE: Size = { width: 2400, height: 1600 };

const ZOOM_LIMITS: ZoomLimits = { minZoom: 0.15, maxZoom: 4 };

/** Rendering above 3× device resolution only costs fill rate. */
const MAX_PIXEL_RATIO = 3;

/**
 * How far (as a fraction of the viewport) the camera may be dragged past the
 * map edge. Without slack a map that fits the screen cannot be moved at all and
 * dragging feels unresponsive.
 */
const PAN_ALLOWANCE = 0.15;

export interface EditorGameHandle {
	/** Frame the whole map. */
	fit(): void;
	zoomIn(): void;
	zoomOut(): void;
	camera(): CameraState;
	destroy(): void;
}

interface Options {
	/** Called whenever the camera changes so the UI can mirror it. */
	onCamera?: (camera: CameraState) => void;
}

interface TrackedPointer {
	x: number;
	y: number;
	previousX: number;
	previousY: number;
}

/**
 * Boots the map workspace: a Phaser canvas with pan (drag), zoom (wheel and
 * pinch) and a placeholder map so the interaction can be verified before the
 * real case rendering exists.
 *
 * The canvas backing store is sized in *device* pixels so text and lines stay
 * sharp on phones and high-DPI screens, while all camera maths — and every
 * pointer coordinate used for it — stays in CSS pixels.
 *
 * This module touches `window`/WebGL, so it may only be imported in the
 * browser (dynamic import from `onMount`).
 */
export function createEditorGame(parent: HTMLElement, options: Options = {}): EditorGameHandle {
	const pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
	/** Text is rasterised once, so oversample it to survive the zoom range. */
	const textResolution = Math.min(pixelRatio * 2, 4);

	let camera: CameraState | null = null;
	let game: Phaser.Game;
	let resizeObserver: ResizeObserver | null = null;

	/** CSS pixels — the coordinate system of the camera maths. */
	const viewport = (): Size => ({
		width: Math.max(1, parent.clientWidth),
		height: Math.max(1, parent.clientHeight)
	});

	/**
	 * Phaser reports pointer coordinates in canvas pixels (canvas size × device
	 * ratio), while all camera maths happens in CSS pixels. Normalising through
	 * the actual canvas size keeps drags exactly under the finger even if the
	 * canvas ends up displayed at a different size than requested.
	 */
	const toCss = (point: Point): Point => {
		const scale = game?.scale;
		const width = scale?.width ?? 0;
		const height = scale?.height ?? 0;
		const view = viewport();
		if (!width || !height) return point;
		return { x: (point.x / width) * view.width, y: (point.y / height) * view.height };
	};

	const emit = () => {
		if (camera) options.onCamera?.(camera);
	};

	const apply = () => {
		if (!camera) return;
		const scene = game.scene.getScene('map');
		const cam = scene?.cameras?.main;
		if (!cam) return;
		cam.setZoom(camera.zoom);
		cam.centerOn(camera.x, camera.y);
		emit();
	};

	const setCamera = (next: CameraState) => {
		camera = clampToMap(next, MAP_SIZE, viewport(), ZOOM_LIMITS, PAN_ALLOWANCE);
		apply();
	};

	/** Keep the canvas backing store at device resolution and its CSS size exact. */
	const syncCanvasSize = () => {
		const css = viewport();
		const width = Math.round(css.width * pixelRatio);
		const height = Math.round(css.height * pixelRatio);
		if (game.scale.width !== width || game.scale.height !== height) {
			game.scale.resize(width, height);
		}
		const canvas = game.canvas;
		if (canvas) {
			// Explicit pixel sizes instead of 100%: Phaser derives the pointer
			// transform from the canvas browser size, so it must be unambiguous.
			canvas.style.width = `${css.width}px`;
			canvas.style.height = `${css.height}px`;
			canvas.style.display = 'block';
			// Touch gestures must reach the game, not the page scroll.
			canvas.style.touchAction = 'none';
		}
	};

	class MapScene extends Phaser.Scene {
		private pointers = new Map<number, TrackedPointer>();
		private pinchDistance = 0;
		private pinchCentre: Point = { x: 0, y: 0 };

		constructor() {
			super('map');
		}

		create() {
			camera = fitMap(MAP_SIZE, viewport(), ZOOM_LIMITS);
			this.drawPlaceholderMap();
			this.bindInput();
			apply();
		}

		private drawPlaceholderMap() {
			const background = this.add.graphics();
			background.fillStyle(0x181f2a, 1);
			background.fillRect(0, 0, MAP_SIZE.width, MAP_SIZE.height);

			const grid = this.add.graphics();
			grid.lineStyle(1, 0x263142, 1);
			for (let x = 0; x <= MAP_SIZE.width; x += 200) {
				grid.beginPath();
				grid.moveTo(x, 0);
				grid.lineTo(x, MAP_SIZE.height);
				grid.strokePath();
			}
			for (let y = 0; y <= MAP_SIZE.height; y += 200) {
				grid.beginPath();
				grid.moveTo(0, y);
				grid.lineTo(MAP_SIZE.width, y);
				grid.strokePath();
			}

			const border = this.add.graphics();
			border.lineStyle(4, 0xf0b429, 0.9);
			border.strokeRect(0, 0, MAP_SIZE.width, MAP_SIZE.height);

			// Placeholder entities: positions come from case data in Phase 2.
			const entities = [
				{ x: 520, y: 420, label: 'Pförtner', color: 0x4ec9a0 },
				{ x: 1180, y: 700, label: 'Clue: Schlüssel', color: 0xe8a33d },
				{ x: 1860, y: 1180, label: 'Bibliothek', color: 0x7aa2f7 },
				{ x: 980, y: 1300, label: 'Objekt: Kiste', color: 0xe5657a }
			];

			for (const entity of entities) {
				const marker = this.add.rectangle(entity.x, entity.y, 90, 90, entity.color, 0.85);
				marker.setStrokeStyle(3, 0x0f1218, 1);
				this.add
					.text(entity.x + 60, entity.y - 10, entity.label, {
						fontFamily: 'system-ui, sans-serif',
						fontSize: '26px',
						color: '#e8ecf2'
					})
					.setOrigin(0, 0.5)
					.setResolution(textResolution);
			}

			this.add
				.text(40, 40, `KrimiMap — Kartenbereich ${MAP_SIZE.width}×${MAP_SIZE.height}`, {
					fontFamily: 'system-ui, sans-serif',
					fontSize: '34px',
					color: '#97a3b4'
				})
				.setOrigin(0, 0)
				.setResolution(textResolution);
		}

		private bindInput() {
			this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
				const point = toCss({ x: pointer.x, y: pointer.y });
				this.pointers.set(pointer.id, {
					x: point.x,
					y: point.y,
					previousX: point.x,
					previousY: point.y
				});
				this.resetPinch();
			});

			const release = (pointer: Phaser.Input.Pointer) => {
				this.pointers.delete(pointer.id);
				this.resetPinch();
			};
			this.input.on('pointerup', release);
			this.input.on('pointerout', release);

			this.input.on(
				'pointermove',
				(pointer: Phaser.Input.Pointer) => {
					if (!camera) return;
					const tracked = this.pointers.get(pointer.id);
					if (!tracked) return;

					const point = toCss({ x: pointer.x, y: pointer.y });
					tracked.previousX = tracked.x;
					tracked.previousY = tracked.y;
					tracked.x = point.x;
					tracked.y = point.y;

					const active = [...this.pointers.values()].slice(0, 2);

					// Two fingers: pinch around the midpoint and pan with it.
					if (active.length === 2) {
						const distance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
						const centre = {
							x: (active[0].x + active[1].x) / 2,
							y: (active[0].y + active[1].y) / 2
						};

						if (this.pinchDistance > 0 && distance > 0) {
							const factor = distance / this.pinchDistance;
							let next = zoomAround(camera, centre, factor, viewport(), ZOOM_LIMITS);
							const drift = {
								x: centre.x - this.pinchCentre.x,
								y: centre.y - this.pinchCentre.y
							};
							if (drift.x !== 0 || drift.y !== 0) next = panBy(next, drift);
							setCamera(next);
						}

						this.pinchDistance = distance;
						this.pinchCentre = centre;
						return;
					}

					// One finger or mouse: drag to pan.
					const delta = {
						x: tracked.x - tracked.previousX,
						y: tracked.y - tracked.previousY
					};
					if (delta.x !== 0 || delta.y !== 0) setCamera(panBy(camera, delta));
				},
				this
			);

			this.input.on(
				'wheel',
				(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
					if (!camera) return;
					const factor = dy > 0 ? 1 / 1.12 : 1.12;
					setCamera(
						zoomAround(
							camera,
							toCss({ x: pointer.x, y: pointer.y }),
							factor,
							viewport(),
							ZOOM_LIMITS
						)
					);
				}
			);

			this.scale.on('resize', () => {
				if (camera) setCamera(camera);
			});
		}

		/** Restart pinch measurement whenever the finger count changes. */
		private resetPinch() {
			const active = [...this.pointers.values()].slice(0, 2);
			if (active.length === 2) {
				this.pinchDistance = Math.hypot(active[0].x - active[1].x, active[0].y - active[1].y);
				this.pinchCentre = {
					x: (active[0].x + active[1].x) / 2,
					y: (active[0].y + active[1].y) / 2
				};
			} else {
				this.pinchDistance = 0;
			}
		}
	}

	const css = viewport();
	game = new Phaser.Game({
		type: Phaser.AUTO,
		parent,
		backgroundColor: '#0f1218',
		width: Math.round(css.width * pixelRatio),
		height: Math.round(css.height * pixelRatio),
		scale: {
			mode: Phaser.Scale.NONE,
			autoCenter: Phaser.Scale.NO_CENTER
		},
		input: {
			// Two touch pointers plus the mouse; without this a second finger is
			// ignored and pinch never starts.
			activePointers: 3
		},
		render: { antialias: true },
		scene: [MapScene]
	});

	syncCanvasSize();

	if (typeof ResizeObserver !== 'undefined') {
		resizeObserver = new ResizeObserver(() => {
			syncCanvasSize();
			if (camera) setCamera(camera);
			else apply();
		});
		resizeObserver.observe(parent);
	}

	return {
		fit() {
			camera = fitMap(MAP_SIZE, viewport(), ZOOM_LIMITS);
			apply();
		},
		zoomIn() {
			if (!camera) return;
			const v = viewport();
			setCamera(zoomAround(camera, { x: v.width / 2, y: v.height / 2 }, 1.25, v, ZOOM_LIMITS));
		},
		zoomOut() {
			if (!camera) return;
			const v = viewport();
			setCamera(zoomAround(camera, { x: v.width / 2, y: v.height / 2 }, 1 / 1.25, v, ZOOM_LIMITS));
		},
		camera() {
			return camera ?? { x: 0, y: 0, zoom: 1 };
		},
		destroy() {
			resizeObserver?.disconnect();
			resizeObserver = null;
			game.destroy(true);
		}
	};
}
