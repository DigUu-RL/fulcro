import { layoutOf, offsetOf } from '@fulcro/reflect';
import {
	DoublePrecisionFloat,
	SignedInteger,
	SinglePrecisionFloat,
	type Struct,
	struct,
	UnsignedInteger,
} from '@fulcro/types';

import type { Shipped } from './struct.declared';

/**
 * Fixture for the `offsetOf` and `layoutOf` suites: real structs of
 * `@fulcro/types`, measured by `@fulcro/reflect`, both imported by name as a
 * consumer imports them.
 *
 * Compiled with the reflect transformer and then run, so each struct's
 * descriptor — whose `layout` `struct()` computes at runtime — sits beside
 * what the transformer emitted for its type, and the two can be compared.
 */

/** Declared smallest first, so that placement by alignment has to reorder it. */
export const Mixed = struct('Mixed', {
	flag: UnsignedInteger(8),
	weight: DoublePrecisionFloat,
	count: UnsignedInteger(16),
});
export type Mixed = Struct<typeof Mixed>;

/** Fields of one alignment, written back to front. */
export const Reversed = struct('Reversed', {
	z: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
	x: SinglePrecisionFloat,
});
export type Reversed = Struct<typeof Reversed>;

/** A struct inside a struct. */
export const Outer = struct('Outer', {
	tag: UnsignedInteger(8),
	inner: Mixed,
	ratio: SinglePrecisionFloat,
});
export type Outer = Struct<typeof Outer>;

/** Methods are not fields: they take no room and are not listed. */
export const Account = struct(
	'Account',
	{ owner: UnsignedInteger(32), balance: SignedInteger(64) },
	{
		isOverdrawn() {
			return this.balance < 0n;
		},
	},
);
export type Account = Struct<typeof Account>;

export const layouts = {
	Mixed: layoutOf<Mixed>(),
	Reversed: layoutOf<Reversed>(),
	Outer: layoutOf<Outer>(),
	Account: layoutOf<Account>(),
	Shipped: layoutOf<Shipped>(),
	SinglePrecisionFloat: layoutOf<SinglePrecisionFloat>(),
};

export const offsets = {
	Mixed: {
		flag: offsetOf<Mixed>('flag'),
		weight: offsetOf<Mixed>('weight'),
		count: offsetOf<Mixed>('count'),
	},
	Reversed: {
		z: offsetOf<Reversed>('z'),
		y: offsetOf<Reversed>('y'),
		x: offsetOf<Reversed>('x'),
	},
	Outer: {
		tag: offsetOf<Outer>('tag'),
		inner: offsetOf<Outer>('inner'),
		ratio: offsetOf<Outer>('ratio'),
	},
	Account: {
		owner: offsetOf<Account>('owner'),
		balance: offsetOf<Account>('balance'),
	},
	Shipped: {
		small: offsetOf<Shipped>('small'),
		big: offsetOf<Shipped>('big'),
		other: offsetOf<Shipped>('other'),
		last: offsetOf<Shipped>('last'),
	},
};
