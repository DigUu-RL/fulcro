import { describe, expect, expectTypeOf, it } from 'vitest';

import { catalog } from '@/catalog';
import { createError, DetailsOf, ErrorCode } from '@/createError';
import { ErrorDefinition } from '@/definition';
import { sampleDetails } from '@/tests/sampleDetails';

/**
 * Behaviour suite for `createError`.
 *
 * Driven by the catalog rather than by a hand-picked sample, so a code
 * registered tomorrow is covered by the same assertions the day it is added:
 * its prefix, its properties and its class are checked without anyone having
 * to remember to write the case.
 */

/** Every registered code, with its definition. */
const ENTRIES = Object.entries(catalog) as [ErrorCode, ErrorDefinition][];

/** The built-in classes a code can be registered with. */
const KINDS = [Error, RangeError, SyntaxError, TypeError] as const;

/**
 * Creates the error of any code, whatever its template takes.
 *
 * @param code The code.
 * @returns The error.
 */
const createAny = (
	code: ErrorCode,
): Error & { code: string; details: unknown } =>
	(
		createError as (
			code: string,
			details: unknown,
		) => Error & { code: string; details: unknown }
	)(code, sampleDetails());

describe('createError', () => {
	it('should register at least one code', () => {
		expect(ENTRIES.length).toBeGreaterThan(0);
	});

	it.each(ENTRIES)(
		'%s should carry its code as the prefix of its message',
		(code) => {
			const error: Error = createAny(code);

			expect(error.message.startsWith(`${code}: `)).toBe(true);
		},
	);

	it.each(ENTRIES)('%s should carry the same code as a property', (code) => {
		const error = createAny(code) as Error & { code: string };

		expect(error.code).toBe(code);
		expect(error.message.slice(0, code.length)).toBe(error.code);
	});

	it.each(ENTRIES)(
		'%s should be an instance of the class it is registered with, and only that one',
		(code, definition) => {
			const error: Error = createAny(code);

			expect(error).toBeInstanceOf(definition.kind);
			expect(error.constructor).toBe(definition.kind);

			for (const kind of KINDS) {
				if (kind === Error) continue;

				expect(error instanceof kind).toBe(kind === definition.kind);
			}
		},
	);

	it.each(ENTRIES)(
		'%s should carry its details, frozen, with the operation',
		(code) => {
			const error = createAny(code) as Error & {
				details: { operation: string };
			};

			expect(Object.isFrozen(error.details)).toBe(true);
			expect(error.details.operation).toBe('operation');
		},
	);

	it('should build the text from the details it was given', () => {
		const error = createError('FULCRO6021', {
			operation: 'Vector3.from',
			field: 'x',
		});

		expect(error.message).toBe("FULCRO6021: Vector3.from: missing field 'x'.");
		expect(error).toBeInstanceOf(TypeError);
		expect(error.code).toBe('FULCRO6021');
	});

	it('should keep the details as the values they were, not their text', () => {
		const error = createError('FULCRO7002', {
			operation: 'ManagedStorage.get',
			index: 12,
			length: 10,
		});

		expect(error.details).toEqual({
			operation: 'ManagedStorage.get',
			index: 12,
			length: 10,
		});
		expect(error.details.index).toBe(12);
	});

	it('should keep the very object it was given as the details', () => {
		const details = { operation: 'Point.from', field: 'y' };
		const error = createError('FULCRO6021', details);

		expect(error.details).toBe(details);
		expect(Object.isFrozen(details)).toBe(true);
	});

	it('should type the details by the code', () => {
		const error = createError('FULCRO7002', {
			operation: 'ManagedStorage.get',
			index: 12,
			length: 10,
		});

		expectTypeOf(error.details).toEqualTypeOf<DetailsOf<'FULCRO7002'>>();
		expectTypeOf(error.details.length).toEqualTypeOf<number>();
		expectTypeOf(error.details.index).toEqualTypeOf<number | string>();
		expectTypeOf(error.code).toEqualTypeOf<'FULCRO7002'>();
		expectTypeOf(error).toExtend<RangeError>();
	});

	it('should keep the text exactly as a template that reads no detail writes it', () => {
		const error = createError('FULCRO3002', { operation: 'worker' });

		expect(error.message).toBe(
			'FULCRO3002: This module is only meaningful inside a worker.',
		);
	});

	it('should set the cause a code declares, even when it is undefined', () => {
		const fromNull = createError('FULCRO2001', {
			operation: 'tryCatch',
			thrown: null,
		});
		const fromUndefined = createError('FULCRO2001', {
			operation: 'tryCatch',
			thrown: undefined,
		});

		expect(fromNull.message).toBe('FULCRO2001: Operation rejected with null');
		expect(fromNull.cause).toBeNull();
		expect(Object.hasOwn(fromUndefined, 'cause')).toBe(true);
		expect(fromUndefined.cause).toBeUndefined();
	});

	it('should set no cause for a code that declares none', () => {
		expect(
			Object.hasOwn(createError('FULCRO1001', { operation: 'first' }), 'cause'),
		).toBe(false);
	});

	it('should leave its own frame out of the stack', () => {
		const thrower = (): never => {
			throw createError('FULCRO1001', { operation: 'first' });
		};

		let caught: Error | undefined;

		try {
			thrower();
		} catch (error) {
			caught = error as Error;
		}

		// The first frame is the one that threw, which is what a reader of the
		// stack is looking for.
		const frames: string[] = (caught?.stack ?? '')
			.split('\n')
			.filter((line) => line.trimStart().startsWith('at '));

		expect(frames[0]).toContain('thrower');
		expect(frames.some((frame) => /\bat createError\b/.test(frame))).toBe(
			false,
		);
	});
});
