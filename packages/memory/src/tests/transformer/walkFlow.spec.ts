import { describe, expect, it } from 'vitest';

import { walkFlow } from '@/transformer/flow';

import { parse, recordingRules } from './recordingRules';

/**
 * Behaviour suite for `walkFlow`, the walk the ownership rules are carried
 * on.
 *
 * Driven by rules that only record: `spend(x)` spends `x`, and each read says
 * whether `x` was spent on some path reaching it. What is asserted is the
 * order the walk meets the code in and which paths reach each read.
 */

/**
 * Walks a source with the recording rules.
 *
 * @param text The source.
 * @returns The reads of `x`, in the order met.
 */
const readsOfX = (text: string): string[] => {
	const { rules, recording } = recordingRules();

	walkFlow(parse(text), rules);

	return recording.events.filter((event) => event.startsWith('read x'));
};

describe('walkFlow', () => {
	it('should meet a call after its arguments, and a binding after its value', () => {
		const { rules, recording } = recordingRules();

		walkFlow(parse('const y = f(a, g(b));'), rules);

		expect(recording.events).toEqual([
			'read f',
			'read a',
			'read g',
			'read b',
			'call g',
			'call f',
			'bind y',
		]);
	});

	it('should carry a fact to the code after it, and not before', () => {
		expect(readsOfX('x; spend(x); x;')).toEqual([
			'read x',
			'read x',
			'read x (spent)',
		]);
	});

	it('should join both branches of an if', () => {
		expect(readsOfX('if (c) spend(x); x;')).toEqual([
			'read x',
			'read x (spent)',
		]);
	});

	it('should keep each branch apart from the other', () => {
		expect(readsOfX('if (c) { spend(x); } else { x; }')).toEqual([
			'read x',
			'read x',
		]);
	});

	it('should join the arms of a conditional, and the right side of && and ??', () => {
		expect(readsOfX('c ? spend(x) : 0; x;').at(-1)).toBe('read x (spent)');
		expect(readsOfX('c && spend(x); x;').at(-1)).toBe('read x (spent)');
		expect(readsOfX('c ?? spend(x); x;').at(-1)).toBe('read x (spent)');
	});

	it('should put nothing after return, throw, break or continue on a path', () => {
		expect(readsOfX('function f() { spend(x); return; x; }')).toEqual([
			'read x',
		]);
		expect(readsOfX('if (c) { spend(x); throw e; } x;')).toEqual([
			'read x',
			'read x',
		]);
	});

	it('should carry the end of one iteration to the start of the next', () => {
		expect(readsOfX('while (c) { x; spend(x); }')).toEqual([
			'read x',
			'read x',
			'read x (spent)',
			'read x (spent)',
		]);
	});

	it('should leave a loop through its breaks and its condition', () => {
		expect(readsOfX('while (c) { spend(x); break; } x;').at(-1)).toBe(
			'read x (spent)',
		);
		expect(readsOfX('for (;;) { if (c) continue; spend(x); } x;').at(-1)).toBe(
			'read x (spent)',
		);
	});

	it('should give a for…of variable a new value on every iteration', () => {
		const { rules, recording } = recordingRules();

		walkFlow(parse('for (const x of xs) { x; spend(x); }'), rules);

		expect(recording.events.filter((event) => event.includes('x'))).toEqual([
			'read xs',
			'bind x',
			'read x',
			'read x',
			'bind x',
			'read x',
			'read x',
		]);
	});

	it('should fall through switch cases, and start a catch from both ends of its try', () => {
		expect(readsOfX('switch (c) { case 0: spend(x); case 1: x; }').at(-1)).toBe(
			'read x (spent)',
		);
		expect(readsOfX('try { spend(x); } catch { x; }').at(-1)).toBe(
			'read x (spent)',
		);
	});

	it('should walk a function created here on its own, from the initial facts', () => {
		const { rules, recording } = recordingRules();

		walkFlow(parse('spend(x); const f = () => x;'), rules);

		expect(recording.events).toEqual([
			'read spend',
			'read x',
			'call spend',
			'capture',
			'bind f',
			'read x',
		]);
	});

	it('should not read a property name, a declared name or a type', () => {
		const { rules, recording } = recordingRules();

		walkFlow(parse('const a: T = o.x as U; let b; b = { y: a };'), rules);

		expect(recording.events).toEqual([
			'read o',
			'bind a',
			'bind b',
			'read a',
			'bind b',
		]);
	});
});
