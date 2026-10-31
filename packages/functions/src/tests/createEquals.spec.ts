import { readFileSync } from 'node:fs';
import * as path from 'node:path';

import { isFulcroError } from '@fulcro/errors';
import { describe, expect, it } from 'vitest';

import { createEquals, type EqualityRule, type Equals } from '@/src/createEquals';
import { compileFixture, COMPILERS, reportedLines } from '@/src/tests/compileFixture';

/** A value whose identity carries nothing: two with one key are the same user. */
class User {
	readonly id: number;
	readonly name: string;

	constructor(id: number, name: string) {
		this.id = id;
		this.name = name;
	}
}

/**
 * @param value Value to inspect.
 * @returns `true` for a user.
 */
const isUser = (value: unknown): value is User => value instanceof User;

/** Users compared by their key alone. */
const byId: EqualityRule<User> = {
	is: isUser,
	equals: (left, right) => left.id === right.id,
};

/** A tree whose children are compared by the variant they belong to. */
class Tree {
	readonly label: string;
	readonly children: Tree[] = [];

	constructor(label: string) {
		this.label = label;
	}
}

const byLabelAndChildren: EqualityRule<Tree> = {
	is: (value): value is Tree => value instanceof Tree,
	equals: (left, right, nested) => {
		return left.label === right.label && nested(left.children, right.children);
	},
};

/**
 * Runs a variant creation and returns what it threw.
 *
 * @param rules What `createEquals` is handed, as a JavaScript caller may.
 * @returns The error.
 */
const refusal = (rules: unknown): unknown => {
	try {
		createEquals(rules as readonly EqualityRule<unknown>[]);
	} catch (error) {
		return error;
	}

	throw new Error('createEquals accepted the rules');
};

