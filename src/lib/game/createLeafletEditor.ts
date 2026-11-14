import L, { type Map as LeafletMap, type Marker as LeafletMarker } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './leaflet-markers.css';
import type { CaseDocument, CaseEntity, CasePoint } from '#lib/domain/case-document';
import { SHARED_MAP_DOCUMENT } from '#lib/domain/map-document';

export interface CameraState {
	x: number;
	y: number;
	/** Leaflet's world-to-screen scale, in screen pixels per map unit. */
	zoom: number;
}

export interface EditorMapHandle {
	fit(): void;
	zoomIn(): void;
	zoomOut(): void;
	camera(): CameraState;
	setDocument(document: CaseDocument): void;
	setBackgroundDocuments(documents: CaseDocument[]): void;
	setSelected(id: string | null): void;
	destroy(): void;
}

interface Options {
	document: CaseDocument;
	backgroundDocuments?: CaseDocument[];
	editable?: boolean;
	mapImage: string;
	onCamera?: (camera: CameraState) => void;
	onSelect?: (id: string | null) => void;
	onEntityMove?: (id: string, position: CasePoint) => void;
}

const MIN_SCALE = 0.15;
const MAX_SCALE = 4;
const BUTTON_ZOOM_STEP = Math.log2(1.25);
const INACTIVE_PANE = 'inactiveCasePane';
const COMPACT_MARKER_QUERY = '(max-width: 46rem), (max-height: 32rem)';

function pointToLatLng(point: CasePoint): L.LatLng {
	// CRS.Simple has an upward-positive y-axis; our case coordinates start at top-left.
	return L.latLng(SHARED_MAP_DOCUMENT.height - point.y, point.x);
}

function createEntityIcon(entity: CaseEntity, inactive: boolean): L.DivIcon {
	const root = document.createElement('div');
	root.className = `krimimap-map-marker${inactive ? ' is-inactive' : ''}`;

	const dot = document.createElement('span');
	dot.className = 'krimimap-map-marker__dot';
	dot.style.setProperty('--entity-color', inactive ? '#838383' : entity.color);
	const label = document.createElement('span');
	label.className = 'krimimap-map-marker__label';
	label.textContent = entity.name;
	root.append(dot, label);

	return L.divIcon({
		className: 'krimimap-map-marker-icon',
		html: root,
		iconSize: [44, 44],
		iconAnchor: [22, 22]
	});
}

/**
 * Build the browser-only Leaflet editor on the shared, fictional city map.
 * Pan, wheel zoom, pinch zoom and touch/pointer event routing are owned by
 * Leaflet; case edits remain ordinary domain callbacks.
 */
