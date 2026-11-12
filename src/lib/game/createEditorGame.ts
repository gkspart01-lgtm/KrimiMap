import Phaser from 'phaser';
import { MapController } from './map-controller';
import type { CameraState, Point, Size, ZoomLimits } from './camera';

/** Placeholder map size in world pixels; replaced by case data in Phase 2. */
export const MAP_SIZE: Size = { width: 2400, height: 1600 };

export const ZOOM_LIMITS: ZoomLimits = { minZoom: 0.15, maxZoom: 4 };

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

function currentPixelRatio(): number {
	return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

/**
 * Boots the map workspace: a Phaser canvas plus the gesture handling in
 * `MapController`.
 *
 * This function is deliberately thin — it converts pointer events into
 * CSS-pixel samples, applies the resulting camera to the Phaser camera and keeps
 * the canvas at device resolution. Every interaction rule lives in the
 * controller so it can be unit tested without a browser.
 *
 * The canvas backing store is sized in device pixels so text and lines stay
 * sharp on phones and high-DPI screens, while all camera maths stays in CSS
 * pixels.
 *
 * This module touches `window`/WebGL, so it may only be imported in the browser
 * (dynamic import from `onMount`).
 */
export function createEditorGame(parent: HTMLElement, options: Options = {}): EditorGameHandle {
	let pixelRatio = currentPixelRatio();
	/** Text is rasterised once, so oversample it to survive the zoom range. */
	let textResolution = Math.min(pixelRatio * 2, 4);

	let controller: MapController | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let dprQuery: MediaQueryList | null = null;
	const globalListeners: Array<[EventTarget, string, EventListener]> = [];

	/** CSS pixels — the coordinate system of the camera maths. */
	const viewport = (): Size => ({
		width: Math.max(1, parent.clientWidth),
		height: Math.max(1, parent.clientHeight)
	});

	/**
	 * Phaser reports pointer coordinates in canvas pixels (CSS size × device
	 * ratio), while the camera maths happens in CSS pixels. Normalising through
	 * the actual canvas size keeps a drag exactly under the finger even if the
	 * canvas ends up displayed at a different size than requested.
	 */
	const toCss = (point: Point): Point => {
		const width = game?.scale?.width ?? 0;
		const height = game?.scale?.height ?? 0;
		const view = viewport();
		if (!width || !height) return point;
		return { x: (point.x / width) * view.width, y: (point.y / height) * view.height };
	};

	const applyToScene = (camera: CameraState) => {
		const cam = game?.scene?.getScene('map')?.cameras?.main;
		if (!cam) return;
		cam.setZoom(camera.zoom);
		cam.centerOn(camera.x, camera.y);
	};

	/** Mirror the camera into the DOM: readable for debugging and for tests. */
	const publish = (camera: CameraState) => {
		parent.dataset.zoom = camera.zoom.toFixed(4);
		parent.dataset.cameraX = camera.x.toFixed(2);
		parent.dataset.cameraY = camera.y.toFixed(2);
		options.onCamera?.(camera);
	};

	const ensureController = (): MapController => {
		if (controller) return controller;
		controller = new MapController({
			map: MAP_SIZE,
			limits: ZOOM_LIMITS,
			allowance: PAN_ALLOWANCE,
			viewport: viewport(),
			onChange: (camera) => {
				applyToScene(camera);
				publish(camera);
			}
		});
		return controller;
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
			// Explicit pixel sizes instead of 100%: Phaser derives its pointer
			// transform from the canvas' browser size, so it must be unambiguous.
			canvas.style.width = `${css.width}px`;
			canvas.style.height = `${css.height}px`;
			canvas.style.display = 'block';
			// Touch gestures must reach the game, not the page scroll.
			canvas.style.touchAction = 'none';
			// Long-press on a canvas otherwise opens the browser context menu.
			canvas.addEventListener('contextmenu', (event) => event.preventDefault());
		}
	};

	/** Re-read the pixel ratio: browser zoom and moving between screens change it. */
	const watchPixelRatio = () => {
		if (typeof window.matchMedia !== 'function') return;
		dprQuery?.removeEventListener('change', onDprChange);
		dprQuery = window.matchMedia(`(resolution: ${pixelRatio}dppx)`);
		dprQuery.addEventListener('change', onDprChange);
	};

	const onDprChange = () => {
		pixelRatio = currentPixelRatio();
		textResolution = Math.min(pixelRatio * 2, 4);
		syncCanvasSize();
		watchPixelRatio();
	};

	const onResize = () => {
		syncCanvasSize();
		const active = ensureController();
		active.setViewport(viewport());
		// The scene camera must be re-applied even when the camera state itself
		// did not change, because the canvas was resized underneath it.
		applyToScene(active.camera);
	};

	const addGlobalListener = (target: EventTarget, type: string, handler: EventListener) => {
		target.addEventListener(type, handler);
		globalListeners.push([target, type, handler]);
	};

	class MapScene extends Phaser.Scene {
		constructor() {
			super('map');
		}

		create() {
			const active = ensureController();
			this.drawPlaceholderMap();
			this.bindInput();
			applyToScene(active.camera);
			publish(active.camera);
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
			const active = ensureController();

			this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
				const point = toCss({ x: pointer.x, y: pointer.y });
				active.pointerDown({ id: pointer.id, x: point.x, y: point.y });
			});

			this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
				const point = toCss({ x: pointer.x, y: pointer.y });
				active.pointerMove({ id: pointer.id, x: point.x, y: point.y });
			});

			// A release outside the canvas belongs to a specific pointer, so it must
			// not clear the other fingers of a running pinch.
			const release = (pointer: Phaser.Input.Pointer) => active.pointerUp(pointer.id);
			this.input.on('pointerup', release);
			this.input.on('pointerupoutside', release);

			this.input.on(
				'wheel',
				(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
					active.wheel(toCss({ x: pointer.x, y: pointer.y }), dy);
				}
			);
		}
	}

	const css = viewport();
	const game: Phaser.Game = new Phaser.Game({
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
	watchPixelRatio();

	// Losing focus or a cancelled touch can drop pointer-up events entirely, which
	// would leave the controller holding a phantom finger.
	addGlobalListener(window, 'pointercancel', () => controller?.releaseAll());
	addGlobalListener(window, 'blur', () => controller?.releaseAll());
	addGlobalListener(document, 'visibilitychange', () => {
		if (document.hidden) controller?.releaseAll();
	});

	if (typeof ResizeObserver !== 'undefined') {
		resizeObserver = new ResizeObserver(onResize);
		resizeObserver.observe(parent);
	}

	return {
		fit() {
			ensureController().fit();
		},
		zoomIn() {
			ensureController().zoomBy(1.25);
		},
		zoomOut() {
			ensureController().zoomBy(1 / 1.25);
		},
		camera() {
			return controller?.camera ?? { x: 0, y: 0, zoom: 1 };
		},
		destroy() {
			resizeObserver?.disconnect();
			resizeObserver = null;
			dprQuery?.removeEventListener('change', onDprChange);
			dprQuery = null;
			for (const [target, type, handler] of globalListeners) {
				target.removeEventListener(type, handler);
			}
			globalListeners.length = 0;
			controller = null;
			game.destroy(true);
		}
	};
}
