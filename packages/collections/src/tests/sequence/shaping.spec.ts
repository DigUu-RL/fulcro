import { describe, expect, it } from 'vitest';

import { SequenceCollection } from '@/collections/sequence';

/**
 * Behaviour suite for the operators that shape a sequence rather than reduce
 * it: `choose`, `ofType`, `cast`, `topBy` and `tap`.
 *
 * `ofType` and `cast` are tested as a pair, because what separates them is the
 * whole reason both exist: given an element of the wrong type, one skips it and
 * the other refuses. Either behaviour is a bug when the other was wanted, so
 * each is asserted on the same data.
 *
 * `topBy` gets the most attention here, and deliberately. It is the only one of
 * the five that promises to answer exactly what another chain answers —
 * `orderByDescending(...).take(n)` — while doing less work, and a faster
 * operator that quietly disagrees about ties is worse than no operator at all.
 * The agreement is therefore asserted against that chain directly, on data
 * built to be full of ties.
 */

/** A record, so the assertions are not all about bare numbers. */
interface Player {
	readonly name: string;
	readonly score: number;
}

/**
 * Builds players whose scores collide on purpose.
 *
 * @param count How many to build.
 * @param distinctScores How many different scores to spread them across.
 * @returns The players, in a fixed order.
 */
const playersWithTies = (
	count: number,
	distinctScores: number,
): readonly Player[] =>
	Array.from({ length: count }, (_, index) => ({
		name: `player-${index}`,
		score: index % distinctScores,
	}));

describe('choose', () => {
	it('should keep what the projection produced and drop what it did not', () => {
		const emails = SequenceCollection.from([
			{ name: 'a', email: 'a@b.c' },
			{ name: 'b', email: null },
			{ name: 'c', email: 'c@d.e' },
		]).choose((user) => user.email);

		expect(emails.toArray()).toEqual(['a@b.c', 'c@d.e']);
	});

	it('should treat falsy values as results, not as absence', () => {
		// The distinction the operator lives or dies by: `0` and `''` are
		// answers, and only `null` and `undefined` mean "nothing here".
		const kept = SequenceCollection.from([1, 2, 3, 4, 5]).choose((value) => {
			if (value === 3) return null;
			if (value === 4) return undefined;

			return value % 2 === 0 ? 0 : '';
		});

		expect(kept.toArray()).toEqual(['', 0, '']);
	});

	it('should run the projection once per element', () => {
		let calls = 0;

		SequenceCollection.from([1, 2, 3, 4])
			.choose((value) => {
				calls++;
				return value % 2 === 0 ? value : null;
			})
			.toArray();

		expect(calls).toBe(4);
	});

	it('should stay deferred until something reads it', () => {
		let calls = 0;

		SequenceCollection.from([1, 2, 3]).choose((value) => {
			calls++;
			return value;
		});

		expect(calls).toBe(0);
	});
});

