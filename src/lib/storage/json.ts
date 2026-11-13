/**
 * JSON import and export.
 *
 * The import path is the only place untrusted content enters the app, so it is
 * deliberately strict: a size limit before parsing, no `eval`, no merging into
 * existing objects, and validation *after* migration.
 */
import {
	CASE_SCHEMA_VERSION,
	CaseFormatError,
	caseErrors,
	looksLikeCase,
	migrateCase,
	validateCase,
	type CaseDocument,
	type CaseIssue
} from '#lib/domain/case-document';

/** 2 MiB is far beyond a hand-authored case and keeps the parser honest. */
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

export function toJson(document: CaseDocument): string {
	return `${JSON.stringify(document, null, '\t')}\n`;
}

export function exportFileName(document: CaseDocument): string {
	const slug = document.title
		.toLowerCase()
		.replace(/[äöüß]/g, (char) => ({ ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' })[char] ?? char)
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${slug || 'fall'}-${document.id}.json`;
}

export type ParseResult =
	{ ok: true; document: CaseDocument; warnings: CaseIssue[] } | { ok: false; issues: CaseIssue[] };

/** Parse untrusted JSON text into a valid case, or explain exactly why not. */
export function parseCaseJson(text: string): ParseResult {
	const bytes = new TextEncoder().encode(text).length;
	if (bytes > MAX_IMPORT_BYTES) {
		return {
			ok: false,
			issues: [
				{
					path: '',
					severity: 'error',
					message: `Datei ist ${Math.round(bytes / 1024)} KiB groß, erlaubt sind ${MAX_IMPORT_BYTES / 1024} KiB`
				}
			]
		};
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch (cause) {
		return {
			ok: false,
			issues: [
				{
					path: '',
					severity: 'error',
					message: `Kein gültiges JSON: ${cause instanceof Error ? cause.message : String(cause)}`
				}
			]
		};
	}

	if (!looksLikeCase(parsed)) {
		return {
			ok: false,
			issues: [{ path: '', severity: 'error', message: 'Das ist kein KrimiMap-Fall.' }]
		};
	}

	let document: CaseDocument;
	try {
		document = migrateCase(parsed);
	} catch (cause) {
		if (cause instanceof CaseFormatError) {
			return {
				ok: false,
				issues: cause.issues.length
					? cause.issues
					: [{ path: '', severity: 'error', message: cause.message }]
			};
		}
		return {
			ok: false,
			issues: [
				{
					path: '',
					severity: 'error',
					message: cause instanceof Error ? cause.message : String(cause)
				}
			]
		};
	}

	const issues = validateCase(document);
	const errors = issues.filter((issue) => issue.severity === 'error');
	if (errors.length > 0) return { ok: false, issues };

	return {
		ok: true,
		document,
		warnings: issues.filter((issue) => issue.severity === 'warning')
	};
}

/**
 * Imported cases keep their content but must not silently overwrite a case that
 * already exists under the same id — the caller gets a fresh id instead.
 */
export function withFreshIdentity(
	document: CaseDocument,
	takenIds: Iterable<string>,
	now: Date = new Date()
): CaseDocument {
	const ids = new Set(takenIds);
	if (!ids.has(document.id)) return document;

	const stamp = now
		.toISOString()
		.replace(/[-:.TZ]/g, '')
		.slice(0, 14);
	const noise = Math.floor(Math.random() * 0x1000)
		.toString(16)
		.padStart(3, '0');
	return {
		...document,
		id: `${stamp}-${noise}`,
		title: `${document.title} (importiert)`,
		schemaVersion: CASE_SCHEMA_VERSION,
		updatedAt: now.toISOString()
	};
}

/** Trigger a browser download for a case. No-op outside the browser. */
export function downloadCase(caseDocument: CaseDocument): void {
	if (typeof window === 'undefined') return;
	const blob = new Blob([toJson(caseDocument)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const anchor = window.document.createElement('a');
	anchor.href = url;
	anchor.download = exportFileName(caseDocument);
	anchor.click();
	URL.revokeObjectURL(url);
}

/** Read a picked file, refusing anything that is obviously too large. */
export async function readCaseFile(file: File): Promise<string> {
	if (file.size > MAX_IMPORT_BYTES) {
		throw new Error(
			`Datei ist ${Math.round(file.size / 1024)} KiB groß, erlaubt sind ${MAX_IMPORT_BYTES / 1024} KiB`
		);
	}
	return file.text();
}

/** Errors only — used by the editor to block export of a broken case. */
export function caseHasErrors(document: CaseDocument): boolean {
	return caseErrors(document).length > 0;
}
