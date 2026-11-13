import { describe, expect, it } from 'vitest';
import { canRedo, canUndo, createHistory, push, redo, reset, undo } from '#lib/domain/history';

describe('history', () => {
	it('starts empty', () => {
		const history = createHistory('a');
		expect(history.present).toBe('a');
		expect(canUndo(history)).toBe(false);
		expect(canRedo(history)).toBe(false);
	});

	it('undoes and redoes a push', () => {
		let history = createHistory('a');
		history = push(history, 'b');

		history = undo(history);
		expect(history.present).toBe('a');
		expect(canRedo(history)).toBe(true);

		history = redo(history);
		expect(history.present).toBe('b');
		expect(canRedo(history)).toBe(false);
	});

	it('ignores a push of the same reference', () => {
		const history = push(createHistory('a'), 'a');
		expect(canUndo(history)).toBe(false);
	});

	it('clears the redo branch on a new edit', () => {
		let history = push(createHistory('a'), 'b');
		history = undo(history);
		history = push(history, 'c');
		expect(canRedo(history)).toBe(false);
		expect(history.present).toBe('c');
		expect(undo(history).present).toBe('a');
	});

	it('walks several steps back and forth', () => {
		let history = createHistory(0);
		for (const value of [1, 2, 3]) history = push(history, value);

		history = undo(history);
		history = undo(history);
		expect(history.present).toBe(1);

		history = redo(history);
		expect(history.present).toBe(2);
	});

	it('drops the oldest entries beyond the limit', () => {
		let history = createHistory(0, 2);
		for (const value of [1, 2, 3]) history = push(history, value);

		expect(history.past).toEqual([1, 2]);
		history = undo(history);
		history = undo(history);
		expect(history.present).toBe(1);
		expect(canUndo(history)).toBe(false);
	});

	it('returns the same history when there is nothing to undo or redo', () => {
		const history = createHistory('a');
		expect(undo(history)).toBe(history);
		expect(redo(history)).toBe(history);
	});

	it('reset drops both stacks but keeps the limit', () => {
		let history = push(createHistory('a'), 'b');
		history = undo(history);
		const cleared = reset(history, 'z');
		expect(cleared.present).toBe('z');
		expect(canUndo(cleared)).toBe(false);
		expect(canRedo(cleared)).toBe(false);
		expect(cleared.limit).toBe(history.limit);
	});
});
