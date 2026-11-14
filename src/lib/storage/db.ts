/**
 * IndexedDB repository for case documents.
 *
 * Plain IndexedDB behind small promise wrappers: the storage layer is a few
 * hundred lines and adding a wrapper library for that is not worth a dependency.
 *
 * Rules:
 * - Only validated documents are written (`saveCase` refuses errors).
 * - `updatedAt` is owned by this layer, so "last edited" is trustworthy even if
 *   a UI forgets to touch it.
 * - User cases live in their own store: clearing a model cache (Phase 5) must
 *   never be able to delete a case.
 */
import { assertValidCase, migrateCase, type CaseDocument } from '#lib/domain/case-document';

const DB_NAME = 'krimimap';
const DB_VERSION = 1;
export const CASES_STORE = 'cases';

export class StorageError extends Error {
	constructor(
		message: string,
		readonly cause?: unknown
	) {
		super(message);
		this.name = 'StorageError';
	}
}

/** Summary used by the case list — no need to hold whole documents there. */
export interface CaseSummary {
	id: string;
	title: string;
	summary: string;
	language: CaseDocument['language'];
	updatedAt: string;
	entityCount: number;
}

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
	if (databasePromise) return databasePromise;

	databasePromise = new Promise((resolve, reject) => {
		if (typeof indexedDB === 'undefined') {
			reject(new StorageError('IndexedDB ist in diesem Browser nicht verfügbar'));
			return;
		}

		const request = indexedDB.open(DB_NAME, DB_VERSION);

		request.onupgradeneeded = () => {
			const db = request.result;
			if (!db.objectStoreNames.contains(CASES_STORE)) {
				const store = db.createObjectStore(CASES_STORE, { keyPath: 'id' });
				store.createIndex('updatedAt', 'updatedAt');
			}
		};
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(new StorageError('Datenbank konnte nicht geöffnet werden', request.error));
	});

	return databasePromise;
}

/** Test hook: forget the cached connection (and the database, if asked). */
export async function resetStorage(options: { deleteDatabase?: boolean } = {}): Promise<void> {
	if (databasePromise) {
		const db = await databasePromise.catch(() => null);
		db?.close();
	}
	databasePromise = null;
	if (!options.deleteDatabase) return;

	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.deleteDatabase(DB_NAME);
		request.onsuccess = () => resolve();
		request.onerror = () =>
			reject(new StorageError('Datenbank konnte nicht gelöscht werden', request.error));
		request.onblocked = () => resolve();
	});
}

function promisify<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () =>
			reject(new StorageError('Datenbankzugriff fehlgeschlagen', request.error));
	});
}

function toSummary(document: CaseDocument): CaseSummary {
	return {
		id: document.id,
		title: document.title,
		summary: document.summary,
		language: document.language,
		updatedAt: document.updatedAt,
		entityCount: document.entities.length
	};
}

async function persistDocuments(documents: CaseDocument[]): Promise<void> {
	if (documents.length === 0) return;
	const db = await openDatabase();
	const transaction = db.transaction(CASES_STORE, 'readwrite');
	const store = transaction.objectStore(CASES_STORE);
	for (const document of documents) {
		store.put(JSON.parse(JSON.stringify(document)) as CaseDocument);
	}
	await new Promise<void>((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onerror = () =>
			reject(new StorageError('Migration konnte nicht gespeichert werden', transaction.error));
		transaction.onabort = () =>
			reject(new StorageError('Migration wurde abgebrochen', transaction.error));
	});
}

function migrateStoredDocuments(rawDocuments: CaseDocument[]): {
	documents: CaseDocument[];
	upgraded: CaseDocument[];
} {
	const documents = rawDocuments.map((raw) => {
		const migrated = migrateCase(raw);
		assertValidCase(migrated);
		return migrated;
	});
	return {
		documents,
		upgraded: documents.filter((document, index) => {
			return rawDocuments[index].schemaVersion !== document.schemaVersion;
		})
	};
}

export async function listCaseDocuments(): Promise<CaseDocument[]> {
	try {
		const db = await openDatabase();
		const transaction = db.transaction(CASES_STORE, 'readonly');
		const rawDocuments = await promisify(
			transaction.objectStore(CASES_STORE).getAll() as IDBRequest<CaseDocument[]>
		);
		const { documents, upgraded } = migrateStoredDocuments(rawDocuments);
		await persistDocuments(upgraded);
		return documents;
	} catch (cause) {
		if (cause instanceof StorageError) throw cause;
		throw new StorageError('Fälle konnten nicht geladen werden', cause);
	}
}

export async function listCases(): Promise<CaseSummary[]> {
	return (await listCaseDocuments())
		.map(toSummary)
		.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function loadCase(id: string): Promise<CaseDocument | null> {
	try {
		const db = await openDatabase();
		const transaction = db.transaction(CASES_STORE, 'readonly');
		const raw = await promisify(
			transaction.objectStore(CASES_STORE).get(id) as IDBRequest<CaseDocument | undefined>
		);
		if (!raw) return null;
		const document = migrateCase(raw);
		assertValidCase(document);
		if (raw.schemaVersion !== document.schemaVersion) await persistDocuments([document]);
		return document;
	} catch (cause) {
		if (cause instanceof StorageError) throw cause;
		throw new StorageError('Fall konnte nicht geladen werden', cause);
	}
}

/**
 * Write a case. Validation happens here, not only in the UI: an invalid document
 * on disk is worse than a rejected save.
 */
export async function saveCase(
	document: CaseDocument,
	now: Date = new Date()
): Promise<CaseDocument> {
	const stored: CaseDocument = { ...document, updatedAt: now.toISOString() };
	assertValidCase(stored);

	// The store may hand over reactive proxies, which structured clone rejects.
	// A case is pure JSON by definition, so this round trip is lossless and makes
	// the write independent of whatever object the UI passed in.
	const plain = JSON.parse(JSON.stringify(stored)) as CaseDocument;

	try {
		const db = await openDatabase();
		const transaction = db.transaction(CASES_STORE, 'readwrite');
		await promisify(transaction.objectStore(CASES_STORE).put(plain));
		await new Promise<void>((resolve, reject) => {
			transaction.oncomplete = () => resolve();
			transaction.onerror = () =>
				reject(new StorageError('Speichern fehlgeschlagen', transaction.error));
			transaction.onabort = () =>
				reject(new StorageError('Speichern abgebrochen', transaction.error));
		});
		return stored;
	} catch (cause) {
		if (cause instanceof StorageError) throw cause;
		throw new StorageError('Fall konnte nicht gespeichert werden', cause);
	}
}

export async function deleteCase(id: string): Promise<void> {
	try {
		const db = await openDatabase();
		const transaction = db.transaction(CASES_STORE, 'readwrite');
		await promisify(transaction.objectStore(CASES_STORE).delete(id));
	} catch (cause) {
		if (cause instanceof StorageError) throw cause;
		throw new StorageError('Fall konnte nicht gelöscht werden', cause);
	}
}

/** Rough storage usage, for the case list footer. */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
	if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
	const estimate = await navigator.storage.estimate();
	return { usage: estimate.usage ?? 0, quota: estimate.quota ?? 0 };
}
