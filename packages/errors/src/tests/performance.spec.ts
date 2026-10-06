import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalog } from '@/catalog';
import { createError } from '@/createError';
import { isFulcroError } from '@/isFulcroError';
import { prefixError } from '@/prefixError';

/**
 * Performance suite.
 *
 * What an error costs is counted in templates run and in details read: the
 * message of a code is the only work that grows with what the error has to
 * say, and the promise is that it is done once, when the error is created, and
 * never again — not on load, not for the codes nobody threw, and not when an
 * error is placed in a wider context or recognised. The details themselves are
 * the object the caller wrote, never a copy of it.
 */

/** How many errors the scaling assertions create. */
const ERRORS = 1_000;

/**
 * Wraps every template of the catalog in a spy.
 *
 * @returns Counts the calls made to all of them together.
 */
const spyOnEveryTemplate = (): (() => number) => {
	const spies = Object.values(catalog).map((definition) =>
		vi.spyOn(definition, 'message'),
	);

	return () => spies.reduce((sum, spy) => sum + spy.mock.calls.length, 0);
};

/**
 * Details that count every field read from them.
 *
 * @param index The index to report.
 * @returns The details, and how many reads they have seen.
 */
const countedDetails = (
	index: number,
): { details: { operation: string; index: number }; reads: () => number } => {
	let reads = 0;

	const details = new Proxy(
		{ operation: 'elementAt', index },
		{
			get: (target, field, receiver) => {
				reads++;

				return Reflect.get(target, field, receiver);
			},
		},
	);

	return { details, reads: () => reads };
};

afterEach(() => {
	vi.restoreAllMocks();
});

describe('createError', () => {
	it('should run exactly one template, the one of its own code', () => {
		const templates = spyOnEveryTemplate();
		const own = vi.mocked(catalog.FULCRO1005.message);

		createError('FULCRO1005', { operation: 'elementAt', index: 3 });

		expect(own).toHaveBeenCalledTimes(1);
		expect(templates()).toBe(1);
	});

	it('should run one template per error, however many are created', () => {
		const templates = spyOnEveryTemplate();

		for (let index = 0; index < ERRORS; index++) {
			createError('FULCRO1005', { operation: 'elementAt', index });
		}

		expect(templates()).toBe(ERRORS);
	});

	it('should keep the details it was given rather than copying them', () => {
		const passed: { details: { operation: string; index: number } }[] = [];
		const created: unknown[] = [];

		for (let index = 0; index < ERRORS; index++) {
			const details = { operation: 'elementAt', index };

			passed.push({ details });
			created.push(createError('FULCRO1005', details).details);
		}

		expect(
			created.filter((details, index) => details === passed[index]?.details),
		).toHaveLength(ERRORS);
	});

	it('should read only the fields its template uses, once each', () => {
		const { details, reads } = countedDetails(7);

		createError('FULCRO1005', details);

		// `index`, read by the template; nothing walks the object.
		expect(reads()).toBe(1);
	});
});

describe('prefixError', () => {
	it('should run no template at all', () => {
		const inner = createError('FULCRO6021', {
			operation: 'Point.from',
			field: 'y',
		});
		const templates = spyOnEveryTemplate();

		let located = inner;

		for (let level = 0; level < ERRORS; level++) {
			located = prefixError(located, `Level${level}.from: field 'x'`);
		}

		expect(templates()).toBe(0);
		expect(located.code).toBe('FULCRO6021');
	});
});

describe('isFulcroError', () => {
	it('should run no template and read no detail, however often it is asked', () => {
		const { details, reads } = countedDetails(7);
		const error = createError('FULCRO1005', details);
		const before: number = reads();
		const templates = spyOnEveryTemplate();

		for (let check = 0; check < ERRORS; check++) isFulcroError(error);

		expect(templates()).toBe(0);
		expect(reads() - before).toBe(0);
	});
});
