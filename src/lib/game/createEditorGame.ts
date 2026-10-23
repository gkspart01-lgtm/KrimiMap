import Phaser from 'phaser';
import {
	clampToMap,
	fitMap,
	panBy,
	zoomAround,
	type CameraState,
	type Size,
	type ZoomLimits
} from './camera';

/** Placeholder map size in world pixels; replaced by case data in Phase 2. */
export const MAP_SIZE: Size = { width: 2400, height: 1600 };

const ZOOM_LIMITS: ZoomLimits = { minZoom: 0.15, maxZoom: 4 };

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

/**
 * Boots the map workspace: a Phaser canvas with pan (drag), zoom (wheel and
 * pinch) and a placeholder map so the interaction can be verified before the
 * real case rendering exists.
 *
 * This module touches `window`/WebGL, so it may only be imported in the
 * browser (dynamic import from `onMount`).
 */
export function createEditorGame(parent: HTMLElement, options: Options = {}): EditorGameHandle {
	let camera: CameraState | null = null;
	let game: Phaser.Game;

	const viewport = (): Size => ({
		width: parent.clientWidth || 1,
		height: parent.clientHeight || 1
	});

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
		camera = clampToMap(next, MAP_SIZE, viewport(), ZOOM_LIMITS);
		apply();
	};

	class MapScene extends Phaser.Scene {
		private pointers = new Map<number, { x: number; y: number }>();
		private pinchStart: { distance: number; zoom: number } | null = null;
		private dragging = false;

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
					.setOrigin(0, 0.5);
			}

			this.add
				.text(40, 40, `KrimiMap — Kartenbereich ${MAP_SIZE.width}×${MAP_SIZE.height}`, {
					fontFamily: 'system-ui, sans-serif',
					fontSize: '34px',
					color: '#97a3b4'
				})
				.setOrigin(0, 0);
		}

		private bindInput() {
			this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
				this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });
				this.dragging = this.pointers.size === 1;
				if (this.pointers.size === 2) {
					this.pinchStart = {
						distance: this.pointerDistance(),
						zoom: camera?.zoom ?? 1
					};
				}
			});

			this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
				this.pointers.delete(pointer.id);
				if (this.pointers.size < 2) this.pinchStart = null;
				if (this.pointers.size === 0) this.dragging = false;
			});

			this.input.on(
				'pointermove',
				(pointer: Phaser.Input.Pointer) => {
					if (!camera) return;
					const known = this.pointers.has(pointer.id);
					if (known) this.pointers.set(pointer.id, { x: pointer.x, y: pointer.y });

					if (this.pointers.size >= 2 && this.pinchStart && known) {
						const distance = this.pointerDistance();
						if (this.pinchStart.distance > 0 && distance > 0) {
							const zoom = this.pinchStart.zoom * (distance / this.pinchStart.distance);
							setCamera(
								zoomAround(camera, this.pinchCenter(), zoom / camera.zoom, viewport(), ZOOM_LIMITS)
							);
						}
						return;
					}

					if (this.dragging && known) {
						const delta = {
							x: pointer.x - pointer.prevPosition.x,
							y: pointer.y - pointer.prevPosition.y
						};
						if (delta.x !== 0 || delta.y !== 0) setCamera(panBy(camera, delta));
					}
				},
				this
			);

			this.input.on(
				'wheel',
				(pointer: Phaser.Input.Pointer, _over: unknown, _dx: number, dy: number) => {
					if (!camera) return;
					const factor = dy > 0 ? 1 / 1.12 : 1.12;
					setCamera(
						zoomAround(camera, { x: pointer.x, y: pointer.y }, factor, viewport(), ZOOM_LIMITS)
					);
				}
			);

			this.scale.on('resize', () => {
				if (camera) setCamera(camera);
			});
		}

		private pointerDistance(): number {
			const values = [...this.pointers.values()];
			if (values.length < 2) return 0;
			const dx = values[0].x - values[1].x;
			const dy = values[0].y - values[1].y;
			return Math.hypot(dx, dy);
		}

		private pinchCenter() {
			const values = [...this.pointers.values()];
			if (values.length < 2) return { x: viewport().width / 2, y: viewport().height / 2 };
			return { x: (values[0].x + values[1].x) / 2, y: (values[0].y + values[1].y) / 2 };
		}
	}

	game = new Phaser.Game({
		type: Phaser.AUTO,
		parent,
		backgroundColor: '#0f1218',
		scale: {
			mode: Phaser.Scale.RESIZE
		},
		render: { antialias: true },
		scene: [MapScene]
	});

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
			game.destroy(true);
		}
	};
}
