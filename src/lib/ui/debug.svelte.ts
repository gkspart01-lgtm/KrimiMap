/**
 * Debug mode: shows the technical bits that are useful while building
 * (camera numbers, the AI spike, build stamps, WebGPU notes) and keeps them out
 * of the way for everyone else.
 *
 * Enabled by the gear in the header, `?debug=1`, or a stored preference.
 */
const STORAGE_KEY = 'krimimap.debug';

let enabled = $state(false);
let initialised = false;

export function initDebug(): void {
	if (initialised || typeof window === 'undefined') return;
	initialised = true;

	// Read `?debug=` without constructing a URL helper: the Svelte lint rules
	// reject mutable built-ins, and this is all the parsing the app needs.
	const param = /(?:^[?&]|&)debug=([^&]*)/.exec(location.search)?.[1] ?? null;
	if (param === '1') {
		setDebug(true);
		return;
	}
	if (param === '0') {
		setDebug(false);
		return;
	}

	try {
		enabled = localStorage.getItem(STORAGE_KEY) === '1';
	} catch {
		// Private mode with storage disabled: debug stays off, nothing breaks.
	}
}

export function debug(): boolean {
	return enabled;
}

export function setDebug(value: boolean): void {
	enabled = value;
	try {
		localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
	} catch {
		/* ignore */
	}
}

export function toggleDebug(): void {
	setDebug(!enabled);
}
