import { describe, expect, expectTypeOf, it } from 'vitest';

import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

import { allocate } from '@/src/allocate';
import { asView } from '@/src/asView';
import { createFixedBufferStorage } from '@/src/fixedBufferStorage';
import { createManagedAllocator } from '@/src/managedAllocator';
import { createManagedStorage } from '@/src/managedStorage';
import type { Storage } from '@/src/storage';
import { StructureOfArrays } from '@/src/structureOfArrays';
import { coded } from '@/src/tests/coded';

/**
 * Behaviour suite for the `Storage<T>` contract.
 *
 * The same cases over every strategy: a consumer written against the contract
 * must not be able to tell which one it was handed. What only one strategy
 * does is in that strategy's own suite.
 */

const SensorContact = struct('SensorContact', {
	bearing: SinglePrecisionFloat,
	range: SinglePrecisionFloat,
});

type SensorContact = Struct<typeof SensorContact>;

const origin: SensorContact = SensorContact.from({ bearing: 0, range: 0 });

/** Each strategy, as a factory of a storage of points. */
const STRATEGIES = [
	[
		'ManagedStorage',
		(length: number): Storage<SensorContact> => createManagedStorage(length, origin),
	],
	[
		'FixedBufferStorage',
		(length: number): Storage<SensorContact> => createFixedBufferStorage(SensorContact, length),
	],
	// What `allocate` returns names its operations after the contract itself,
	// since no storage strategy of its own stands behind it.
	[
		'Storage',
		(length: number): Storage<SensorContact> => {
			return allocate(SensorContact, length, createManagedAllocator());
		},
	],
	// Each field in a column of its own, behind the same contract: the name is
	// the strategy's, which is what an error names, whatever the layout.
	[
		'FixedBufferStorage',
		(length: number): Storage<SensorContact> => {
			return createFixedBufferStorage(SensorContact, length, StructureOfArrays);
		},
	],
	[
		'Storage',
		(length: number): Storage<SensorContact> => {
			return allocate(SensorContact, length, createManagedAllocator(), StructureOfArrays);
		},
	],
	// A view is accepted wherever a storage is; this one sits inside a larger
	// buffer, so a position it got wrong would land on a neighbour.
	[
		'View',
		(length: number): Storage<SensorContact> => {
			return asView(createFixedBufferStorage(SensorContact, length + 2), 1, length);
		},
	],
] as const;

/**
 * A consumer that knows nothing but the contract.
 *
 * @param points Any storage of points.
 * @returns The sum of their `bearing`.
 */
const sumOfX = (points: Storage<SensorContact>): number => {
	let sum = 0;

	for (let index = 0; index < points.length; index++) {
		sum += points.get(index).bearing;
	}

	return sum;
};

describe.each(STRATEGIES)('%s, as a Storage<T>', (name, create) => {
	it('should report the length it was created with', () => {
		expect(create(5).length).toBe(5);
		expect(create(0).length).toBe(0);
	});

	it('should read back what was set, at that index only', () => {
		const points: Storage<SensorContact> = create(3);

		points.set(1, SensorContact.from({ bearing: 2, range: 3 }));

		expect(SensorContact.equals(points.get(1), SensorContact.from({ bearing: 2, range: 3 }))).toBe(
			true,
		);

		expect(SensorContact.equals(points.get(0), origin)).toBe(true);
		expect(SensorContact.equals(points.get(2), origin)).toBe(true);
	});

	it('should run a consumer written against the contract', () => {
		const points: Storage<SensorContact> = create(4);

		for (let index = 0; index < points.length; index++) {
			points.set(index, SensorContact.from({ bearing: index, range: 0 }));
		}

		expect(sumOfX(points)).toBe(0 + 1 + 2 + 3);
	});

	it('should be frozen', () => {
		const points: Storage<SensorContact> = create(1);

		expect(Object.isFrozen(points)).toBe(true);
	});

	it('should work with its methods taken off the object', () => {
		const { get, set } = create(2);

		set(1, SensorContact.from({ bearing: 7, range: 0 }));

		expect(get(1).bearing).toBe(7);
	});

	it.each([
		[-1, '-1'],
		[3, '3'],
		[1.5, '1.5'],
		[Number.NaN, 'NaN'],
		[Number.POSITIVE_INFINITY, 'Infinity'],
	])('should refuse to get index %s', (index, shown) => {
		expect(() => create(3).get(index)).toThrow(
			coded(
				new RangeError(`FULCRO7002: ${name}.get: index ${shown} is outside a storage of length 3.`),
				{ operation: `${name}.get`, index, length: 3 },
			),
		);
	});

	it('should refuse to set outside, and leave every value as it was', () => {
		const points: Storage<SensorContact> = create(2);

		expect(() => {
			points.set(2, SensorContact.from({ bearing: 1, range: 1 }));
		}).toThrow(
			coded(new RangeError(`FULCRO7002: ${name}.set: index 2 is outside a storage of length 2.`), {
				operation: `${name}.set`,
				index: 2,
				length: 2,
			}),
		);

		expect(sumOfX(points)).toBe(0);
	});

	it('should hold nothing at length 0', () => {
		expect(() => create(0).get(0)).toThrow(RangeError);
	});

	it('should infer the type of the values it holds', () => {
		expectTypeOf(create(1)).toEqualTypeOf<Storage<SensorContact>>();
		expectTypeOf(create(1).get(0)).toEqualTypeOf<SensorContact>();
	});
});

describe('Storage<T> lengths', () => {
	it.each([
		['createManagedStorage', (length: number): Storage<number> => createManagedStorage(length, 0)],
		[
			'createFixedBufferStorage',
			(length: number): Storage<SensorContact> => createFixedBufferStorage(SensorContact, length),
		],
		[
			'allocate',
			(length: number): Storage<SensorContact> => {
				return allocate(SensorContact, length, createManagedAllocator());
			},
		],
	] as const)('%s should refuse a length that is not a count', (name, create) => {
		for (const [length, shown] of [
			[-1, '-1'],
			[1.5, '1.5'],
			[Number.NaN, 'NaN'],
			[2 ** 53, String(2 ** 53)],
		] as const) {
			expect(() => create(length)).toThrow(
				coded(
					new RangeError(
						`FULCRO7001: ${name}: expected a length that is a non-negative safe integer, received ${shown}.`,
					),
					{ operation: name, received: length },
				),
			);
		}
	});
});

describe('the members of a storage', () => {
	it('should be declared as the functions they are, which work off their object', () => {
		expectTypeOf<Storage<number>['get']>().toEqualTypeOf<(index: number) => number>();
		expectTypeOf<Storage<number>['set']>().toEqualTypeOf<(index: number, value: number) => void>();
	});

	it('should not stand for a storage of anything, which could be handed a string', () => {
		expectTypeOf<Storage<number>>().not.toExtend<Storage<unknown>>();
		expectTypeOf<Storage<number>>().toExtend<Storage<number>>();
	});
});
