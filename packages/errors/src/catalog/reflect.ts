import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/reflect`, `FULCRO4xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme.
 *
 * `call` is the call as it was written, type arguments included —
 * `offsetOf<Point>('x')` — and `operation` the function's name alone.
 */
export const reflectCatalog = {
	FULCRO4001: {
		kind: Error,
		message: (_details: { operation: string }) =>
			'keysOf<T>() was not resolved at compile time. Either the @fulcro/reflect transformer did not run over this file, or T has no keys to read — a primitive, a union, or an unresolved generic.',
	},
	FULCRO4002: {
		kind: Error,
		message: ({ operation }: { operation: string }) =>
			`${operation}<T>() was not resolved at compile time. Either the @fulcro/reflect transformer did not run over this file, or T has no runtime representation — index signatures and unresolved generics cannot be checked, so pass a test of your own.`,
	},
	FULCRO4003: {
		kind: Error,
		message: (_details: { operation: string }) =>
			'defaultOf<T>() resolves a type, which only exists at compile time. ' +
			'Enable the transformer in the `plugins` entry of your tsconfig ' +
			'so the call is replaced by the value it describes.',
	},
	FULCRO4004: {
		kind: Error,
		message: (_details: { operation: string }) =>
			'typeOf<T>() was not resolved at compile time. Either the @fulcro/reflect transformer did not run over this file, or T is an unresolved generic. The form taking a value, typeOf(value), works without it.',
	},
	FULCRO4005: {
		kind: Error,
		message: (_details: { operation: string }) =>
			'pathsOf<T>() was not resolved at compile time. Either the @fulcro/reflect transformer did not run over this file, or T has no paths to walk — a primitive, or an unresolved generic.',
	},
	FULCRO4006: {
		kind: TypeError,
		message: ({
			named,
			received,
		}: {
			operation: string;
			named: string;
			received: string;
		}) => `as<${named}>() refused a value of type ${received}.`,
	},
	FULCRO4007: {
		kind: TypeError,
		message: ({
			named,
			where,
		}: {
			operation: string;
			named: string;
			where: string;
		}) => `as<${named}>() refused a value: ${where}`,
	},
	FULCRO4008: {
		kind: Error,
		message: (_details: { operation: string }) =>
			'nameOf<T>() names a type, which only exists at compile time. ' +
			'Enable the transformer in the `plugins` entry of your ' +
			'tsconfig, or call nameOf with a value or an accessor.',
	},
	FULCRO4009: {
		kind: Error,
		message: ({ call }: { operation: string; call: string }) =>
			`${call} reads the layout a type declares, which only exists at compile time. ` +
			'Enable the transformer in the `plugins` entry of your tsconfig so the call is replaced by what it describes. ' +
			'If it is enabled, the type argument was not a concrete type: a generic parameter has no layout until it is substituted, ' +
			'and a union of layouts has no single one. offsetOf also needs its field written as a string literal.',
	},
	FULCRO4010: {
		kind: Error,
		message: ({
			call,
			reason,
		}: {
			operation: string;
			call: string;
			reason: string;
		}) =>
			`${call} cannot be evaluated at compile time: ${reason}. ` +
			'Everything the function reads has to be a const, a function or a built-in the compiler can see the source of; ' +
			'compute the value at runtime instead, without constantOf, if it cannot be.',
	},
	FULCRO4011: {
		kind: TypeError,
		message: ({
			call,
			received,
		}: {
			operation: string;
			call: string;
			received: string;
		}) =>
			`${call} produced ${received}, which cannot be written as a literal. ` +
			'A constant is a number, a string, a boolean, a bigint, null or undefined, or an array or a plain object of them, each reached once.',
	},
	FULCRO4012: {
		kind: Error,
		message: ({
			call,
			thrown,
		}: {
			operation: string;
			call: string;
			thrown: string;
		}) => `${call} threw while it was evaluated at compile time: ${thrown}`,
	},
	FULCRO4013: {
		kind: Error,
		message: ({
			call,
			milliseconds,
		}: {
			operation: string;
			call: string;
			milliseconds: number;
		}) => `${call} did not finish within ${milliseconds} ms at compile time.`,
	},
	FULCRO4014: {
		kind: TypeError,
		message: ({ received }: { operation: string; received: string }) =>
			`constantOf: expected a function, received ${received}.`,
	},
} as const satisfies RangeCatalog<'4'>;
