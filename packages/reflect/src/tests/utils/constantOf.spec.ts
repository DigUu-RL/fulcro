import { describe, expect, expectTypeOf, it } from 'vitest';

import { constantOf } from '@/functions/utils/constantOf';

/**
 * Behaviour suite for `constantOf` at runtime: the fallback a consumer gets
 * with no transformer configured.
 *
 * Every call here goes through `evaluateAtRuntime`, a second name for the same
 * function. The transformer applied to this suite claims calls written as
 * `constantOf(…)` and would replace them — or, for the refusals below, fail
 * the build — so the runtime is reached through a name it does not claim.
 */
const evaluateAtRuntime: typeof constantOf = constantOf;

/**
 * The error a refusal is expected to throw, carrying the code its message
 * starts with, which `toThrow` compares as well.
 *
 * @param error The expected error, its message starting with its code.
 * @returns The same error, carrying that code.
 */
const coded = <T extends Error>(error: T): T =>
	Object.assign(error, { code: error.message.slice(0, 'FULCRO0000'.length) });

/**
 * Tells whether an object and every object inside it is frozen.
 *
 * @param value Value to inspect.
 * @returns `true` when nothing in it can be changed.
 */
const deeplyFrozen = (value: unknown): boolean =>
	typeof value !== 'object' ||
	value === null ||
	(Object.isFrozen(value) && Object.values(value).every(deeplyFrozen));

/**
 * The message of the refusal a result gets.
 *
 * @param value What the function returns.
 * @returns What the refusal says the value is.
 */
const refusalFor = (value: unknown): TypeError =>
	coded(
		new TypeError(
			`FULCRO4011: constantOf(…) produced ${String(value)}, which cannot be written as a literal. ` +
				'A constant is a number, a string, a boolean, a bigint, null or undefined, or an array or a plain object of them, each reached once.',
		),
	);

describe('constantOf', () => {
	describe('values', () => {
		it('should return what the function returns', () => {
			expect(
				evaluateAtRuntime(() => [1, 2, 3].map((value) => value * value)),
			).toEqual([1, 4, 9]);
			expect(evaluateAtRuntime(() => 42)).toBe(42);
		});

		it.each([
			['a number', 1.5],
			['NaN', Number.NaN],
			['a string', 'text'],
			['a boolean', false],
			['a bigint', 2n ** 70n],
			['null', null],
			['undefined', undefined],
		])('should accept %s', (_kind, value) => {
			expect(evaluateAtRuntime(() => value)).toBe(value);
		});

		it('should freeze arrays and plain objects at every level', () => {
			const value = evaluateAtRuntime(() => ({
				list: [1, { deep: [true] }],
				nested: { name: 'fulcro' },
			}));

			expect(deeplyFrozen(value)).toBe(true);
		});

		it('should accept an object with no prototype', () => {
			expect(
				evaluateAtRuntime(() => Object.assign(Object.create(null), { a: 1 })),
			).toEqual({
				a: 1,
			});
		});

		it('should infer the type of the value', () => {
			expectTypeOf(evaluateAtRuntime(() => [1, 2])).toEqualTypeOf<number[]>();
			expectTypeOf(evaluateAtRuntime(() => ({ a: 'b' }))).toEqualTypeOf<{
				a: string;
			}>();
		});
	});

	describe('refusals', () => {
		it('should refuse what is not a function', () => {
			expect(() => evaluateAtRuntime(3 as never)).toThrow(
				coded(
					new TypeError(
						'FULCRO4014: constantOf: expected a function, received number.',
					),
				),
			);
		});

		it.each([
			['a function', () => (): number => 1],
			['a symbol', () => Symbol('refused')],
			['an instance of Map', () => new Map()],
			['an instance of Date', () => new Date(0)],
			['an array with holes', () => [1, , 3]],
			[
				'an array with properties besides its elements',
				() => Object.assign([1], { extra: 2 }),
			],
			['an object with symbol keys', () => ({ [Symbol('key')]: 1 })],
			[
				"an object whose 'value' is a getter",
				() => ({
					get value(): number {
						return 1;
					},
				}),
			],
		])('should refuse %s', (description, compute) => {
			expect(() => evaluateAtRuntime(compute as never)).toThrow(
				refusalFor(description),
			);
		});

		it('should refuse a value nested deep inside', () => {
			expect(() =>
				evaluateAtRuntime(() => ({ list: [1, [new Set()]] }) as never),
			).toThrow(refusalFor('an instance of Set'));
		});

		it('should refuse an object reached twice, which a literal would copy', () => {
			const shared: number[] = [1];

			expect(() => evaluateAtRuntime(() => [shared, shared])).toThrow(
				refusalFor('an object reached twice'),
			);
		});

		it('should refuse a cycle', () => {
			const cycle: { self?: unknown } = {};

			cycle.self = cycle;

			expect(() => evaluateAtRuntime(() => cycle as never)).toThrow(
				refusalFor('an object reached twice'),
			);
		});

		it('should let what the function throws through, unchanged', () => {
			const thrown = new RangeError('from the function');

			expect(() =>
				evaluateAtRuntime(() => {
					throw thrown;
				}),
			).toThrow(thrown);
		});
	});
});
