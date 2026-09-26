import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/reflect`, `FULCRO4xxx`.
 *
 * Numbered in the order they were registered; see `collectionsCatalog` for why
 * the order is not by theme.
 */
export const reflectCatalog = {
	FULCRO4001: {
		kind: Error,
		message: () =>
			'keysOf<T>() was not resolved at compile time. Either the @fulcro/reflect transformer did not run over this file, or T has no keys to read — a primitive, a union, or an unresolved generic.',
	},
	FULCRO4002: {
		kind: Error,
		message: (operator: string) =>
			`${operator}<T>() was not resolved at compile time. Either the @fulcro/reflect transformer did not run over this file, or T has no runtime representation — index signatures and unresolved generics cannot be checked, so pass a test of your own.`,
	},
	FULCRO4003: {
		kind: Error,
		message: () =>
			'defaultOf<T>() resolves a type, which only exists at compile time. ' +
			'Enable the transformer in the `plugins` entry of your tsconfig ' +
			'so the call is replaced by the value it describes.',
	},
	FULCRO4004: {
		kind: Error,
		message: () =>
			'typeOf<T>() was not resolved at compile time. Either the @fulcro/reflect transformer did not run over this file, or T is an unresolved generic. The form taking a value, typeOf(value), works without it.',
	},
	FULCRO4005: {
		kind: Error,
		message: () =>
			'pathsOf<T>() was not resolved at compile time. Either the @fulcro/reflect transformer did not run over this file, or T has no paths to walk — a primitive, or an unresolved generic.',
	},
	FULCRO4006: {
		kind: TypeError,
		message: (named: string, received: string) =>
			`as<${named}>() refused a value of type ${received}.`,
	},
	FULCRO4007: {
		kind: TypeError,
		message: (named: string, where: string) =>
			`as<${named}>() refused a value: ${where}`,
	},
	FULCRO4008: {
		kind: Error,
		message: () =>
			'nameOf<T>() names a type, which only exists at compile time. ' +
			'Enable the transformer in the `plugins` entry of your ' +
			'tsconfig, or call nameOf with a value or an accessor.',
	},
	FULCRO4009: {
		kind: Error,
		message: (call: string) =>
			`${call} reads the layout a type declares, which only exists at compile time. ` +
			'Enable the transformer in the `plugins` entry of your tsconfig so the call is replaced by the number it describes. ' +
			'If it is enabled, the type argument was not a concrete type: a generic parameter has no layout until it is substituted, ' +
			'and a union of layouts has no single one.',
	},
} as const satisfies RangeCatalog<'4'>;
