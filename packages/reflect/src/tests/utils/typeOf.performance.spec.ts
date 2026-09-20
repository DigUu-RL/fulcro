import { describe, expect, it } from 'vitest';

import { typeOf } from '@/functions/utils/typeOf';

/**
 * Performance suite for `typeOf`.
 *
 * The runtime form inspects a value, so the property worth pinning down is that
 * its cost is about the value's shape and never about what is inside it.
 */

describe('typeOf', () => {
	it.each([
		['a small object', { a: 1 }],
		[
			'an object with five thousand keys',
			Object.fromEntries([...Array(5_000).keys()].map((key) => [key, key])),
		],
		['an array of a hundred thousand', [...Array(100_000).keys()]],
	])('should touch %s a fixed number of times', (_label, value) => {
		// Counted, not timed. This used to compare `typeOf` against a bare
		// `Object.getPrototypeOf` and demand it stay within sixty times an
		// intrinsic that is very nearly free — a ratio bounded by no constant,
		// which duly failed on one runner out of four while the code was fine.
		//
		// A Proxy answers the real question directly: inspection reads the value
		// three times whatever is inside it, so its cost cannot grow with the
		// data.
		let reads = 0;

		const watched = new Proxy(value, {
			get(target, key, receiver) {
				reads++;
				return Reflect.get(target, key, receiver);
			},
			ownKeys(target) {
				// Enumerating the keys would make the cost grow with the value,
				// which is the thing being ruled out. Counted heavily so it cannot
				// hide among the handful of legitimate reads.
				reads += 1_000;
				return Reflect.ownKeys(target);
			},
		});

		typeOf(watched);

		expect(reads).toBeLessThanOrEqual(5);
	});

	it('should not read the contents of what it inspects', () => {
		// A large array must cost no more to describe than a small one: the
		// answer is about the value's shape, never its elements.
		const small = [1];
		const large = [...Array(500_000).keys()];

		const smallStart: number = performance.now();

		for (let call = 0; call < 10_000; call++) typeOf(small);

		const smallCost: number = performance.now() - smallStart;

		const largeStart: number = performance.now();

		for (let call = 0; call < 10_000; call++) typeOf(large);

		const largeCost: number = performance.now() - largeStart;

		expect(typeOf(large).typeId).toBe('array');
		expect(largeCost).toBeLessThan(Math.max(smallCost, 1) * 10);
	});

	it('should not be defeated by a property that throws', () => {
		// Inspection must not evaluate accessors, which is both a correctness and
		// a cost guarantee: an expensive getter is never triggered by describing
		// the object that carries it.
		let reads = 0;

		const watched = {
			get expensive(): number {
				reads++;
				return 1;
			},
		};

		typeOf(watched);

		expect(reads).toBe(0);
	});
});
