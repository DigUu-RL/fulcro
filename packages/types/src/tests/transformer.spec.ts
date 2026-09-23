import { describe, expect, it } from 'vitest';

import { compile, markedLines } from './support/compile';

/**
 * Behaviour suite for the operator transformer, the `tsc` plugin.
 *
 * Each fixture is rewritten through the program transformer, type checked as
 * rewritten, emitted, and run. The assertions read the values the program
 * computed, so what is proved is the whole path a consumer's build takes: the
 * operator claimed, the right operation called, the result keeping its type
 * well enough for the checker to accept it, and the emitted code doing what
 * the operator means.
 */

/** Formats a value the way the assertions below spell it. */
const shown = (value: unknown): unknown =>
	typeof value === 'bigint' ? `${value}n` : value;

describe('the operator transformer', { timeout: 60_000 }, () => {
	describe('on fixed-width integers', () => {
		const integers = compile('integers');
		const result = integers.run();

		it('should type check every operator once rewritten', () => {
			expect(integers.errors).toEqual([]);
		});

		it('should compute the arithmetic operators, division truncating', () => {
			expect(result.arithmetic).toEqual([10, 4, 21, 2, -2, 1, 27]);
		});

		it('should compute the unary operators', () => {
			expect(result.unary).toEqual([-7, 7, -8]);
		});

		it('should compare, loose and strict equality alike', () => {
			expect(result.comparisons).toEqual([
				false,
				true,
				true,
				false,
				true,
				true,
				false,
				true,
			]);
		});

		it('should compute the bit operators within the width', () => {
			expect(result.bits).toEqual([8, 14, 6, 255, 128, 1, 15, -4]);
		});

		it('should resolve a chain of declarations, one pass at a time', () => {
			expect(result.chained).toBe(190);
			expect(integers.rewritten).not.toMatch(/\bsum \* sum\b/);
		});

		it('should rewrite increments and compound assignments used as statements', () => {
			expect(result.afterStatements).toBe(12);
		});

		it('should give prefix and postfix their own values', () => {
			expect(result.postfixReturnsPrevious).toBe(10);
			expect(result.afterPostfix).toBe(11);
			expect(result.prefixReturnsNext).toBe(12);
			expect(result.postfixDecrement).toBe(12);
			expect(result.afterDecrement).toBe(11);
		});

		it('should evaluate the parts of an assignment target once', () => {
			expect(result.propertyTarget).toBe(5);
			expect(result.propertyReads).toBe(2);
			expect(result.elementTarget).toEqual([15, 6]);
			expect(result.elementIndex).toBe(1);
		});

		it('should rewrite a loop written with the operators', () => {
			expect(result.loopTotal).toBe(6);
		});

		it('should rewrite the widths carried by a bigint', () => {
			expect((result.wide as unknown[]).map(shown)).toEqual([
				'4611686018427387904n',
				'15n',
				'9007199254740994n',
			]);
		});

		it('should keep the checks of the operation an operator became', () => {
			expect(result.overflow as () => unknown).toThrow(
				'SignedInteger<32>.add: 2147483648 is outside [-2147483648, 2147483647].',
			);
			expect(result.negativeExponent as () => unknown).toThrow(
				'expected an exponent of zero or more',
			);
			expect(result.wideShift as () => unknown).toThrow(
				'expected a count from 0 to 7, received 8',
			);
			expect(result.unsignedNegation as () => unknown).toThrow(
				'UnsignedInteger<8>.negate',
			);
		});

		it('should keep every line where it was written', () => {
			expect(integers.rewritten.split('\n')).toHaveLength(
				integers.original.split('\n').length,
			);
		});

		it('should import the package once, on the line of the first statement', () => {
			expect(
				integers.rewritten.match(/import \* as __fulcroTypes/g),
			).toHaveLength(1);
			expect(integers.rewritten.split('\n')[0]).toMatch(
				/^import \* as __fulcroTypes from '@fulcro\/types'; import/,
			);
		});
	});

	describe('on the floats and BigInteger', () => {
		const floats = compile('floats');
		const result = floats.run();

		it('should type check every operator once rewritten', () => {
			expect(floats.errors).toEqual([]);
		});

		it('should round each single precision operation once', () => {
			expect(result.single).toEqual([
				0.30000001192092896, 0.10000000149011612, 0.020000001415610313, 2,
				0.8513399362564087,
			]);
		});

		it('should round half precision, ties to even', () => {
			expect(result.half).toEqual([1, 0, -1, true, true]);
			expect(result.halfIncrement).toBe(2048);
		});

		it('should leave double precision arithmetic as the operators compute it', () => {
			expect(result.double).toEqual([0.2, 0.010000000000000002, 0]);
		});

		it('should rewrite a BigInteger and name the operation that failed', () => {
			expect((result.integers as unknown[]).map(shown)).toEqual([
				'1267650600228229401496703205376n',
				'-3n',
				'-2n',
				true,
			]);
			expect(result.bigDivision as () => unknown).toThrow(
				'BigInteger.divide: division by zero.',
			);
		});
	});

	describe('on Decimal', () => {
		const decimal = compile('decimal');
		const result = decimal.run();

		it('should type check what plain tsc refuses', () => {
			expect(decimal.errors).toEqual([]);
		});

		it('should compute every arithmetic operator in decimal', () => {
			expect(result.arithmetic).toEqual([
				'59.97',
				'20',
				'0',
				'0.3333333333333333333333333333333333',
				'1.5',
				'1.21',
				'0.25',
				'-19.99',
				'19.99',
			]);
		});

		it('should compare by value, 0.1 + 0.2 === 0.3 included', () => {
			expect(result.comparisons).toEqual([true, true, true, true, true, true]);
		});

		it('should rewrite compound assignments and increments', () => {
			expect(result.accumulated).toBe('60.97');
			expect(result.postfix).toBe('1.5');
			expect(result.afterPostfix).toBe('0.5');
		});

		it('should concatenate a decimal with a string by its text', () => {
			expect(result.concatenated).toEqual(['total: 19.99', '19.99 each']);
		});

		it('should leave an equality with null as the identity check it is', () => {
			expect(result.identity).toEqual([true, false]);
			expect(decimal.rewritten).toContain('maybe === null');
		});

		it('should resolve a chain of decimal declarations', () => {
			expect(result.withTax).toBe('65.967');
		});
	});

	describe('on operands of different types', () => {
		const mixed = compile('mixed');

		/**
		 * The line of each error.
		 *
		 * @returns The lines, in order.
		 */
		const lines = (): number[] =>
			mixed.errors.map((error) => Number(error.split(':')[0]));

		it('should refuse each one at the line it was written on', () => {
			// A guard on the guard: with no marker left in the fixture, the
			// comparison below would pass over two empty lists.
			expect(markedLines('mixed')).toHaveLength(9);
			expect(lines()).toEqual(markedLines('mixed'));
		});

		it('should say which type was expected', () => {
			expect(mixed.errors[0]).toContain(
				"Argument of type 'number' is not assignable to parameter of type 'SignedInteger<32>'",
			);
			expect(mixed.errors[1]).toContain(
				"Argument of type 'SignedInteger<16>' is not assignable to parameter of type 'SignedInteger<32>'",
			);
			expect(mixed.errors[3]).toContain("parameter of type 'Decimal'");
		});

		it('should refuse the bit operators where the type has none', () => {
			expect(mixed.errors[5]).toContain(
				"Property 'bitwiseAnd' does not exist on type 'Decimal'",
			);
			expect(mixed.errors[6]).toContain("Property 'bitwiseOr' does not exist");
		});
	});

	describe('on a file with none of these types', () => {
		const untouched = compile('untouched');

		it('should leave it exactly as written', () => {
			expect(untouched.rewritten).toBe(untouched.original);
		});

		it('should still compute what the operators compute', () => {
			expect(untouched.errors).toEqual([]);
			expect(untouched.run().results).toEqual({
				area: 202,
				ids: [2n, 4n],
				label: 'area: 202',
				flag: true,
			});
		});
	});
});
