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
 * An integer of `N` bits with no sign: from 0 to 2^N - 1.
 *
 * ```ts
 * const count: UnsignedInteger<16> = UnsignedInteger(16).from(65_535);
 * ```
 *
 * Carried by a `number` up to 32 bits and by a `bigint` from 64. Widths are a
 * parameter, not a list of names: there is no `UnsignedInteger16`, and no `u16`.
 *
 * @template N Width, in bits.
 */
export type UnsignedInteger<N extends IntegerWidth> = Branded<
	IntegerRepresentation<N>,
	`UnsignedInteger${N}`
> &
	Layout<ByteSize<N>, ByteSize<N>>;

/** Descriptors already built, so a width is described by one object. */
const descriptors = new Map<IntegerWidth, IntegerType<unknown>>();

/**
 * The descriptor of an unsigned integer width: conversion, recognition and
 * checked arithmetic.
 *
 * ```ts
 * const Byte = UnsignedInteger(8);
 *
 * Byte.from(-1); // RangeError: outside [0, 255]
 * Byte.wrap(-1); // 255
 * Byte.subtract(Byte.from(0), Byte.from(1)); // RangeError
 * ```
 *
 * Calling it twice with the same width returns the same object.
 *
 * @template N Width, in bits.
 * @param width Width, in bits.
 * @returns The descriptor of that width.
 * @throws {RangeError} When the width is not 8, 16, 32, 64 or 128.
 */
export const UnsignedInteger = <N extends IntegerWidth>(
	width: N,
): IntegerType<UnsignedInteger<N>> => {
	let descriptor: IntegerType<unknown> | undefined = descriptors.get(width);

	if (descriptor === undefined) {
		descriptor = createIntegerType(false, width, `UnsignedInteger<${width}>`);
		descriptors.set(width, descriptor);
	}

	return descriptor as IntegerType<UnsignedInteger<N>>;
};
