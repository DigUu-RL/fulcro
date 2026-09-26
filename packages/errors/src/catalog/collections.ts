import { RangeCatalog } from '@/definition';

/**
 * The errors of `@fulcro/collections`, `FULCRO1xxx`.
 *
 * Numbered in the order they were registered, not by theme: a code is never
 * reused or renumbered, so an order that tried to mean something would stop
 * meaning it the first time an error was retired. `docs/errors/FULCRO1xxx.md`
 * groups them for reading.
 */
export const collectionsCatalog = {
	FULCRO1001: {
		kind: Error,
		message: () => 'Sequence contains no elements',
	},
	FULCRO1002: {
		kind: Error,
		message: () => 'An item with the same key has already been added.',
	},
	FULCRO1003: {
		kind: Error,
		message: () => 'single() found no element matching the condition.',
	},
	FULCRO1004: {
		kind: Error,
		message: () =>
			'single() found more than one element matching the condition.',
	},
	FULCRO1005: {
		kind: Error,
		message: (index: number) => `elementAt(${index}) is out of range.`,
	},
	FULCRO1006: {
		kind: Error,
		message: (size: number) =>
			`chunk(${size}) needs a positive integer: a chunk of no elements would never end the sequence.`,
	},
	FULCRO1007: {
		kind: Error,
		message: (operation: string) =>
			`${operation}() was called on an empty sequence.`,
	},
	FULCRO1008: {
		kind: Error,
		message: (size: number) => `windowed(${size}) needs a positive integer.`,
	},
	FULCRO1009: {
		kind: Error,
		message: (rank: number) =>
			`percentile(${rank}) takes a rank between 0 and 100.`,
	},
	FULCRO1010: {
		kind: Error,
		message: () =>
			'sampleStandardDeviation() needs at least two elements: a sample of one says nothing about its spread.',
	},
	FULCRO1011: {
		kind: Error,
		message: () => 'range() takes integers.',
	},
	FULCRO1012: {
		kind: Error,
		message: () => 'range() cannot produce a negative count.',
	},
	FULCRO1013: {
		kind: Error,
		message: () => 'repeat() takes an integer count.',
	},
	FULCRO1014: {
		kind: Error,
		message: () => 'repeat() cannot produce a negative count.',
	},
	FULCRO1015: {
		kind: TypeError,
		message: (expected: string, found: string, index: number) =>
			`cast('${expected}') found a ${found} at index ${index}.`,
	},
	FULCRO1016: {
		kind: Error,
		message: (operator: string) =>
			`${operator}<T>() was not resolved at compile time. Either the @fulcro/collections transformer did not run over this file, or T has no runtime representation — an interface leaves nothing to test for, so pass a class, a typeof name, or use where() with a predicate.`,
	},
	FULCRO1017: {
		kind: Error,
		message: (operation: string, concurrency: number) =>
			`${operation}() needs a positive integer concurrency, and was given ${concurrency}.`,
	},
	FULCRO1018: {
		kind: Error,
		message: () =>
			'Collection factories were not registered. Import the library through ' +
			'its public entry points (e.g. @/collections/sequence) so that the ' +
			'composition root can wire the concrete collections.',
	},
	FULCRO1019: {
		kind: Error,
		message: (operator: string) => `${operator}() needs at least one element.`,
	},
	FULCRO1020: {
		kind: Error,
		message: () => 'single() found no element.',
	},
	FULCRO1021: {
		kind: Error,
		message: (key: string) => `toMap() found two elements with the key ${key}.`,
	},
	FULCRO1022: {
		kind: Error,
		message: () =>
			'sampleStandardDeviation() needs at least two elements: a sample of one says nothing about the spread it was drawn from.',
	},
	FULCRO1023: {
		kind: Error,
		message: () => 'windowed() takes a positive integer size.',
	},
	FULCRO1024: {
		kind: Error,
		message: (operator: string) => `${operator}() found more than one element.`,
	},
} as const satisfies RangeCatalog<'1'>;
