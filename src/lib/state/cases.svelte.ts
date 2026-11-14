/**
 * Case store: the single place the UI reads cases from and writes them to.
 *
 * Autosave is deliberate — a creator should never have to press "save" while
 * thinking about a case. Saves are debounced, the state is visible in the UI, and
 * a failed save keeps the document dirty instead of pretending it worked.
 */
import { createEmptyCase, caseErrors, type CaseDocument } from '#lib/domain/case-document';
import {
	addEntity,
	moveEntity,
	removeEntity,
	renameCase,
	updateEntity,
	updateCaseMeta as updateMeta,
	updateCaseChallenge as updateChallenge,
	type NewEntityInput
} from '#lib/domain/case-commands';
import {
	deleteCase as deleteStoredCase,
	listCases,
	loadCase,
	saveCase,
	type CaseSummary
} from '#lib/storage/db';
import { downloadCase, parseCaseJson, readCaseFile, withFreshIdentity } from '#lib/storage/json';
import {
	canRedo as canRedoHistory,
	canUndo as canUndoHistory,
	createHistory,
	push as pushHistory,
	redo as redoHistory,
	undo as undoHistory,
	type History
} from '#lib/domain/history';

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const LAST_CASE_KEY = 'krimimap.last-case';
const SAVE_DELAY_MS = 400;

let cases = $state<CaseSummary[]>([]);
let current = $state<CaseDocument | null>(null);
let selectedId = $state<string | null>(null);
let history = $state<History<CaseDocument> | null>(null);
let saveState = $state<SaveState>('idle');
let error = $state<string | null>(null);
let loading = $state(false);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function rememberLastCase(id: string | null): void {
	try {
		if (id) localStorage.setItem(LAST_CASE_KEY, id);
		else localStorage.removeItem(LAST_CASE_KEY);
	} catch {
		/* storage disabled — the app still works, it just forgets */
	}
}

export function lastCaseId(): string | null {
	try {
		return localStorage.getItem(LAST_CASE_KEY);
	} catch {
		return null;
	}
}

async function refreshList(): Promise<void> {
	try {
		cases = await listCases();
	} catch (cause) {
		error = cause instanceof Error ? cause.message : String(cause);
	}
}

async function persist(document: CaseDocument): Promise<void> {
	if (saveTimer) {
		clearTimeout(saveTimer);
		saveTimer = null;
	}
	saveState = 'saving';
	try {
		// `$state` objects are proxies: structured clone (and therefore IndexedDB)
		// refuses them. A snapshot is a plain deep copy.
		await saveCase($state.snapshot(document) as CaseDocument);
		// Keep the in-memory object (and with it the history entry) instead of
		// swapping in the stored copy: only `updatedAt` differs, and replacing it
		// would silently desynchronise undo/redo from what the user sees.
		current = document;
		saveState = 'saved';
		error = null;
		await refreshList();
	} catch (cause) {
		saveState = 'error';
		error = cause instanceof Error ? cause.message : String(cause);
	}
}

function scheduleSave(): void {
	if (!current) return;
	saveState = 'dirty';
	if (saveTimer) clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		saveTimer = null;
		if (current) void persist(current);
	}, SAVE_DELAY_MS);
}

/** Apply a domain command, remember the previous state and queue the save. */
function apply(mutator: (document: CaseDocument) => CaseDocument): void {
	if (!current) return;
	// Defensive: a document without history would silently drop the edit.
	history ??= createHistory(current);
	const next = mutator(current);
	if (next === current) return;
	history = pushHistory(history, next);
	current = next;
	scheduleSave();
}

/** Replace the current document from the history and persist it. */
function adoptFromHistory(next: History<CaseDocument>): void {
	if (next === history) return;
	history = next;
	current = next.present;
	scheduleSave();
}

export function undoCaseEdit(): void {
	if (history) adoptFromHistory(undoHistory(history));
}

export function redoCaseEdit(): void {
	if (history) adoptFromHistory(redoHistory(history));
}

export function caseStore() {
	return {
		get cases() {
			return cases;
		},
		get current() {
			return current;
		},
		get selectedId() {
			return selectedId;
		},
		get saveState() {
			return saveState;
		},
		get error() {
			return error;
		},
		get loading() {
			return loading;
		},
		get issues() {
			return current ? caseErrors(current) : [];
		},
		get selected() {
			return current?.entities.find((entity) => entity.id === selectedId) ?? null;
		},
		get canUndo() {
			return history ? canUndoHistory(history) : false;
		},
		get canRedo() {
			return history ? canRedoHistory(history) : false;
		}
	};
}