describe('ofType', () => {
	it('should keep only the elements of a primitive type', () => {
		const mixed: (string | number | null)[] = ['a', 1, null, 'b', 2];

		expect(SequenceCollection.from(mixed).ofType('string').toArray()).toEqual([
			'a',
			'b',
		]);
		expect(SequenceCollection.from(mixed).ofType('number').toArray()).toEqual([
			1, 2,
		]);
	});

	it('should not accept null as an object', () => {
		// `typeof null` is `'object'`, and a sequence filtered to objects that
		// then throws on a property access would be a trap.
		const values: (object | null)[] = [{ a: 1 }, null, { b: 2 }];

		expect(SequenceCollection.from(values).ofType('object').toArray()).toEqual([
			{ a: 1 },
			{ b: 2 },
		]);
	});

	it('should keep only the instances of a class', () => {
		class Admin {
			constructor(public readonly name: string) {}
		}

		const mixed: (Admin | string)[] = [new Admin('root'), 'nobody'];
		const admins = SequenceCollection.from(mixed).ofType(Admin);

		expect(admins.toArray()).toEqual([new Admin('root')]);
	});

	it('should recognise a subclass as an instance of its base', () => {
		class Base {}
		class Derived extends Base {}

		const values: unknown[] = [new Derived(), new Base(), 'neither'];

		expect(SequenceCollection.from(values).ofType(Base).toArray()).toHaveLength(
			2,
		);
	});

	it('should narrow the element type it hands back', () => {
		const mixed: (string | number)[] = ['a', 1];

		// The point of the operator beyond filtering: no cast is written here,
		// and `toUpperCase` would not compile if the narrowing were lost.
		const shouted = SequenceCollection.from(mixed)
			.ofType('string')
			.select((value) => value.toUpperCase());

		expect(shouted.toArray()).toEqual(['A']);
	});

	it('should stay deferred until something reads it', () => {
		let pulled = 0;
		const source = {
			*[Symbol.iterator](): Iterator<unknown> {
				for (const value of ['a', 1]) {
					pulled++;
					yield value;
				}
			},
		};

		SequenceCollection.from(source).ofType('string');

		expect(pulled).toBe(0);
	});
});

describe('cast', () => {
	it('should hand back every element when they all match', () => {
		const values: unknown[] = ['a', 'b', 'c'];

		const shouted = SequenceCollection.from(values)
			.cast('string')
			.select((value) => value.toUpperCase());

		expect(shouted.toArray()).toEqual(['A', 'B', 'C']);
	});

	it('should throw on the first element of another type', () => {
		const values: unknown[] = ['a', 'b', 7, 'c'];

		expect(() =>
			SequenceCollection.from(values).cast('string').toArray(),
		).toThrow(TypeError);
	});

	it('should say what it found and where', () => {
		// The message is the feature: a sequence of a hundred thousand records
		// with one bad element is only actionable if the error points at it.
		const values: unknown[] = ['a', 'b', 7];

		expect(() =>
			SequenceCollection.from(values).cast('string').toArray(),
		).toThrow(/cast\('string'\) found a number at index 2\./);
	});

	it('should name the class of what it found', () => {
		const values: unknown[] = [new Date(), 'not a date'];

		expect(() => SequenceCollection.from(values).cast(Date).toArray()).toThrow(
			/found a string at index 1/,
		);
	});

	it('should describe null rather than calling it an object', () => {
		const values: unknown[] = [{ a: 1 }, null];

		expect(() =>
			SequenceCollection.from(values).cast('object').toArray(),
		).toThrow(/found a null at index 1/);
	});

	it('should accept instances of a class', () => {
		class Admin {
			constructor(public readonly name: string) {}
		}

		const values: unknown[] = [new Admin('root'), new Admin('other')];

		const names = SequenceCollection.from(values)
			.cast(Admin)
			.select((admin) => admin.name);

		expect(names.toArray()).toEqual(['root', 'other']);
	});

	it('should skip nothing, unlike ofType', () => {
		// The pair asserted against each other on one dataset: same input, and
		// the only difference is what happens to the element that does not fit.
		const values: unknown[] = ['a', 7, 'b'];

		expect(SequenceCollection.from(values).ofType('string').toArray()).toEqual([
			'a',
			'b',
		]);
		expect(() =>
			SequenceCollection.from(values).cast('string').toArray(),
		).toThrow(TypeError);
	});

	it('should not throw before the bad element is reached', () => {
		// Deferred, and lazily checked: a chain that stops early must never be
		// failed by an element it was never going to read.
		const values: unknown[] = ['a', 'b', 7];

		const firstTwo = SequenceCollection.from(values).cast('string').take(2);

		expect(firstTwo.toArray()).toEqual(['a', 'b']);
	});

	it('should check nothing until something reads it', () => {
		const values: unknown[] = [7];

		expect(() => SequenceCollection.from(values).cast('string')).not.toThrow();
	});

	it('should keep the cardinality of its source', () => {
		const values: unknown[] = ['a', 'b', 'c'];

		expect(SequenceCollection.from(values).cast('string').count()).toBe(3);
	});
});

