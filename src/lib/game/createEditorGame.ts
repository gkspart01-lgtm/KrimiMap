import Phaser from 'phaser';
import type { CaseDocument, CaseEntity } from '#lib/domain/case-document';
import { MapController } from './map-controller';
import type { CameraState, Point, Size, ZoomLimits } from './camera';

export const ZOOM_LIMITS: ZoomLimits = { minZoom: 0.15, maxZoom: 4 };

/** Rendering above 3× device resolution only costs fill rate. */
const MAX_PIXEL_RATIO = 3;

/**
 * How far (as a fraction of the viewport) the camera may be dragged past the
 * map edge. Without slack a map that fits the screen cannot be moved at all and
 * dragging feels unresponsive.
 */
const PAN_ALLOWANCE = 0.15;

/** Hit radius for selecting/dragging an entity, in world pixels. */
const HIT_RADIUS = 40;

export interface EditorGameHandle {
	fit(): void;
	zoomIn(): void;
	zoomOut(): void;
	camera(): CameraState;
	/** Replace the rendered document (case switch, undo, external edit). */
	setDocument(document: CaseDocument): void;
	/** Highlight one entity, or clear the highlight. */
	setSelected(id: string | null): void;
	destroy(): void;
}

interface Options {
	document?: CaseDocument;
	/** Called whenever the camera changes so the UI can mirror it. */
	onCamera?: (camera: CameraState) => void;
	/** Called with the entity under the pointer, or `null` for empty map. */
	onSelect?: (id: string | null) => void;
	/** Called once when a drag ends — deliberately not on every frame. */
	onEntityMove?: (id: string, position: Point) => void;
}

function currentPixelRatio(): number {
	return Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
}

/**
 * Boots the map workspace: a Phaser canvas, the gesture handling in
 * `MapController`, and rendering/dragging of one case document's entities.
 *
 * This function is deliberately thin — it converts pointer events into CSS-pixel
 * samples, applies the resulting camera to the Phaser camera, keeps the canvas at
 * device resolution and reports what the user grabbed. Every interaction rule
 * lives in the controller so it can be unit tested without a browser.
 *
 * This module touches `window`/WebGL, so it may only be imported in the browser
 * (dynamic import from `onMount`).
 */