export async function loadCases(): Promise<void> {
	await refreshList();
}

export async function openCase(id: string): Promise<CaseDocument | null> {
	loading = true;
	error = null;
	try {
		const loaded = await loadCase(id);
		if (!loaded) {
			error = 'Diesen Fall gibt es nicht (mehr).';
			current = null;
			return null;
		}
		current = loaded;
		history = createHistory(loaded);
		selectedId = null;
		saveState = 'saved';
		rememberLastCase(loaded.id);
		return loaded;
	} catch (cause) {
		error = cause instanceof Error ? cause.message : String(cause);
		return null;
	} finally {
		loading = false;
	}
}

/** Create a case and make it current; returns it so the caller can navigate. */
export async function createCase(title?: string): Promise<CaseDocument | null> {
	const document = createEmptyCase({ title });
	try {
		const stored = await saveCase(document);
		await refreshList();
		current = stored;
		history = createHistory(stored);
		selectedId = null;
		saveState = 'saved';
		rememberLastCase(stored.id);
		return stored;
	} catch (cause) {
		error = cause instanceof Error ? cause.message : String(cause);
		return null;
	}
}

export function closeCase(): void {
	current = null;
	history = null;
	selectedId = null;
	saveState = 'idle';
	rememberLastCase(null);
}

export function selectEntity(id: string | null): void {
	selectedId = id;
}

export function addCaseEntity(input: NewEntityInput): string | null {
	const before = current?.entities.length ?? 0;
	apply((document) => addEntity(document, input));
	const added = current?.entities[before]?.id ?? null;
	selectedId = added;
	return added;
}

export function addEntityAtCenter(
	kind: NewEntityInput['kind'],
	position: { x: number; y: number }
): string | null {
	return addCaseEntity({ kind, position });
}

export function moveCaseEntity(id: string, position: { x: number; y: number }): void {
	apply((document) => moveEntity(document, id, position));
}

export function updateCaseEntity(id: string, patch: Parameters<typeof updateEntity>[2]): void {
	apply((document) => updateEntity(document, id, patch));
}

export function updateCaseChallenge(patch: Parameters<typeof updateChallenge>[1]): void {
	apply((document) => updateChallenge(document, patch));
}

export function updateCaseSummary(summary: string): void {
	apply((document) => updateMeta(document, { summary }));
}

export function deleteCaseEntity(id: string): void {
	apply((document) => removeEntity(document, id));
	if (selectedId === id) selectedId = null;
}

export function renameCurrentCase(title: string): void {
	apply((document) => renameCase(document, title));
}

export async function removeCase(id: string): Promise<void> {
	try {
		await deleteStoredCase(id);
		if (current?.id === id) closeCase();
		await refreshList();
	} catch (cause) {
		error = cause instanceof Error ? cause.message : String(cause);
	}
}

export function exportCurrentCase(): void {
	if (!current) return;
	downloadCase(current);
}

/**
 * Import a picked file: parse, validate, give it a fresh identity if the id is
 * taken, then store and open it.
 */
export async function importCaseFile(file: File): Promise<CaseDocument | null> {
	error = null;
	try {
		const text = await readCaseFile(file);
		const parsed = parseCaseJson(text);
		if (!parsed.ok) {
			error = parsed.issues.map((issue) => `${issue.path || 'Datei'}: ${issue.message}`).join('\n');
			return null;
		}

		const document = withFreshIdentity(
			parsed.document,
			cases.map((entry) => entry.id)
		);
		const stored = await saveCase(document);
		await refreshList();
		current = stored;
		history = createHistory(stored);
		selectedId = null;
		saveState = 'saved';
		rememberLastCase(stored.id);
		return stored;
	} catch (cause) {
		error = cause instanceof Error ? cause.message : String(cause);
		return null;
	}
}

/** Flush a pending debounce — used when the tab is hidden or unmounted. */
export async function flushCaseSave(): Promise<void> {
	if (!current) return;
	if (saveTimer) return persist(current);
	if (saveState === 'dirty') await persist(current);
}

export function clearError(): void {
	error = null;
}