describe('ofType and cast, written as a type', () => {
	/**
	 * These run with the `@fulcro/collections` transformer applied, because the
	 * harness wires it into every project — so they exercise the real path a
	 * consumer who wired it up gets, not a simulation of it.
	 */

	class Admin {
		constructor(public readonly name: string) {}
	}

	interface Account {
		readonly id: number;
	}

	it('should resolve a primitive type argument', () => {
		const mixed: unknown[] = ['a', 1, 'b'];

		// No token written anywhere: the transformer turned the type argument
		// into one. Without it this call would throw.
		const shouted = SequenceCollection.from(mixed)
			.ofType<string>()
			.select((value) => value.toUpperCase());

		expect(shouted.toArray()).toEqual(['A', 'B']);
	});

	it('should resolve a class type argument', () => {
		const mixed: unknown[] = [new Admin('root'), 'nobody'];

		const names = SequenceCollection.from(mixed)
			.ofType<Admin>()
			.select((admin) => admin.name);

		expect(names.toArray()).toEqual(['root']);
	});

	it('should resolve the same two forms through cast', () => {
		const strings: unknown[] = ['a', 'b'];
		const admins: unknown[] = [new Admin('root')];

		expect(SequenceCollection.from(strings).cast<string>().toArray()).toEqual([
			'a',
			'b',
		]);
		expect(
			SequenceCollection.from(admins)
				.cast<Admin>()
				.select((admin) => admin.name)
				.toArray(),
		).toEqual(['root']);
	});

	it('should refuse a type with no runtime form', () => {
		// An interface leaves nothing behind to test for, so the transformer has
		// no honest token to emit and leaves the call alone. What arrives at the
		// runtime is indistinguishable from a build with no plugin at all, so the
		// message has to name both.
		const values: unknown[] = [{ id: 1 }];

		expect(() => SequenceCollection.from(values).ofType<Account>()).toThrow(
			/was not resolved at compile time/,
		);
	});

	it('should say both reasons a call could have arrived unresolved', () => {
		const values: unknown[] = [{ id: 1 }];

		expect(() => SequenceCollection.from(values).cast<Account>()).toThrow(
			/transformer did not run.*or T has no runtime representation/s,
		);
	});

	it('should refuse before reading anything', () => {
		// A wiring error, not a data error: there is nothing to gain by letting
		// the chain be built and failing on the first read instead.
		let pulled = 0;
		const source = {
			*[Symbol.iterator](): Iterator<unknown> {
				pulled++;
				yield { id: 1 };
			},
		};

		expect(() => SequenceCollection.from(source).ofType<Account>()).toThrow();
		expect(pulled).toBe(0);
	});
});

