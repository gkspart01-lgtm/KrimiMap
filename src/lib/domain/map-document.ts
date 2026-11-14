export interface MapDocument {
	/** Stable identifier referenced by each case. */
	id: string;
	name: { de: string; en: string };
	width: number;
	height: number;
	/** Static, same-origin SVG path; the app remains usable offline. */
	assetPath: 'maps/crime-city.svg';
}

/** One shared authored map for all current and future KrimiMap cases. */
export const SHARED_MAP_DOCUMENT: Readonly<MapDocument> = Object.freeze({
	id: 'crime-city',
	name: { de: 'Krimi-Stadt', en: 'Crime City' },
	width: 2400,
	height: 1600,
	assetPath: 'maps/crime-city.svg'
});

export type MapDocumentId = typeof SHARED_MAP_DOCUMENT.id;