export function createLeafletEditor(parent: HTMLElement, options: Options): EditorMapHandle {
	if (options.document.mapId !== SHARED_MAP_DOCUMENT.id) {
		throw new Error(`Unsupported map: ${options.document.mapId}`);
	}

	const width = SHARED_MAP_DOCUMENT.width;
	const height = SHARED_MAP_DOCUMENT.height;
	const bounds = L.latLngBounds(L.latLng(0, 0), L.latLng(height, width));
	const paddedBounds = L.latLngBounds(
		L.latLng(-height * 0.35, -width * 0.35),
		L.latLng(height * 1.35, width * 1.35)
	);
	const map: LeafletMap = L.map(parent, {
		crs: L.CRS.Simple,
		zoomControl: false,
		attributionControl: false,
		boxZoom: false,
		doubleClickZoom: false,
		keyboard: true,
		dragging: true,
		touchZoom: true,
		scrollWheelZoom: true,
		wheelPxPerZoomLevel: 100,
		zoomSnap: 0,
		zoomDelta: 0.25,
		zoomAnimation: false,
		inertia: false,
		minZoom: Math.log2(MIN_SCALE),
		maxZoom: Math.log2(MAX_SCALE),
		maxBounds: paddedBounds,
		maxBoundsViscosity: 0.15,
		bounceAtZoomLimits: false
	});

	const pane = map.createPane(INACTIVE_PANE);
	pane.style.zIndex = '580';
	pane.style.pointerEvents = 'none';
	L.imageOverlay(options.mapImage, bounds, { interactive: false }).addTo(map);

	let document = options.document;
	let backgroundDocuments = options.backgroundDocuments ?? [];
	const editable = options.editable ?? true;
	let selectedId: string | null = null;
	const activeLayer = L.layerGroup().addTo(map);
	const inactiveLayer = L.layerGroup().addTo(map);
	const activeMarkers = new Map<string, LeafletMarker>();
	const compactMarkerMedia = window.matchMedia(COMPACT_MARKER_QUERY);
	const updateCompactMarkers = (scale: number) => {
		parent.dataset.compactMarkers = String(scale < 0.25 || compactMarkerMedia.matches);
	};
	const resizeObserver = new ResizeObserver(() => {
		map.invalidateSize({ pan: false, debounceMoveend: true });
		updateCompactMarkers(Math.pow(2, map.getZoom()));
	});
	resizeObserver.observe(parent);

	const camera = (): CameraState => {
		const centre = map.getCenter();
		return {
			x: centre.lng,
			y: SHARED_MAP_DOCUMENT.height - centre.lat,
			zoom: Math.pow(2, map.getZoom())
		};
	};
	const publish = () => {
		const state = camera();
		parent.dataset.zoom = state.zoom.toFixed(4);
		parent.dataset.cameraX = state.x.toFixed(2);
		parent.dataset.cameraY = state.y.toFixed(2);
		updateCompactMarkers(state.zoom);
		options.onCamera?.(state);
	};

	const decorateMarker = (
		marker: LeafletMarker,
		entity: CaseEntity,
		caseTitle: string,
		inactive: boolean,
		canEdit = true
	) => {
		const element = marker.getElement();
		if (!element) return;
		element.dataset.caseLayer = inactive ? 'inactive' : 'active';
		element.dataset.caseId = caseTitle;
		element.dataset.entityId = entity.id;
		element.dataset.draggable = String(!inactive && canEdit);
		element.style.pointerEvents = inactive ? 'none' : 'auto';
		element.style.cursor = !inactive && canEdit ? 'grab' : 'pointer';
		element.setAttribute('aria-hidden', String(inactive));
		if (!inactive) {
			element.setAttribute('role', 'button');
			element.setAttribute('aria-label', `${entity.name} (${caseTitle})`);
			element.tabIndex = 0;
		}
	};

	const renderDocuments = () => {
		activeLayer.clearLayers();
		inactiveLayer.clearLayers();
		activeMarkers.clear();

		for (const other of backgroundDocuments) {
			if (other.id === document.id || other.mapId !== document.mapId) continue;
			for (const entity of other.entities) {
				const marker = L.marker(pointToLatLng(entity.position), {
					icon: createEntityIcon(entity, true),
					pane: INACTIVE_PANE,
					interactive: false,
					keyboard: false,
					draggable: false,
					title: `${entity.name} — ${other.title}`
				});
				marker.on('add', () => decorateMarker(marker, entity, other.title, true));
				inactiveLayer.addLayer(marker);
			}
		}

		for (const entity of document.entities) {
			const marker = L.marker(pointToLatLng(entity.position), {
				icon: createEntityIcon(entity, false),
				keyboard: true,
				draggable: editable,
				bubblingMouseEvents: false,
				title: entity.name
			});
			marker.on('add', () => decorateMarker(marker, entity, document.title, false, editable));
			marker.on('click', () => options.onSelect?.(entity.id));
			if (editable) {
				marker.on('dragstart', () => options.onSelect?.(entity.id));
				marker.on('dragend', () => {
					const position = marker.getLatLng();
					options.onEntityMove?.(entity.id, {
						x: position.lng,
						y: SHARED_MAP_DOCUMENT.height - position.lat
					});
				});
			}
			activeLayer.addLayer(marker);
			activeMarkers.set(entity.id, marker);
		}

		applySelection();
	};

	const applySelection = () => {
		for (const [id, marker] of activeMarkers) {
			marker
				.getElement()
				?.querySelector('.krimimap-map-marker')
				?.classList.toggle('is-selected', id === selectedId);
		}
	};

	map.on('click', () => options.onSelect?.(null));
	map.on('moveend zoomend', publish);
	map.fitBounds(bounds, { animate: false });
	publish();
	renderDocuments();

	return {
		fit() {
			map.fitBounds(bounds, { animate: false });
		},
		zoomIn() {
			map.setZoom(map.getZoom() + BUTTON_ZOOM_STEP);
		},
		zoomOut() {
			map.setZoom(map.getZoom() - BUTTON_ZOOM_STEP);
		},
		camera,
		setDocument(next) {
			if (next.mapId !== SHARED_MAP_DOCUMENT.id) {
				throw new Error(`Unsupported map: ${next.mapId}`);
			}
			document = next;
			renderDocuments();
		},
		setBackgroundDocuments(next) {
			backgroundDocuments = next;
			renderDocuments();
		},
		setSelected(id) {
			selectedId = id;
			applySelection();
		},
		destroy() {
			resizeObserver.disconnect();
			map.remove();
		}
	};
}