describe('topBy', () => {
	it('should return the largest keys, largest first', () => {
		const players: readonly Player[] = [
			{ name: 'a', score: 10 },
			{ name: 'b', score: 50 },
			{ name: 'c', score: 30 },
			{ name: 'd', score: 40 },
		];

		const best = SequenceCollection.from(players).topBy(
			(player) => player.score,
			2,
		);

		expect(best.toArray().map((player) => player.name)).toEqual(['b', 'd']);
	});

	it.each([
		['fewer elements than asked for', 3, 10],
		['exactly as many as asked for', 10, 10],
		['far more than asked for', 1_000, 7],
		['a single element', 1, 1],
	])('should agree with a full sort when given %s', (_label, size, count) => {
		const players = playersWithTies(size, Math.max(1, Math.floor(size / 3)));

		const sorted = SequenceCollection.from(players)
			.orderByDescending((player) => player.score)
			.take(count)
			.toArray();

		const ranked = SequenceCollection.from(players)
			.topBy((player) => player.score, count)
			.toArray();

		expect(ranked).toEqual(sorted);
	});

	it('should break ties the way a stable sort does', () => {
		// Every score identical, so the answer is decided entirely by arrival
		// order. An unstable heap would return an arbitrary three of these.
		const players = playersWithTies(100, 1);

		const ranked = SequenceCollection.from(players)
			.topBy((player) => player.score, 3)
			.toArray();

		expect(ranked.map((player) => player.name)).toEqual([
			'player-0',
			'player-1',
			'player-2',
		]);
	});

	it('should extract each key exactly once', () => {
		// The reason the heap holds positions rather than elements. A key read
		// per comparison rather than per element is the classic way this kind of
		// operator gets slower than the sort it replaces.
		let extracted = 0;

		SequenceCollection.from(playersWithTies(1_000, 50))
			.topBy((player) => {
				extracted++;
				return player.score;
			}, 10)
			.toArray();

		expect(extracted).toBe(1_000);
	});

	it.each([0, -1, -100])('should return nothing for a count of %s', (count) => {
		const ranked = SequenceCollection.from(playersWithTies(10, 5)).topBy(
			(player) => player.score,
			count,
		);

		expect(ranked.toArray()).toEqual([]);
	});

	it('should handle an empty sequence', () => {
		const ranked = SequenceCollection.empty<Player>().topBy(
			(player) => player.score,
			5,
		);

		expect(ranked.toArray()).toEqual([]);
	});

	it('should sort by string keys as the rest of the library does', () => {
		const names = ['delta', 'alpha', 'charlie', 'bravo'];

		const ranked = SequenceCollection.from(names).topBy((name) => name, 2);

		expect(ranked.toArray()).toEqual(['delta', 'charlie']);
	});

	it('should stay deferred until something reads it', () => {
		let extracted = 0;

		SequenceCollection.from(playersWithTies(10, 5)).topBy((player) => {
			extracted++;
			return player.score;
		}, 3);

		expect(extracted).toBe(0);
	});

	it('should be readable twice, giving the same answer', () => {
		const ranked = SequenceCollection.from(playersWithTies(100, 10)).topBy(
			(player) => player.score,
			5,
		);

		expect(ranked.toArray()).toEqual(ranked.toArray());
	});

	it('should count without traversing when the source count is known', () => {
		const ranked = SequenceCollection.from(playersWithTies(1_000, 10)).topBy(
			(player) => player.score,
			10,
		);

		expect(ranked.count()).toBe(10);
	});

	it('should not claim more elements than the source holds', () => {
		const ranked = SequenceCollection.from(playersWithTies(4, 2)).topBy(
			(player) => player.score,
			10,
		);

		expect(ranked.count()).toBe(4);
	});
});

describe('tap', () => {
	it('should yield every element unchanged', () => {
		const seen: number[] = [];

		const values = SequenceCollection.from([1, 2, 3]).tap((value) => {
			seen.push(value);
		});

		expect(values.toArray()).toEqual([1, 2, 3]);
		expect(seen).toEqual([1, 2, 3]);
	});

	it('should hand the action the positional index', () => {
		const positions: number[] = [];

		SequenceCollection.from(['a', 'b', 'c'])
			.tap((_value, index) => {
				positions.push(index);
			})
			.toArray();

		expect(positions).toEqual([0, 1, 2]);
	});

	it('should run only for the elements actually pulled', () => {
		// Placed before a `take`, it must not observe the whole source: that
		// would turn a diagnostic into a traversal.
		const seen: number[] = [];

		SequenceCollection.from([1, 2, 3, 4, 5])
			.tap((value) => {
				seen.push(value);
			})
			.take(2)
			.toArray();

		expect(seen).toEqual([1, 2]);
	});

	it('should run nothing until something reads it', () => {
		let calls = 0;

		SequenceCollection.from([1, 2, 3]).tap(() => {
			calls++;
		});

		expect(calls).toBe(0);
	});

	it('should keep the cardinality of its source', () => {
		const values = SequenceCollection.from([1, 2, 3, 4]).tap(() => {});

		expect(values.count()).toBe(4);
	});
});
