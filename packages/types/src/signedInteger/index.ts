import type { Branded } from '@/brand';
import {
	type ByteSize,
	createIntegerType,
	type IntegerRepresentation,
	type IntegerType,
	type IntegerWidth,
} from '@/integer';
import type { Layout } from '@/layout';

/**
 * A two's complement integer of `N` bits: from -2^(N-1) to 2^(N-1) - 1.
 *
 * ```ts
 * const index: SignedInteger<32> = SignedInteger(32).from(42);
 * ```
 *
 * Carried by a `number` up to 32 bits and by a `bigint` from 64, so the type of
 * the value already says which operators it takes. Widths are a parameter, not
 * a list of names: there is no `SignedInteger32`, and no `i32`.
 *
 * A `SignedInteger<8>` is not a `SignedInteger<32>`, even though every value of
 * one fits in the other. Widening goes through `from`, where it is visible.
 *
 * @template N Width, in bits.
 */
export type SignedInteger<N extends IntegerWidth> = Branded<
	IntegerRepresentation<N>,
	`SignedInteger${N}`
> &
	Layout<ByteSize<N>, ByteSize<N>>;

/** Descriptors already built, so a width is described by one object. */
const descriptors = new Map<IntegerWidth, IntegerType<unknown>>();

/**
 * The descriptor of a signed integer width: conversion, recognition and checked
 * arithmetic.
 *
 * ```ts
 * const Int32 = SignedInteger(32);
 *
 * Int32.from(2 ** 31); // RangeError: outside [-2147483648, 2147483647]
 * Int32.wrap(2 ** 31); // -2147483648
 * Int32.add(Int32.maximum, Int32.from(1)); // RangeError
 * ```
 *
 * Calling it twice with the same width returns the same object.
 *
 * @template N Width, in bits.
 * @param width Width, in bits.
 * @returns The descriptor of that width.
 * @throws {RangeError} When the width is not 8, 16, 32, 64 or 128.
 */
export const SignedInteger = <N extends IntegerWidth>(
	width: N,
): IntegerType<SignedInteger<N>> => {
	let descriptor: IntegerType<unknown> | undefined = descriptors.get(width);

	if (descriptor === undefined) {
		descriptor = createIntegerType(true, width, `SignedInteger<${width}>`);
		descriptors.set(width, descriptor);
	}

	return descriptor as IntegerType<SignedInteger<N>>;
};
