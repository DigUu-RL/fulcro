import { describe, expect, expectTypeOf, it } from 'vitest';

import { createError } from '@/createError';
import { FulcroError } from '@/fulcroError';
import { isFulcroError } from '@/isFulcroError';
import { prefixError } from '@/prefixError';

/**
 * Behaviour suite for `isFulcroError`.
 */

/** An error as `@fulcro/memory` throws it for an index past the end. */
const outside = (): RangeError & FulcroError<'FULCRO7002'> =>
	createError('FULCRO7002', {
		operation: 'ManagedStorage.get',
		index: 12,
		length: 10,
	});

describe('isFulcroError', () => {
	it('should accept an error a package created', () => {
		expect(isFulcroError(outside())).toBe(true);
	});

	it('should accept it when asked about its own code', () => {
		expect(isFulcroError(outside(), 'FULCRO7002')).toBe(true);
	});

	it('should refuse it when asked about another code', () => {
		expect(isFulcroError(outside(), 'FULCRO7001')).toBe(false);
	});

	it('should accept an error placed in a wider context', () => {
		const located = prefixError(outside(), 'Particles.update');

		expect(isFulcroError(located, 'FULCRO7002')).toBe(true);
	});

	it('should refuse an error carrying a code nobody registered', () => {
		const foreign = Object.assign(new Error('ERR_SOMETHING: text'), {
			code: 'ERR_SOMETHING',
			details: { operation: 'something' },
		});

		expect(isFulcroError(foreign)).toBe(false);
	});

	it('should refuse an error with a registered code but no details', () => {
		// As an error created before details existed reads.
		const older = Object.assign(new RangeError('FULCRO7002: text'), {
			code: 'FULCRO7002',
		});

		expect(isFulcroError(older)).toBe(false);
	});

	it('should refuse an error whose message has lost its code', () => {
		const altered = outside();

		altered.message = 'reworded by somebody';

		expect(isFulcroError(altered)).toBe(false);
	});

	it('should refuse an object shaped like one that is not an error', () => {
		const lookalike = {
			message: 'FULCRO7002: text',
			code: 'FULCRO7002',
			details: { operation: 'ManagedStorage.get' },
		};

		expect(isFulcroError(lookalike)).toBe(false);
	});

	it('should refuse what is not an error at all', () => {
		expect(isFulcroError(null)).toBe(false);
		expect(isFulcroError(undefined)).toBe(false);
		expect(isFulcroError('FULCRO7002: text')).toBe(false);
		expect(isFulcroError(new RangeError('plain'))).toBe(false);
	});

	it("should narrow the details to the code's fields", () => {
		const caught: unknown = outside();

		if (!isFulcroError(caught, 'FULCRO7002')) {
			throw new Error('expected a FULCRO7002');
		}

		expectTypeOf(caught.details.index).toEqualTypeOf<number | string>();
		expectTypeOf(caught.details.length).toEqualTypeOf<number>();
		expect(caught.details.length).toBe(10);
	});

	it('should narrow to every code, operation readable, when no code is given', () => {
		const caught: unknown = outside();

		if (!isFulcroError(caught)) throw new Error('expected a Fulcro error');

		expectTypeOf(caught.details.operation).toEqualTypeOf<string>();
		expect(caught.details.operation).toBe('ManagedStorage.get');

		if (caught.code === 'FULCRO7002') {
			expectTypeOf(caught.details.length).toEqualTypeOf<number>();
		}
	});
});
