/**
 * Locale state and the `t()` helper.
 *
 * Default is German (the product's primary language); the choice is remembered
 * and can be switched from the header at any time. `t()` is reactive because it
 * reads the `$state` locale, so switching re-renders without a reload.
 */
import { ISSUE_MESSAGES, LOCALES, MESSAGES, type Locale } from './messages';

const STORAGE_KEY = 'krimimap.locale';

let locale = $state<Locale>('de');
let initialised = false;

function isLocale(value: string | null): value is Locale {
	return value !== null && (LOCALES as readonly string[]).includes(value);
}

export function initLocale(): void {
	if (initialised || typeof window === 'undefined') return;
	initialised = true;

	let stored: string | null = null;
	try {
		stored = localStorage.getItem(STORAGE_KEY);
	} catch {
		// storage disabled — stay on the default
	}
	if (isLocale(stored)) {
		locale = stored;
	}
}

export function currentLocale(): Locale {
	return locale;
}

export function setLocale(next: Locale): void {
	locale = next;
	try {
		localStorage.setItem(STORAGE_KEY, next);
	} catch {
		/* ignore */
	}
	if (typeof document !== 'undefined') {
		document.documentElement.lang = next;
	}
}

/** Fill `{name}` placeholders; unknown placeholders are left untouched. */
export function format(template: string, params?: Record<string, string | number>): string {
	if (!params) return template;
	return template.replace(/\{(\w+)\}/g, (match, key: string) =>
		key in params ? String(params[key]) : match
	);
}

/** Translate a UI key. Missing keys are visible in the UI instead of silent. */
export function t(key: string, params?: Record<string, string | number>): string {
	const table = MESSAGES[locale];
	const template = table[key] ?? MESSAGES.de[key];
	if (!template) return key;
	return format(template, params);
}

/** Translate a validation issue (falls back to the domain's own message). */
export function tIssue(
	code: string | undefined,
	fallback: string,
	params?: Record<string, string | number>
): string {
	if (!code) return fallback;
	const template = ISSUE_MESSAGES[locale][code] ?? ISSUE_MESSAGES.de[code];
	return template ? format(template, params) : fallback;
}

/** Locale-aware date formatting for the case list. */
export function formatDateTime(iso: string): string {
	const timestamp = Date.parse(iso);
	if (Number.isNaN(timestamp)) return iso;
	return new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : 'de-DE', {
		day: '2-digit',
		month: '2-digit',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit'
	}).format(timestamp);
}

/** Locale-aware number for percentages and coordinates. */
export function formatNumber(value: number, digits = 0): string {
	return value.toLocaleString(locale === 'en' ? 'en-GB' : 'de-DE', {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	});
}