describe('createEquals', () => {
	describe('with a rule', () => {
		const sameUser: Equals = createEquals([byId]);

		it('should compare the values it recognises by the rule', () => {
			expect(sameUser(new User(1, 'ada'), new User(1, 'Ada Lovelace'))).toBe(true);
			expect(sameUser(new User(1, 'ada'), new User(2, 'ada'))).toBe(false);
		});

		it('should compare everything else as equals does', () => {
			expect(sameUser([new User(1, 'ada')], [new User(1, 'Ada')])).toBe(true);
			expect(sameUser({ owner: new User(1, 'ada') }, { owner: new User(1, 'Ada') })).toBe(true);
			expect(sameUser([1, 2], [1, 2])).toBe(true);
		});

		it('should refuse a value it recognises against one it does not', () => {
			expect(sameUser<unknown>(new User(1, 'ada'), { id: 1, name: 'ada' })).toBe(false);
			expect(sameUser<unknown>({ id: 1, name: 'ada' }, new User(1, 'ada'))).toBe(false);
		});

		it('should never ask the rule about a value and itself', () => {
			const never: EqualityRule<User> = { is: isUser, equals: () => false };
			const ada = new User(1, 'ada');

			expect(createEquals([never])(ada, ada)).toBe(true);
		});
	});

	describe('with several rules', () => {
		it('should let the first rule that recognises a value decide', () => {
			const byName: EqualityRule<User> = {
				is: isUser,
				equals: (left, right) => left.name === right.name,
			};

			expect(createEquals([byId, byName])(new User(1, 'ada'), new User(1, 'grace'))).toBe(true);
			expect(createEquals([byName, byId])(new User(1, 'ada'), new User(1, 'grace'))).toBe(false);
		});

		it('should take over a kind equals already compares', () => {
			const byDay: EqualityRule<Date> = {
				is: (value): value is Date => value instanceof Date,
				equals: (left, right) => left.toDateString() === right.toDateString(),
			};

			const sameDay: Equals = createEquals([byDay]);

			expect(sameDay(new Date(2026, 9, 30, 8), new Date(2026, 9, 30, 20))).toBe(true);
			expect(sameDay(new Date(2026, 9, 30), new Date(2026, 9, 31))).toBe(false);
		});

		it('should compare primitives a rule recognises by the rule', () => {
			const ignoringCase: EqualityRule<string> = {
				is: (value): value is string => typeof value === 'string',
				equals: (left, right) => left.toLowerCase() === right.toLowerCase(),
			};

			expect(createEquals([ignoringCase])({ name: 'Ada' }, { name: 'ADA' })).toBe(true);
		});
	});

	describe('with a rule that compares what its values hold', () => {
		const sameTree: Equals = createEquals([byLabelAndChildren]);

		/**
		 * @returns A root with two children, the second holding a grandchild.
		 */
		const sample = (): Tree => {
			const root = new Tree('root');
			const second = new Tree('second');

			second.children.push(new Tree('grandchild'));
			root.children.push(new Tree('first'), second);

			return root;
		};

		it('should compare the values inside through the variant', () => {
			expect(sameTree(sample(), sample())).toBe(true);
		});

		it('should find a difference deep inside', () => {
			const changed: Tree = sample();

			changed.children.at(-1)?.children.push(new Tree('extra'));

			expect(sameTree(sample(), changed)).toBe(false);
		});

		it('should compare trees that hold themselves', () => {
			const left = new Tree('loop');
			const right = new Tree('loop');

			left.children.push(left);
			right.children.push(right);

			expect(sameTree(left, right)).toBe(true);
		});
	});

	describe('with a rule written as a class', () => {
		it('should call its members on the rule', () => {
			class Tolerance implements EqualityRule<number> {
				readonly #margin: number;

				constructor(margin: number) {
					this.#margin = margin;
				}

				is(value: unknown): value is number {
					return typeof value === 'number';
				}

				equals(left: number, right: number): boolean {
					return Math.abs(left - right) <= this.#margin;
				}
			}

			expect(createEquals([new Tolerance(0.01)])([1, 2], [1.001, 2.005])).toBe(true);
		});
	});

	describe('when a rule throws', () => {
		it('should propagate the error', () => {
			const broken: EqualityRule<User> = {
				is: isUser,
				equals: () => {
					throw new RangeError('broken rule');
				},
			};

			expect(() => createEquals([broken])(new User(1, 'ada'), new User(1, 'ada'))).toThrow(
				RangeError,
			);
		});
	});

	describe('after it was made', () => {
		it('should keep the rules it was given, whatever happens to the list', () => {
			const rules: EqualityRule<unknown>[] = [byId];
			const sameUser: Equals = createEquals(rules);

			rules.length = 0;

			expect(sameUser(new User(1, 'ada'), new User(1, 'grace'))).toBe(true);
		});

		it('should keep the members it read, whatever happens to the rule', () => {
			const rule: { is: (value: unknown) => value is User; equals: () => boolean } = {
				is: isUser,
				equals: (): boolean => true,
			};

			const sameUser: Equals = createEquals([rule]);

			rule.equals = (): boolean => false;

			expect(sameUser(new User(1, 'ada'), new User(2, 'grace'))).toBe(true);
		});
	});

	describe('given what is not a list of rules', () => {
		it.each([
			['undefined', undefined],
			['null', null],
			['an object', byId],
		])('should refuse %s', (kind, rules) => {
			const error: unknown = refusal(rules);

			expect(error).toBeInstanceOf(TypeError);
			expect(isFulcroError(error, 'FULCRO2002')).toBe(true);

			if (isFulcroError(error, 'FULCRO2002')) {
				expect(error.details).toEqual({
					operation: 'createEquals',
					received: kind === 'an object' ? 'object' : kind,
				});
			}
		});
	});

	describe('given a rule that is not one', () => {
		/** Stands for any member that is a function. */
		const always = (): boolean => true;

		it.each([
			['a rule without is', [byId, { equals: always }], 1, 'is', 'undefined'],
			['a rule without equals', [{ is: always }], 0, 'equals', 'undefined'],
			['an is that is not a function', [{ is: true, equals: always }], 0, 'is', 'boolean'],
			['a rule that is a number', [7], 0, 'is', 'undefined'],
			['a rule that is null', [null], 0, 'is', 'undefined'],
		] as const)('should refuse %s', (_label, rules, index, member, received) => {
			const error: unknown = refusal(rules);

			expect(error).toBeInstanceOf(TypeError);
			expect(isFulcroError(error, 'FULCRO2003')).toBe(true);

			if (isFulcroError(error, 'FULCRO2003')) {
				expect(error.details).toEqual({ operation: 'createEquals', index, member, received });

				expect(error.message).toBe(
					`FULCRO2003: createEquals: rule ${String(index)} needs '${member}' to be a function, received ${received}.`,
				);
			}
		});
	});
});

/** Fixture fed to the compilers. */
const FIXTURE = 'equals.fixture.ts';

/** Lines of the fixture carrying the refusal marker, 1-based. */
const REFUSED: number[] = readFileSync(path.resolve(__dirname, FIXTURE), 'utf8')
	.split('\n')
	.flatMap((line, index) => (line.trimEnd().endsWith('// refused') ? [index + 1] : []));

describe.each(COMPILERS)('equals and createEquals at compile time, on %s', (_label, name) => {
	const report: string = compileFixture(FIXTURE, name);

	it('should have something to refuse', () => {
		expect(REFUSED).toHaveLength(3);
	});

	it('should refuse exactly the marked lines', () => {
		// Two values that can never be equal, a rule without `equals` and a rule
		// whose member is not a function, each refused; the rules over a type
		// of their own and the descriptor above them, accepted.
		expect(reportedLines(report, FIXTURE)).toEqual(REFUSED);
	});
});
