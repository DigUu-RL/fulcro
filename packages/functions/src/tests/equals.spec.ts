import { describe, expect, it } from 'vitest';

import { equals } from '@/src/equals';
import { none, some } from '@/src/option';
import { failure, success } from '@/src/result';

/**
 * Behaviour suite for `equals`, the variant with no rules.
 *
 * Values are often typed `unknown` here: what is under test is the answer for
 * two values a caller already holds, not which pairs the signature lets
 * through — that is the compile-time suite's, in `createEquals.spec.ts`.
 */

/**
 * A class keeping its state where no comparison can read it, as `Decimal`
 * does.
 */
class Sealed {
	readonly #value: number;

	constructor(value: number) {
		this.#value = value;
	}

	get value(): number {
		return this.#value;
	}
}

describe('equals', () => {
	describe('on primitives', () => {
		it.each([
			['the same number', 1, 1, true],
			['two numbers', 1, 2, false],
			['NaN and NaN', Number.NaN, Number.NaN, true],
			['0 and -0', 0, -0, true],
			['a number and its bigint', 1, 1n, false],
			['two equal bigints', 10n ** 30n, 10n ** 30n, true],
			['two equal strings', 'fulcro', 'fulcro', true],
			['a string and a number', '1', 1, false],
			['null and undefined', null, undefined, false],
			['undefined and undefined', undefined, undefined, true],
			['true and false', true, false, false],
		] as const)('should compare %s', (_label, left, right, expected) => {
			expect(equals<unknown>(left, right)).toBe(expected);
		});

		it('should compare a symbol only with itself', () => {
			// Typed `symbol`, not the `unique symbol` a constant would infer, which
			// no other symbol could ever be compared with.
			const key: symbol = Symbol('key');

			expect(equals(key, key)).toBe(true);
			expect(equals(key, Symbol('key'))).toBe(false);
		});

		it('should compare a function only with itself', () => {
			const run = (): number => 1;

			expect(equals(run, run)).toBe(true);
			expect(equals<() => number>(run, () => 1)).toBe(false);
		});
	});

	describe('on plain objects', () => {
		it('should compare by contents, in any order of keys', () => {
			expect(equals({ id: 1, name: 'ada' }, { name: 'ada', id: 1 })).toBe(true);
		});

		it('should compare nested values by contents', () => {
			const left = { id: 1, tags: ['a', 'b'], owner: { name: 'ada' } };
			const right = { id: 1, tags: ['a', 'b'], owner: { name: 'ada' } };

			expect(equals(left, right)).toBe(true);
			expect(equals(left, { ...right, owner: { name: 'grace' } })).toBe(false);
		});

		it('should refuse a key the other does not have, even holding undefined', () => {
			const left: Record<string, unknown> = { id: 1, note: undefined };
			const right: Record<string, unknown> = { id: 1, other: undefined };

			expect(equals(left, right)).toBe(false);
			expect(equals<Record<string, unknown>>(left, { id: 1 })).toBe(false);
		});

		it('should compare symbol keys', () => {
			const key = Symbol('key');

			expect(equals({ [key]: 1 }, { [key]: 1 })).toBe(true);
			expect(equals({ [key]: 1 }, { [key]: 2 })).toBe(false);
		});

		it('should leave non-enumerable properties out', () => {
			const right = Object.defineProperty({ id: 1 }, 'hidden', { value: 2, enumerable: false });

			expect(equals({ id: 1 }, right)).toBe(true);
		});

		it('should compare two objects without a prototype', () => {
			const left: object = Object.assign(Object.create(null) as object, { id: 1 });
			const right: object = Object.assign(Object.create(null) as object, { id: 1 });

			expect(equals(left, right)).toBe(true);
		});

		it('should refuse an object without a prototype against a plain one', () => {
			const bare: object = Object.assign(Object.create(null) as object, { id: 1 });

			expect(equals<object>(bare, { id: 1 })).toBe(false);
		});
	});

	describe('on arrays', () => {
		it('should compare element by element', () => {
			expect(equals([1, 2, 3], [1, 2, 3])).toBe(true);
			expect(equals([1, 2, 3], [1, 3, 2])).toBe(false);
			expect(equals([1, 2], [1, 2, 3])).toBe(false);
		});

		it('should read a hole as undefined', () => {
			// Assigned past the end rather than written as a literal, which is how a
			// hole usually comes to be.
			const holed: unknown[] = [];

			holed[1] = 1;

			expect(0 in holed).toBe(false);
			expect(equals(holed, [undefined, 1])).toBe(true);
		});

		it('should refuse an array against an object with its indexes', () => {
			expect(equals<unknown>([1], { 0: 1, length: 1 })).toBe(false);
		});
	});

	describe('on Result and Option', () => {
		it('should compare the variant and its fields', () => {
			expect(equals(some({ id: 1 }), some({ id: 1 }))).toBe(true);
			expect(equals(some(1), some(2))).toBe(false);
			expect(equals(success([1, 2]), success([1, 2]))).toBe(true);
			expect(equals(failure('lost'), failure('lost'))).toBe(true);
		});

		it('should tell some(null) from none(), whose data is identical', () => {
			expect(equals<unknown>(some(null), none())).toBe(false);
		});

		it('should refuse a variant against a plain object with its fields', () => {
			expect(equals<unknown>(some(1), { value: 1 })).toBe(false);
		});

		it('should compare an error by identity, as any instance of a class', () => {
			const lost = new Error('lost');

			expect(equals(failure(lost), failure(lost))).toBe(true);
			expect(equals(failure(lost), failure(new Error('lost')))).toBe(false);
		});
	});

	describe('on objects with an identity', () => {
		it('should compare an instance of a class only with itself', () => {
			const one = new Sealed(1);

			expect(equals(one, one)).toBe(true);
			// Both have no own key at all, so a comparison of keys would call
			// them equal whatever they hold.
			expect(equals(one, new Sealed(1))).toBe(false);
			expect(equals(one, new Sealed(2))).toBe(false);
		});

		it('should compare a regular expression and a promise only with themselves', () => {
			expect(equals(/a/u, /a/u)).toBe(false);
			expect(equals(Promise.resolve(1), Promise.resolve(1))).toBe(false);
		});
	});

	describe('on the built-in collections and buffers', () => {
		it('should compare dates by their time', () => {
			expect(equals(new Date(0), new Date(0))).toBe(true);
			expect(equals(new Date(0), new Date(1))).toBe(false);
			expect(equals(new Date(Number.NaN), new Date(Number.NaN))).toBe(true);
		});

		it('should compare maps by keys and by the contents of their values', () => {
			const key = { id: 1 };

			expect(
				equals(
					new Map([
						['a', [1]],
						['b', [2]],
					]),
					new Map([
						['b', [2]],
						['a', [1]],
					]),
				),
			).toBe(true);

			expect(equals(new Map([[key, 1]]), new Map([[key, 1]]))).toBe(true);
			expect(equals(new Map([['a', 1]]), new Map([['a', 2]]))).toBe(false);
			expect(equals(new Map([['a', 1]]), new Map([['b', 1]]))).toBe(false);
		});

		it('should tell a key holding undefined from a missing key', () => {
			expect(
				equals(
					new Map<string, undefined>([['a', undefined]]),
					new Map<string, undefined>([['b', undefined]]),
				),
			).toBe(false);
		});

		it('should find a key by identity, never by contents', () => {
			expect(equals(new Map([[{ id: 1 }, 1]]), new Map([[{ id: 1 }, 1]]))).toBe(false);
		});

		it('should compare sets by their elements, found by identity', () => {
			const item = { id: 1 };

			expect(equals(new Set([1, 2, 3]), new Set([3, 2, 1]))).toBe(true);
			expect(equals(new Set([item]), new Set([item]))).toBe(true);
			expect(equals(new Set([{ id: 1 }]), new Set([{ id: 1 }]))).toBe(false);
			expect(equals(new Set([1, 2]), new Set([1, 3]))).toBe(false);
		});

		it('should compare a map subclass as a map', () => {
			class Registry extends Map<string, number> {}

			const registry: Map<string, number> = new Registry([['a', 1]]);

			expect(equals(registry, new Registry([['a', 1]]))).toBe(true);
			expect(equals(registry, new Map([['a', 1]]))).toBe(false);
		});

		it('should compare buffers byte by byte', () => {
			expect(equals(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 2]).buffer)).toBe(true);
			expect(equals(new Uint8Array([1, 2]).buffer, new Uint8Array([1, 3]).buffer)).toBe(false);
		});

		it('should compare the bytes a data view observes, wherever its buffer starts', () => {
			const left = new DataView(new Uint8Array([9, 1, 2]).buffer, 1);
			const right = new DataView(new Uint8Array([1, 2, 7]).buffer, 0, 2);

			expect(equals(left, right)).toBe(true);
		});

		it('should compare typed arrays element by element, as numbers', () => {
			expect(equals(new Float64Array([1, Number.NaN]), new Float64Array([1, Number.NaN]))).toBe(
				true,
			);

			expect(equals(new Float64Array([0]), new Float64Array([-0]))).toBe(true);
			expect(equals(new BigInt64Array([1n]), new BigInt64Array([1n]))).toBe(true);
			expect(equals(new Int32Array([1, 2]), new Int32Array([1, 3]))).toBe(false);
		});

		it('should refuse typed arrays of different kinds holding the same numbers', () => {
			expect(equals<ArrayLike<number>>(new Int8Array([1]), new Uint8Array([1]))).toBe(false);
		});
	});

	describe('on structures that refer to themselves', () => {
		/** A node of a list that may close on itself. */
		interface Node {
			id: number;
			next?: Node;
		}

		/**
		 * @param length How many nodes the ring has.
		 * @returns The first node of a ring, whose last points back at it.
		 */
		const ring = (length: number): Node => {
			const first: Node = { id: 0 };
			let last: Node = first;

			for (let id = 1; id < length; id++) {
				const node: Node = { id };

				last.next = node;
				last = node;
			}

			last.next = first;

			return first;
		};

		it('should compare two objects that each refer to themselves', () => {
			const left: Node = { id: 1 };
			const right: Node = { id: 1 };

			left.next = left;
			right.next = right;

			expect(equals(left, right)).toBe(true);
		});

		it('should compare two rings of the same length', () => {
			expect(equals(ring(5), ring(5))).toBe(true);
		});

		it('should still find a difference inside a ring', () => {
			const right: Node = ring(5);
			const third: Node | undefined = right.next?.next;

			expect(third).toBeDefined();

			if (third !== undefined) third.id = 99;

			expect(equals(ring(5), right)).toBe(false);
		});

		it('should refuse a ring against a chain that does not close', () => {
			const chain: Node = { id: 0, next: { id: 1, next: { id: 0 } } };

			expect(equals(ring(2), chain)).toBe(false);
		});

		it('should compare arrays that hold themselves', () => {
			const left: unknown[] = [1];
			const right: unknown[] = [1];

			left.push(left);
			right.push(right);

			expect(equals(left, right)).toBe(true);
		});
	});

	describe('on getters', () => {
		it('should propagate what a getter throws', () => {
			const broken = {
				get value(): number {
					throw new RangeError('unreadable');
				},
			};

			expect(() => equals(broken, { value: 1 })).toThrow(RangeError);
		});
	});
});
