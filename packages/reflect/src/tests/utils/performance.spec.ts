import { describe, expect, it } from 'vitest';

import { defaultOf } from '@/functions/utils/defaultOf';
import { nameOf } from '@/functions/utils/nameOf';
import { typeOf } from '@/functions/utils/typeOf';

/**
 * Performance suite.
 *
 * Two of these utilities are resolved by the transformer, so what a consumer
 * pays at runtime is not what the source looks like. The assertions therefore
 * separate the two costs deliberately: what survives into the emitted code, and
 * what the runtime fallback costs when the transformer is not in the build.
 *
 * This suite runs *with* the transformer, since the harness applies it — which
 * is exactly the shape a consumer who wired it up will see.
 */

/** How many calls the wall clock ceilings make. */
const CALLS = 100_000;

/** Shape with enough structure for `typeOf` to have work to do. */
class Admin {
	email = 'a@b.c';
	roles = ['admin'];
}

/**
 * Times a loop of calls.
 *
 * Returned rather than asserted on directly: absolute budgets are what make a
 * performance suite fail on a loaded runner having found nothing, and every
 * timing assertion below is therefore a comparison against a baseline measured
 * on the same machine, in the same run.
 *
 * @param work Work to repeat.
 * @returns How long the loop took, with a floor so a ratio never divides by
 * something indistinguishable from zero.
 */
const timed = (work: () => void): number => {
	const started: number = performance.now();

	for (let call = 0; call < CALLS; call++) work();

	return Math.max(performance.now() - started, 1);
};

describe('what the transformer leaves behind', () => {
	it('should reduce defaultOf to a literal, costing what a literal costs', () => {
		// Resolved at compile time, so the loop below calls no function of this
		// library at all — it allocates an object literal, and the baseline is
		// that same literal written by hand.
		const resolved: number = timed(() => {
			const value: { id: number; name: string } = defaultOf<{
				id: number;
				name: string;
			}>();

			if (value.id !== 0) throw new Error('not a literal');
		});

		const baseline: number = timed(() => {
			const value = { id: 0, name: '' };

			if (value.id !== 0) throw new Error('not a literal');
		});

		// Anything beyond a small multiple means a function is being called
		// where a literal should be, which is to say the transformer did not run.
		expect(resolved).toBeLessThan(baseline * 10);
	});

	it('should reduce a resolvable nameOf to a string', () => {
		const user = { email: 'a@b.c' };

		const resolved: number = timed(() => {
			if (nameOf(() => user.email) !== 'email') throw new Error('not resolved');
		});

		const baseline: number = timed(() => {
			if ('email' !== 'email') throw new Error('impossible');
		});

		// Parsing the closure's source a hundred thousand times would be orders
		// of magnitude past this, not a small multiple of it.
		expect(resolved).toBeLessThan(baseline * 25);
	});
});

describe('typeOf', () => {
	it('should inspect a value without walking anything unbounded', () => {
		// The prototype chain is the only thing traversed, and it is short.
		const instance = new Admin();

		const inspecting: number = timed(() => {
			typeOf(instance);
		});

		const baseline: number = timed(() => {
			Object.getPrototypeOf(instance);
		});

		// The prototype chain is the only thing walked, and it is three deep.
		expect(inspecting).toBeLessThan(baseline * 60);
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

describe('nameOf fallback', () => {
	it('should name a class from the value it carries', () => {
		// The form that needs no parsing, and therefore no transformer, to be
		// cheap: the name is already on the constructor, and the baseline is
		// reading it directly.
		const resolved: number = timed(() => {
			if (nameOf(Admin) !== 'Admin') throw new Error('not named');
		});

		const baseline: number = timed(() => {
			if (Admin.name !== 'Admin') throw new Error('impossible');
		});

		expect(resolved).toBeLessThan(baseline * 25);
	});

	it('should not evaluate the accessor it is given', () => {
		// The name comes from the source of the closure, so the work behind it
		// never runs — which matters when the property is expensive or throws.
		let evaluated = 0;

		const source = {
			get value(): number {
				evaluated++;
				return 1;
			},
		};

		nameOf(() => source.value);

		expect(evaluated).toBe(0);
	});
});
