import { describe, expect, it } from 'vitest';

import { catalog } from '@/catalog';
import { createError, ErrorCode } from '@/createError';
import { ErrorDefinition } from '@/definition';

/**
 * Behaviour suite for `createError`.
 *
 * Driven by the catalog rather than by a hand-picked sample, so a code
 * registered tomorrow is covered by the same assertions the day it is added:
 * its prefix, its property and its class are checked without anyone having to
 * remember to write the case.
 */

/** Every registered code, with its definition. */
const ENTRIES = Object.entries(catalog) as [ErrorCode, ErrorDefinition][];

/** The built-in classes a code can be registered with. */
const KINDS = [Error, RangeError, SyntaxError, TypeError] as const;

/**
 * Creates the error of any code, whatever its template takes.
 *
 * Each code is exercised with placeholder values: what is asserted is the
 * frame around the text, which does not depend on them.
 *
 * @param code The code.
 * @param definition Its entry.
 * @returns The error.
 */
const createAny = (code: ErrorCode, definition: ErrorDefinition): Error => {
	const values: string[] = Array.from(
		{ length: definition.message.length },
		(_, index) => `value${index}`,
	);

	return (createError as (code: string, ...values: string[]) => Error)(
		code,
		...values,
	);
};

describe('createError', () => {
	it('should register at least one code', () => {
		expect(ENTRIES.length).toBeGreaterThan(0);
	});

	it.each(ENTRIES)(
		'%s should carry its code as the prefix of its message',
		(code, definition) => {
			const error: Error = createAny(code, definition);

			expect(error.message.startsWith(`${code}: `)).toBe(true);
		},
	);

	it.each(ENTRIES)(
		'%s should carry the same code as a property',
		(code, definition) => {
			const error = createAny(code, definition) as Error & { code: string };

			expect(error.code).toBe(code);
			expect(error.message.slice(0, code.length)).toBe(error.code);
		},
	);

	it.each(ENTRIES)(
		'%s should be an instance of the class it is registered with, and only that one',
		(code, definition) => {
			const error: Error = createAny(code, definition);

			expect(error).toBeInstanceOf(definition.kind);
			expect(error.constructor).toBe(definition.kind);

			for (const kind of KINDS) {
				if (kind === Error) continue;

				expect(error instanceof kind).toBe(kind === definition.kind);
			}
		},
	);

	it('should build the text from the values it was given', () => {
		const error = createError('FULCRO6021', 'Vector3.from', 'x');

		expect(error.message).toBe("FULCRO6021: Vector3.from: missing field 'x'.");
		expect(error).toBeInstanceOf(TypeError);
		expect(error.code).toBe('FULCRO6021');
	});

	it('should keep the text exactly as a template with no values writes it', () => {
		const error = createError('FULCRO3002');

		expect(error.message).toBe(
			'FULCRO3002: This module is only meaningful inside a worker.',
		);
	});

	it('should set the cause a code declares, even when it is undefined', () => {
		const fromNull = createError('FULCRO2001', null);
		const fromUndefined = createError('FULCRO2001', undefined);

		expect(fromNull.message).toBe('FULCRO2001: Operation rejected with null');
		expect(fromNull.cause).toBeNull();
		expect(Object.hasOwn(fromUndefined, 'cause')).toBe(true);
		expect(fromUndefined.cause).toBeUndefined();
	});

	it('should set no cause for a code that declares none', () => {
		expect(Object.hasOwn(createError('FULCRO1001'), 'cause')).toBe(false);
	});

	it('should leave its own frame out of the stack', () => {
		const thrower = (): never => {
			throw createError('FULCRO1001');
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
