import { afterEach, describe, expect, it, vi } from 'vitest';

import { catalog } from '@/catalog';
import { createError } from '@/createError';
import { prefixError } from '@/prefixError';

/**
 * Performance suite.
 *
 * What an error costs is counted in templates run: the message of a code is
 * the only work that grows with what the error has to say, and the promise is
 * that it is done once, when the error is created, and never again — not on
 * load, not for the codes nobody threw, and not when an error is placed in a
 * wider context.
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

afterEach(() => {
	vi.restoreAllMocks();
});

describe('createError', () => {
	it('should run exactly one template, the one of its own code', () => {
		const templates = spyOnEveryTemplate();
		const own = vi.mocked(catalog.FULCRO1005.message);

		createError('FULCRO1005', 3);

		expect(own).toHaveBeenCalledTimes(1);
		expect(templates()).toBe(1);
	});

	it('should run one template per error, however many are created', () => {
		const templates = spyOnEveryTemplate();

		for (let index = 0; index < ERRORS; index++) {
			createError('FULCRO1005', index);
		}

		expect(templates()).toBe(ERRORS);
	});
});

describe('prefixError', () => {
	it('should run no template at all', () => {
		const inner = createError('FULCRO6021', 'Point.from', 'y');
		const templates = spyOnEveryTemplate();

		let located = inner;

		for (let level = 0; level < ERRORS; level++) {
			located = prefixError(located, `Level${level}.from: field 'x'`);
		}

		expect(templates()).toBe(0);
		expect(located.code).toBe('FULCRO6021');
	});
});