export function createEditorGame(parent: HTMLElement, options: Options = {}): EditorGameHandle {
	let pixelRatio = currentPixelRatio();
	/** Text is rasterised once, so oversample it to survive the zoom range. */
	let textResolution = Math.min(pixelRatio * 2, 4);

	let caseDocument: CaseDocument | null = options.document ?? null;
	let controller: MapController | null = null;
	let resizeObserver: ResizeObserver | null = null;
	let dprQuery: MediaQueryList | null = null;
	let scene: MapScene | null = null;
	const registerScene = (instance: MapScene) => {
		scene = instance;
	};
	const globalListeners: Array<[EventTarget, string, EventListener]> = [];

	/** CSS pixels — the coordinate system of the camera maths. */
	const viewport = (): Size => ({
		width: Math.max(1, parent.clientWidth),
		height: Math.max(1, parent.clientHeight)
	});

	const mapSize = (): Size => ({
		width: caseDocument?.map.width ?? 2400,
		height: caseDocument?.map.height ?? 1600
	});

	const applyToScene = (camera: CameraState) => {
		const cam = game?.scene?.getScene('map')?.cameras?.main;
		if (!cam) return;
		cam.setZoom(camera.zoom);
		cam.centerOn(camera.x, camera.y);
	};

	/** Mirror the camera into the DOM: readable for debugging and for tests. */
	let lastPublished: CameraState | null = null;
	const publish = (camera: CameraState) => {
		parent.dataset.zoom = camera.zoom.toFixed(4);
		parent.dataset.cameraX = camera.x.toFixed(2);
		parent.dataset.cameraY = camera.y.toFixed(2);
		// Notify on real change only: every call also runs a Svelte update, and a
		// phone cannot afford that per pointer event.
		if (
			lastPublished &&
			Math.abs(lastPublished.x - camera.x) < 0.5 &&
			Math.abs(lastPublished.y - camera.y) < 0.5 &&
			Math.abs(lastPublished.zoom - camera.zoom) < 0.002
		) {
			return;
		}
		lastPublished = camera;
		options.onCamera?.(camera);
	};

	const ensureController = (): MapController => {
		if (controller) return controller;
		controller = new MapController({
			map: mapSize(),
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
		scene?.layoutOverlay();
	};

	const addGlobalListener = (target: EventTarget, type: string, handler: EventListener) => {
		target.addEventListener(type, handler);
		globalListeners.push([target, type, handler]);
	};

	/** Screen (CSS) point → world point, using the camera the controller owns. */
	const toWorld = (css: Point): Point => {
		const camera = ensureController().camera;
		const view = viewport();
		return {
			x: camera.x + (css.x - view.width / 2) / camera.zoom,
			y: camera.y + (css.y - view.height / 2) / camera.zoom
		};
	};

	class MapScene extends Phaser.Scene {
		private backdrop: Phaser.GameObjects.Image | null = null;
		private vignette: Phaser.GameObjects.Image | null = null;
		private gridLayer: Phaser.GameObjects.Graphics | null = null;
		private frameLayer: Phaser.GameObjects.Graphics | null = null;
		private edgeLabels: Phaser.GameObjects.Text[] = [];
		private entityLayer!: Phaser.GameObjects.Container;
		private selectionLayer!: Phaser.GameObjects.Graphics;
		private entityObjects = new Map<string, Phaser.GameObjects.Container>();
		private dragging: { id: string; offset: Point; start: Point } | null = null;
		/**
		 * A finger that lands on a marker is not a drag yet: it may become a tap
		 * (select) or the start of a pinch. Promoting only after the finger has
		 * travelled far enough keeps pinching from dragging entities around.
		 */
		private candidate: { id: string; pointerId: number; startCss: Point; offset: Point } | null =
			null;
		private drawnMap: { width: number; height: number } | null = null;
		private selectedId: string | null = null;

		constructor() {
			super('map');
		}

		create() {
			this.entityLayer = this.add.container(0, 0).setDepth(3);
			this.selectionLayer = this.add.graphics().setDepth(4);

			const active = ensureController();
			this.buildBase();
			this.buildEntities();
			this.bindInput();
			applyToScene(active.camera);
			publish(active.camera);
			registerScene(this);
		}

		/** Called by the handle when the document changes. */
		refresh() {
			if (!this.sys.isActive()) return;
			const size = mapSize();
			if (
				!this.drawnMap ||
				this.drawnMap.width !== size.width ||
				this.drawnMap.height !== size.height
			) {
				this.buildBase();
			}
			this.buildEntities();
		}

		setSelection(id: string | null) {
			this.selectedId = id;
			this.drawSelection();
		}

		/** The vignette belongs to the screen, not the map: it must not zoom away. */
		layoutOverlay() {
			const cam = this.cameras.main;
			const view = viewport();
			this.vignette?.setPosition(cam.midPoint.x, cam.midPoint.y);
			this.vignette?.setDisplaySize(view.width / cam.zoom, view.height / cam.zoom);
			this.drawSelection();
		}

		private buildBase() {
			const { width, height } = mapSize();
			const backdropKey = `map-backdrop-${width}x${height}`;
			if (!this.textures.exists(backdropKey)) this.paintBackdrop(backdropKey);
			if (!this.textures.exists('map-vignette')) this.paintVignette('map-vignette');

			this.backdrop?.destroy();
			this.backdrop = this.add
				.image(0, 0, backdropKey)
				.setOrigin(0, 0)
				.setDisplaySize(width, height)
				.setDepth(-30);

			this.gridLayer?.destroy();
			this.gridLayer = this.add.graphics().setDepth(-20);
			this.paintGrid(this.gridLayer, width, height);

			this.edgeLabels.forEach((label) => label.destroy());
			this.edgeLabels = this.paintEdgeLabels(width, height);

			this.frameLayer?.destroy();
			this.frameLayer = this.add.graphics().setDepth(-17);
			this.paintFrame(this.frameLayer, width, height);

			this.vignette?.destroy();
			this.vignette = this.add
				.image(0, 0, 'map-vignette')
				.setOrigin(0.5, 0.5)
				.setDepth(40)
				.setAlpha(0.85);

			this.drawnMap = { width, height };
			this.layoutOverlay();
		}

		/**
		 * Gradient backdrop plus a faint light pool, as one small stretchable
		 * texture: gradients do not need map-sized texels, and large textures make
		 * every frame expensive on software rendering.
		 */
		private paintBackdrop(key: string) {
			const width = 480;
			const height = 320;
			const texture = this.textures.createCanvas(key, width, height);
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
		}

		private paintVignette(key: string) {
			const width = 320;
			const height = 213;
			const texture = this.textures.createCanvas(key, width, height);
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
		}

		/** Two grid levels — fine and coarse — as one graphics object. */
		private paintGrid(grid: Phaser.GameObjects.Graphics, width: number, height: number) {
			grid.lineStyle(1, 0x8fa3bd, 0.05);
			for (let x = 100; x < width; x += 100) grid.lineBetween(x, 0, x, height);
			for (let y = 100; y < height; y += 100) grid.lineBetween(0, y, width, y);

			grid.lineStyle(1, 0xa8bdd6, 0.11);
			for (let x = 500; x < width; x += 500) grid.lineBetween(x, 0, x, height);
			for (let y = 500; y < height; y += 500) grid.lineBetween(0, y, width, y);
		}

		private paintEdgeLabels(width: number, height: number): Phaser.GameObjects.Text[] {
			const labels: Phaser.GameObjects.Text[] = [];
			const style = {
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
				fontSize: '22px',
				color: '#8798ad'
			};

			for (let index = 0; index < Math.ceil(width / 500); index += 1) {
				labels.push(
					this.add
						.text(index * 500 + 250, 30, String.fromCharCode(65 + index), style)
						.setOrigin(0.5, 0)
						.setAlpha(0.5)
						.setResolution(textResolution)
						.setDepth(-18)
				);
			}
			for (let index = 0; index < Math.ceil(height / 500); index += 1) {
				labels.push(
					this.add
						.text(30, index * 500 + 250, String(index + 1), style)
						.setOrigin(0, 0.5)
						.setAlpha(0.5)
						.setResolution(textResolution)
						.setDepth(-18)
				);
			}
			return labels;
		}

		private paintFrame(frame: Phaser.GameObjects.Graphics, width: number, height: number) {
			frame.lineStyle(3, 0x2f3f52, 1);
			frame.strokeRect(1.5, 1.5, width - 3, height - 3);
			frame.lineStyle(1, 0xf0b429, 0.5);
			frame.strokeRect(16, 16, width - 32, height - 32);

			const tick = 70;
			const inset = 16;
			frame.lineStyle(5, 0xf0b429, 0.9);
			const corners = [
				{ x: inset, y: inset, dx: 1, dy: 1 },
				{ x: width - inset, y: inset, dx: -1, dy: 1 },
				{ x: inset, y: height - inset, dx: 1, dy: -1 },
				{ x: width - inset, y: height - inset, dx: -1, dy: -1 }
			];
			for (const corner of corners) {
				frame.lineBetween(corner.x, corner.y, corner.x + tick * corner.dx, corner.y);
				frame.lineBetween(corner.x, corner.y, corner.x, corner.y + tick * corner.dy);
			}
		}

		/** Rebuild the entity layer from the document. */
		private buildEntities() {
			this.entityLayer.removeAll(true);
			this.entityObjects.clear();

			for (const entity of caseDocument?.entities ?? []) {
				const container = this.add.container(entity.position.x, entity.position.y);
				const color = Phaser.Display.Color.HexStringToColor(entity.color).color;

				const glow = this.add.graphics();
				glow.fillStyle(color, 0.1);
				glow.fillCircle(0, 0, 84);
				glow.fillStyle(color, 0.07);
				glow.fillCircle(0, 0, 56);

				const marker = this.add.graphics();
				marker.lineStyle(3, color, 0.95);
				marker.strokeCircle(0, 0, 26);
				marker.fillStyle(color, 0.9);
				marker.fillCircle(0, 0, 8);

				const text = this.add
					.text(44, 0, entity.name, {
						fontFamily: 'system-ui, sans-serif',
						fontSize: '26px',
						color: '#e8ecf2'
					})
					.setOrigin(0, 0.5)
					.setResolution(textResolution);

				const padding = 10;
				const plate = this.add.graphics();
				const plateX = 44 - padding;
				const plateY = -text.height / 2 - padding / 2;
				const plateWidth = text.width + padding * 2;
				const plateHeight = text.height + padding;
				plate.fillStyle(0x0d131b, 0.72);
				plate.fillRoundedRect(plateX, plateY, plateWidth, plateHeight, 8);
				plate.lineStyle(1, color, 0.28);
				plate.strokeRoundedRect(plateX, plateY, plateWidth, plateHeight, 8);

				container.add([glow, plate, text, marker]);
				container.setSize(90, 90);
				this.entityLayer.add(container);
				this.entityObjects.set(entity.id, container);
			}

			this.drawSelection();
		}

		private entityColor(id: string): number {
			const entity = caseDocument?.entities.find((candidate) => candidate.id === id);
			return Phaser.Display.Color.HexStringToColor(entity?.color ?? '#ffffff').color;
		}

		private drawSelection() {
			this.selectionLayer.clear();
			if (!this.selectedId) return;
			const entity = caseDocument?.entities.find((candidate) => candidate.id === this.selectedId);
			if (!entity) return;
			const container = this.entityObjects.get(entity.id);
			const x = container?.x ?? entity.position.x;
			const y = container?.y ?? entity.position.y;
			this.selectionLayer.lineStyle(2, 0xffffff, 0.85);
			this.selectionLayer.strokeCircle(x, y, 34);
			this.selectionLayer.lineStyle(1, this.entityColor(entity.id), 0.6);
			this.selectionLayer.strokeCircle(x, y, 40);
		}

		private entityAt(world: Point): CaseEntity | null {
			let best: CaseEntity | null = null;
			let bestDistance = HIT_RADIUS;
			for (const entity of caseDocument?.entities ?? []) {
				const distance = Math.hypot(entity.position.x - world.x, entity.position.y - world.y);
				if (distance <= bestDistance) {
					best = entity;
					bestDistance = distance;
				}
			}
			return best;
		}

		/**
		 * Input comes straight from DOM pointer events, not from Phaser.
		 *
		 * Phaser's touch manager batches touches per frame and reports positions in
		 * its own coordinate space, which on a real phone did not match CSS pixels —
		 * the map then moved slower than the finger. `clientX/clientY` minus the
		 * canvas rect are CSS pixels on every device, and pointer events arrive per
		 * event instead of per frame, so a drag tracks exactly.
		 */
		private bindInput() {
			const canvas = this.game.canvas;
			if (!canvas) return;
			const active = ensureController();

			const css = (event: PointerEvent): Point => {
				const rect = canvas.getBoundingClientRect();
				return { x: event.clientX - rect.left, y: event.clientY - rect.top };
			};

			const onPointerDown = (event: PointerEvent) => {
				event.preventDefault();
				const point = css(event);

				// A second finger means pinch: hand both pointers to the controller and
				// drop any pending marker gesture, so the map zooms and the marker stays.
				if (this.candidate || this.dragging) {
					const pending = this.candidate;
					if (this.dragging) {
						this.entityObjects
							.get(this.dragging.id)
							?.setPosition(this.dragging.start.x, this.dragging.start.y);
						this.dragging = null;
					}
					this.candidate = null;
					if (pending)
						active.pointerDown({
							id: pending.pointerId,
							x: pending.startCss.x,
							y: pending.startCss.y
						});
					active.pointerDown({ id: event.pointerId, x: point.x, y: point.y });
					return;
				}

				const world = toWorld(point);
				const hit = this.entityAt(world);

				if (hit) {
					this.candidate = {
						id: hit.id,
						pointerId: event.pointerId,
						startCss: point,
						offset: { x: world.x - hit.position.x, y: world.y - hit.position.y }
					};
					return;
				}

				this.selectedId = null;
				options.onSelect?.(null);
				this.drawSelection();
				active.pointerDown({ id: event.pointerId, x: point.x, y: point.y });
			};

			const onPointerMove = (event: PointerEvent) => {
				const point = css(event);

				// Promote a marker touch into a drag only after it clearly moved.
				if (this.candidate && event.pointerId === this.candidate.pointerId) {
					const travelled = Math.hypot(
						point.x - this.candidate.startCss.x,
						point.y - this.candidate.startCss.y
					);
					if (travelled < 8) return;
					const entity = caseDocument?.entities.find((item) => item.id === this.candidate?.id);
					this.dragging = {
						id: this.candidate.id,
						offset: this.candidate.offset,
						start: entity ? { ...entity.position } : { x: 0, y: 0 }
					};
					this.selectedId = this.candidate.id;
					options.onSelect?.(this.candidate.id);
					this.candidate = null;
					this.drawSelection();
				}

				if (this.dragging) {
					const world = toWorld(point);
					const size = mapSize();
					const x = Phaser.Math.Clamp(world.x - this.dragging.offset.x, 0, size.width);
					const y = Phaser.Math.Clamp(world.y - this.dragging.offset.y, 0, size.height);
					this.entityObjects.get(this.dragging.id)?.setPosition(x, y);
					this.drawSelection();
					return;
				}

				active.pointerMove({ id: event.pointerId, x: point.x, y: point.y });
			};

			const onPointerUp = (event: PointerEvent) => {
				// A finger that never travelled was a tap: select the marker.
				if (this.candidate && event.pointerId === this.candidate.pointerId) {
					this.selectedId = this.candidate.id;
					options.onSelect?.(this.candidate.id);
					this.candidate = null;
					this.drawSelection();
					return;
				}
				if (this.dragging) {
					const container = this.entityObjects.get(this.dragging.id);
					if (container) {
						options.onEntityMove?.(this.dragging.id, { x: container.x, y: container.y });
					}
					this.dragging = null;
					return;
				}
				active.pointerUp(event.pointerId);
			};

			const onPointerCancel = (event: PointerEvent) => {
				this.candidate = null;
				this.dragging = null;
				active.releaseAll();
				void event;
			};

			canvas.addEventListener('pointerdown', onPointerDown);
			canvas.addEventListener('pointermove', onPointerMove);
			canvas.addEventListener('pointerup', onPointerUp);
			canvas.addEventListener('pointercancel', onPointerCancel);
			canvas.addEventListener('pointerleave', onPointerUp);

			canvas.addEventListener(
				'wheel',
				(event: WheelEvent) => {
					event.preventDefault();
					const rect = canvas.getBoundingClientRect();
					active.wheel({ x: event.clientX - rect.left, y: event.clientY - rect.top }, event.deltaY);
				},
				{ passive: false }
			);

			this.events.once('shutdown', () => {
				canvas.removeEventListener('pointerdown', onPointerDown);
				canvas.removeEventListener('pointermove', onPointerMove);
				canvas.removeEventListener('pointerup', onPointerUp);
				canvas.removeEventListener('pointercancel', onPointerCancel);
				canvas.removeEventListener('pointerleave', onPointerUp);
			});
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
		setDocument(next: CaseDocument) {
			caseDocument = next;
			ensureController().setMap(mapSize());
			scene?.refresh();
		},
		setSelected(id: string | null) {
			scene?.setSelection(id);
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
			scene = null;
			game.destroy(true);
		}
	};
}
