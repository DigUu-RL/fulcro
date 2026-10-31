import { describe, expect, it } from 'vitest';

import { createEquals, type EqualityRule } from '@/src/createEquals';

/**
 * Performance suite for `createEquals`.
 *
 * A variant asks each rule about a pair at most twice — once per value — and
 * asks no further rule once one recognises a value. It never asks any rule
 * about a value compared with itself. All of it is asserted by counting the
 * calls each rule receives.
 */

/** How many tokens each array holds. */
const TOKENS = 10_000;

/** A value with an identity, compared by a rule. */
class Token {
	readonly id: number;

	constructor(id: number) {
		this.id = id;
	}
}

/** What a rule was asked. */
interface Calls {
	is: number;
	equals: number;
}

/**
 * @param calls Counter of the calls the rule receives.
 * @returns A rule comparing tokens by id, counting every call.
 */
const tokensById = (calls: Calls): EqualityRule<Token> => {
	return {
		is: (value): value is Token => {
			calls.is++;

			return value instanceof Token;
		},
		equals: (left, right): boolean => {
			calls.equals++;

			return left.id === right.id;
		},
	};
};

/**
 * @param calls Counter of the calls the rule receives.
 * @returns A rule that recognises nothing, counting every call.
 */
const recognisingNothing = (calls: Calls): EqualityRule<never> => {
	return {
		is: (_value): _value is never => {
			calls.is++;

			return false;
		},
		equals: (): boolean => {
			calls.equals++;

			return false;
		},
	};
};

/**
 * @returns Tokens with the ids 0 to {@link TOKENS}, each a new object.
 */
const tokens = (): Token[] => Array.from({ length: TOKENS }, (_, id) => new Token(id));

describe('createEquals', () => {
	it('should ask a rule about each pair once per value, and compare it once', () => {
		const calls: Calls = { is: 0, equals: 0 };

		expect(createEquals([tokensById(calls)])(tokens(), tokens())).toBe(true);
		// Both arrays, then both tokens of every pair.
		expect(calls.is).toBe(2 + 2 * TOKENS);
		expect(calls.equals).toBe(TOKENS);
	});

	it('should ask no further rule once one recognises a value', () => {
		const first: Calls = { is: 0, equals: 0 };
		const second: Calls = { is: 0, equals: 0 };

		const variant = createEquals([tokensById(first), recognisingNothing(second)]);

		expect(variant(tokens(), tokens())).toBe(true);
		// Only the two arrays, which the first rule does not recognise, reach
		// the second.
		expect(second.is).toBe(2);
		expect(second.equals).toBe(0);
	});

	it('should ask no rule about a value compared with itself', () => {
		const calls: Calls = { is: 0, equals: 0 };
		const shared: Token[] = tokens();

		const variant = createEquals([tokensById(calls)]);

		expect(variant(shared, shared)).toBe(true);
		expect(calls.is).toBe(0);

		// Two arrays holding the same tokens: the arrays are asked about, the
		// tokens are not.
		expect(variant(shared, [...shared])).toBe(true);
		expect(calls.is).toBe(2);
		expect(calls.equals).toBe(0);
	});

	it('should stop asking at the first pair the rule finds unequal', () => {
		const calls: Calls = { is: 0, equals: 0 };
		const right: Token[] = tokens();

		right[10] = new Token(-1);

		expect(createEquals([tokensById(calls)])(tokens(), right)).toBe(false);
		expect(calls.equals).toBe(11);
	});
});
