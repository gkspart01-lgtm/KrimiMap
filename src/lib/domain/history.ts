/**
 * Bounded undo/redo history for documents.
 *
 * Framework-free and immutable: a history value in, a new one out. Keeping the
 * old documents is cheap (a case is a few kB of JSON) and avoids trying to invert
 * commands — inverting is where undo implementations usually grow bugs.
 */

export interface History<T> {
	past: T[];
	present: T;
	future: T[];
	limit: number;
}

export function createHistory<T>(present: T, limit = 50): History<T> {
	return { past: [], present, future: [], limit: Math.max(1, limit) };
}

/** Record a new state. Always clears the redo branch, as every editor does. */
export function push<T>(history: History<T>, next: T): History<T> {
	if (next === history.present) return history;
	const past = [...history.past, history.present].slice(-history.limit);
	return { past, present: next, future: [], limit: history.limit };
}

/** Replace the present without creating an undo step (e.g. after a reload). */
export function reset<T>(history: History<T>, present: T): History<T> {
	return { past: [], present, future: [], limit: history.limit };
}

export function canUndo<T>(history: History<T>): boolean {
	return history.past.length > 0;
}

export function canRedo<T>(history: History<T>): boolean {
	return history.future.length > 0;
}

export function undo<T>(history: History<T>): History<T> {
	if (history.past.length === 0) return history;
	const previous = history.past[history.past.length - 1];
	return {
		past: history.past.slice(0, -1),
		present: previous,
		future: [history.present, ...history.future].slice(0, history.limit),
		limit: history.limit
	};
}

export function redo<T>(history: History<T>): History<T> {
	if (history.future.length === 0) return history;
	const [next, ...rest] = history.future;
	return {
		past: [...history.past, history.present].slice(-history.limit),
		present: next,
		future: rest,
		limit: history.limit
	};
}
