import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/types`, `FULCRO6xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme.
 *
 * Values arrive already described: how a number, a bigint or a kind reads in a
 * message is `@fulcro/types`' own convention, and it stays there rather than
 * being duplicated here.
 */
export const typesCatalog = {
	FULCRO6001: {
		kind: RangeError,
		message: (operation: string) => `${operation}: division by zero.`,
	},
	FULCRO6002: {
		kind: RangeError,
		message: (operation: string, received: string) =>
			`${operation}: expected an integer, received ${received}.`,
	},
	FULCRO6003: {
		kind: SyntaxError,
		message: (received: string) =>
			`BigInteger.from: expected decimal digits with an optional sign, received ${received}.`,
	},
	FULCRO6004: {
		kind: TypeError,
		message: (received: string) =>
			`BigInteger.from: expected a number, a bigint or a string, received ${received}.`,
	},
	FULCRO6005: {
		kind: RangeError,
		message: (operation: string, received: string) =>
			`${operation}: expected an exponent of zero or more, received ${received}.`,
	},
	FULCRO6006: {
		kind: TypeError,
		message: (operation: string, received: string) =>
			`${operation}: expected a number, received ${received}.`,
	},
	FULCRO6007: {
		kind: RangeError,
		message: (operation: string, modes: string, received: string) =>
			`${operation}: expected a rounding mode of ${modes}, received ${received}.`,
	},
	FULCRO6008: {
		kind: TypeError,
		message: (name: string, received: string) =>
			`struct ${name}: expected an object of methods, received ${received}.`,
	},
	FULCRO6009: {
		kind: TypeError,
		message: (name: string, method: string) =>
			`struct ${name}: method '${method}' has the name of a field; a value could not hold both.`,
	},
	FULCRO6010: {
		kind: TypeError,
		message: (name: string, method: string) =>
			`struct ${name}: '${method}' cannot name a method; an array index would be reordered, and '~layout' is the layout itself.`,
	},
	FULCRO6011: {
		kind: TypeError,
		message: (name: string, method: string, received: string) =>
			`struct ${name}: method '${method}' must be a function, received ${received}.`,
	},
	FULCRO6012: {
		kind: TypeError,
		message: (received: string) =>
			`struct: expected a name, received ${received}.`,
	},
	FULCRO6013: {
		kind: TypeError,
		message: (name: string, received: string) =>
			`struct ${name}: expected an object of fields, received ${received}.`,
	},
	FULCRO6014: {
		kind: TypeError,
		message: (name: string) => `struct ${name}: expected at least one field.`,
	},
	FULCRO6015: {
		kind: TypeError,
		message: (name: string, field: string) =>
			`struct ${name}: '${field}' cannot name a field; an array index would be reordered, and '~layout' is the layout itself.`,
	},
	FULCRO6016: {
		kind: TypeError,
		message: (name: string, field: string) =>
			`struct ${name}: field '${field}' has no fixed layout. Declare it with a numeric type of @fulcro/types other than BigInteger, or with another struct.`,
	},
	FULCRO6017: {
		kind: TypeError,
		message: (operation: string, received: string) =>
			`${operation}: expected a DataView, received ${received}.`,
	},
	FULCRO6018: {
		kind: RangeError,
		message: (
			operation: string,
			size: number,
			offset: number,
			available: number,
		) =>
			`${operation}: ${size} bytes at offset ${offset} do not fit in a view of ${available} bytes.`,
	},
	FULCRO6019: {
		kind: TypeError,
		message: (operation: string, received: string) =>
			`${operation}: expected an object, received ${received}.`,
	},
	FULCRO6020: {
		kind: TypeError,
		message: (operation: string, key: string, fields: string) =>
			`${operation}: '${key}' is not a field; the fields are ${fields}.`,
	},
	FULCRO6021: {
		kind: TypeError,
		message: (operation: string, field: string) =>
			`${operation}: missing field '${field}'.`,
	},
	FULCRO6022: {
		kind: RangeError,
		message: (
			operation: string,
			minimum: number,
			maximum: number,
			received: number,
		) =>
			`${operation}: expected an integer from ${minimum} to ${maximum}, received ${received}.`,
	},
	FULCRO6023: {
		kind: SyntaxError,
		message: (received: string) =>
			`Decimal.from: expected a decimal literal, received ${received}.`,
	},
	FULCRO6024: {
		kind: TypeError,
		message: (received: string) =>
			`Decimal.from: expected a Decimal, a string, a number or a bigint, received ${received}.`,
	},
	FULCRO6025: {
		kind: RangeError,
		message: (received: string) =>
			`Decimal.power: expected an integer exponent, received ${received}.`,
	},
	FULCRO6026: {
		kind: RangeError,
		message: (received: number) =>
			`Decimal.round: expected an integer number of places, received ${received}.`,
	},
	FULCRO6027: {
		kind: TypeError,
		message: () =>
			'Decimal cannot be converted to a primitive implicitly: operators such as + and < would lose its digits. ' +
			'Use add(), compare() or toString() instead.',
	},
	FULCRO6028: {
		kind: TypeError,
		message: (operation: string, received: string) =>
			`${operation}: expected a number or a bigint, received ${received}.`,
	},
	FULCRO6029: {
		kind: RangeError,
		message: (operation: string, maximum: number, received: string) =>
			`${operation}: expected a count from 0 to ${maximum}, received ${received}.`,
	},
	FULCRO6030: {
		kind: RangeError,
		message: (family: string, widths: string, received: string) =>
			`${family}: expected a width of ${widths} bits, received ${received}.`,
	},
	FULCRO6031: {
		kind: RangeError,
		message: (operation: string, received: string, range: string) =>
			`${operation}: ${received} is outside ${range}.`,
	},
	FULCRO6032: {
		kind: RangeError,
		message: (name: string, base: string, exponent: string, range: string) =>
			`${name}.power: ${base} ** ${exponent} is outside ${range}.`,
	},
} as const satisfies RangeCatalog<'6'>;
