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
			this.drawMap();
			this.bindInput();
			applyToScene(active.camera);
			publish(active.camera);
		}

		/**
		 * The placeholder map, drawn to look like a cartographer's board rather than
		 * a debug grid: gradient backdrop, two-level grid, frame with corner ticks,
		 * edge coordinates, and entity markers with soft glow and readable labels.
		 *
		 * Everything is generated at boot, so there are no image assets to ship or
		 * license. Case data replaces the entity list in Phase 2.
		 */
		private drawMap() {
			this.drawBackdrop();
			this.drawGrid();
			this.drawFrame();
			this.drawEntities();
			this.drawVignette();
		}

		/**
		 * Gradient backdrop plus a faint light pool, as one stretchable texture.
		 * Deliberately small: gradients do not need map-sized texels, and large
		 * textures make every frame expensive on software rendering.
		 */
		private drawBackdrop() {
			const width = 480;
			const height = 320;
			const texture = this.textures.createCanvas('map-backdrop', width, height);
			if (!texture) return;

			const ctx = texture.getContext();
			const vertical = ctx.createLinearGradient(0, 0, 0, height);
			vertical.addColorStop(0, '#141d29');
			vertical.addColorStop(0.55, '#19232f');
			vertical.addColorStop(1, '#0e141d');
			ctx.fillStyle = vertical;
			ctx.fillRect(0, 0, width, height);

			const pool = ctx.createRadialGradient(
				width * 0.5,
				height * 0.32,
				40,
				width * 0.5,
				height * 0.32,
				width * 0.6
			);
			pool.addColorStop(0, 'rgba(122, 162, 247, 0.12)');
			pool.addColorStop(1, 'rgba(122, 162, 247, 0)');
			ctx.fillStyle = pool;
			ctx.fillRect(0, 0, width, height);

			texture.refresh();
			this.add
				.image(0, 0, 'map-backdrop')
				.setOrigin(0, 0)
				.setDisplaySize(MAP_SIZE.width, MAP_SIZE.height)
				.setDepth(-30);
		}

		/** Two grid levels plus letters on top and numbers on the left edge. */
		private drawGrid() {
			const fine = this.add.graphics().setDepth(-20);
			fine.lineStyle(1, 0x8fa3bd, 0.05);
			for (let x = 100; x < MAP_SIZE.width; x += 100) {
				fine.lineBetween(x, 0, x, MAP_SIZE.height);
			}
			for (let y = 100; y < MAP_SIZE.height; y += 100) {
				fine.lineBetween(0, y, MAP_SIZE.width, y);
			}

			const coarse = this.add.graphics().setDepth(-19);
			coarse.lineStyle(1, 0xa8bdd6, 0.11);
			for (let x = 500; x < MAP_SIZE.width; x += 500) {
				coarse.lineBetween(x, 0, x, MAP_SIZE.height);
			}
			for (let y = 500; y < MAP_SIZE.height; y += 500) {
				coarse.lineBetween(0, y, MAP_SIZE.width, y);
			}

			const labelStyle = {
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
				fontSize: '22px',
				color: '#8798ad'
			};
			for (let index = 0; index < MAP_SIZE.width / 500; index += 1) {
				this.add
					.text(index * 500 + 250, 34, String.fromCharCode(65 + index), labelStyle)
					.setOrigin(0.5, 0)
					.setAlpha(0.5)
					.setResolution(textResolution)
					.setDepth(-18);
			}
			for (let index = 0; index < MAP_SIZE.height / 500; index += 1) {
				this.add
					.text(34, index * 500 + 250, String(index + 1), labelStyle)
					.setOrigin(0, 0.5)
					.setAlpha(0.5)
					.setResolution(textResolution)
					.setDepth(-18);
			}
		}

		/** Double frame with accent corner ticks — the "board" edge. */
		private drawFrame() {
			const frame = this.add.graphics().setDepth(-17);
			frame.lineStyle(3, 0x2f3f52, 1);
			frame.strokeRect(1.5, 1.5, MAP_SIZE.width - 3, MAP_SIZE.height - 3);
			frame.lineStyle(1, 0xf0b429, 0.5);
			frame.strokeRect(16, 16, MAP_SIZE.width - 32, MAP_SIZE.height - 32);

			const tick = 70;
			const inset = 16;
			frame.lineStyle(5, 0xf0b429, 0.9);
			const corners = [
				{ x: inset, y: inset, dx: 1, dy: 1 },
				{ x: MAP_SIZE.width - inset, y: inset, dx: -1, dy: 1 },
				{ x: inset, y: MAP_SIZE.height - inset, dx: 1, dy: -1 },
				{ x: MAP_SIZE.width - inset, y: MAP_SIZE.height - inset, dx: -1, dy: -1 }
			];
			for (const corner of corners) {
				frame.lineBetween(corner.x, corner.y, corner.x + tick * corner.dx, corner.y);
				frame.lineBetween(corner.x, corner.y, corner.x, corner.y + tick * corner.dy);
			}
		}

		/** Placeholder entities: soft glow, ring, core and a plated label. */
		private drawEntities() {
			const entities = [
				{ x: 520, y: 420, label: 'Pförtner', color: 0x4ec9a0 },
				{ x: 1180, y: 700, label: 'Schlüssel', color: 0xe8a33d },
				{ x: 1860, y: 1180, label: 'Bibliothek', color: 0x7aa2f7 },
				{ x: 980, y: 1300, label: 'Kiste', color: 0xe5657a }
			];

			for (const entity of entities) {
				const glow = this.add.graphics().setDepth(-6);
				glow.fillStyle(entity.color, 0.1);
				glow.fillCircle(entity.x, entity.y, 84);
				glow.fillStyle(entity.color, 0.07);
				glow.fillCircle(entity.x, entity.y, 56);

				const marker = this.add.graphics().setDepth(0);
				marker.lineStyle(3, entity.color, 0.95);
				marker.strokeCircle(entity.x, entity.y, 26);
				marker.fillStyle(entity.color, 0.9);
				marker.fillCircle(entity.x, entity.y, 8);

				const text = this.add
					.text(entity.x + 44, entity.y, entity.label, {
						fontFamily: 'system-ui, sans-serif',
						fontSize: '26px',
						color: '#e8ecf2'
					})
					.setOrigin(0, 0.5)
					.setResolution(textResolution)
					.setDepth(2);

				const padding = 10;
				const plate = this.add.graphics().setDepth(1);
				const plateX = entity.x + 44 - padding;
				const plateY = entity.y - text.height / 2 - padding / 2;
				plate.fillStyle(0x0d131b, 0.72);
				plate.fillRoundedRect(plateX, plateY, text.width + padding * 2, text.height + padding, 8);
				plate.lineStyle(1, entity.color, 0.28);
				plate.strokeRoundedRect(plateX, plateY, text.width + padding * 2, text.height + padding, 8);
			}
		}

		/** Edge darkening so the map reads as a board rather than a tiled plane. */
		private drawVignette() {
			const width = 320;
			const height = 213;
			const texture = this.textures.createCanvas('map-vignette', width, height);
			if (!texture) return;

			const ctx = texture.getContext();
			const gradient = ctx.createRadialGradient(
				width / 2,
				height / 2,
				width * 0.28,
				width / 2,
				height / 2,
				width * 0.62
			);
			gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
			gradient.addColorStop(1, 'rgba(0, 0, 0, 0.55)');
			ctx.fillStyle = gradient;
			ctx.fillRect(0, 0, width, height);
			texture.refresh();

			this.add
				.image(0, 0, 'map-vignette')
				.setOrigin(0, 0)
				.setDisplaySize(MAP_SIZE.width, MAP_SIZE.height)
				.setDepth(40);
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
