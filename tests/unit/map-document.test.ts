import { describe, expect, it } from 'vitest';
import { SHARED_MAP_DOCUMENT } from '#lib/domain/map-document';

describe('shared map resource', () => {
	it('exposes one stable, local illustrated map for every case', () => {
		expect(SHARED_MAP_DOCUMENT).toEqual({
			id: 'crime-city',
			name: { de: 'Krimi-Stadt', en: 'Crime City' },
			width: 2400,
			height: 1600,
			assetPath: 'maps/crime-city.svg'
		});
	});
});
