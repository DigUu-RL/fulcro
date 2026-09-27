import { constantOf } from '@fulcro/reflect';

import { cube, OFFSET } from './constantOfDependency.sample';

/**
 * Fixture compiled by the `constantOf` transformer suite: every call here can
 * be proved constant, so every one of them has to be replaced by a literal.
 *
 * Imports the package by name, so the program resolves it the way a consumer's
 * does.
 */

/** Shares its name with a constant of the imported file, on purpose. */
const BASE = 10;

/**
 * Recursive, so the evaluation has to keep a function's own name for itself.
 *
 * @param index Index in the sequence.
 * @returns The Fibonacci number at that index.
 */
function fibonacci(index: number): number {
	return index < 2 ? index : fibonacci(index - 1) + fibonacci(index - 2);
}

/**
 * @param value Number doubled.
 * @returns Its double.
 */
const double = (value: number): number => value * 2;

/**
 * Named rather than written inline, to be handed to `constantOf` by name.
 *
 * @returns The first powers of two.
 */
const powersOfTwo = (): number[] =>
	Array.from({ length: 8 }, (_, exponent) => 2 ** exponent);

export const squares = constantOf(() =>
	[1, 2, 3].map((value) => value * value),
);

export const crcTable = constantOf(() =>
	Array.from({ length: 256 }, (_, byte) => {
		let crc = byte;

		for (let bit = 0; bit < 8; bit++) {
			crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
		}

		return crc >>> 0;
	}),
);

export const scaled = constantOf(() => double(BASE) + fibonacci(15));

export const imported = constantOf(() => cube(OFFSET));

export const chained = constantOf(() => squares.length + imported);

export const special = constantOf(() => [
	Number.NaN,
	Infinity,
	-Infinity,
	-0,
	2n ** 70n,
	-5n,
	undefined,
	null,
	true,
	'text',
]);

export const record = constantOf(() => ({
	name: 'fulcro',
	'two words': 1,
	['__proto__']: 2,
	nested: { list: [1, { deep: true }] },
}));

export const named = constantOf(powersOfTwo);

export const typed = constantOf((): readonly number[] => [1 as number, 2]);

export const shorthand = constantOf(() => ({ BASE }));

export const inside = (): number => constantOf(() => BASE * 3);
