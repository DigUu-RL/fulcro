import { createError } from '@fulcro/errors';

import { compareStructures, sameValueZero } from '@/src/createEquals/structure';

/**
 * Tells whether two values are equal: what {@link equals} is, and what
 * {@link createEquals} returns.
 *
 * `right` takes its type from `left`, so two values that could never be equal
 * — a number and a string — do not compile.
 *
 * @template T Type of the values compared.
 */
export type Equals = <T>(left: T, right: NoInfer<T>) => boolean;

/**
 * How one kind of value is compared, in a variant of {@link equals} made by
 * {@link createEquals}.
 *
 * ```ts
 * const byId: EqualityRule<User> = {
 * 	is: (value): value is User => value instanceof User,
 * 	equals: (left, right) => left.id === right.id,
 * };
 * ```
 *
 * The descriptor of every type of `@fulcro/types` is already one — a struct, a
 * matrix, a fraction — since each recognises its values with `is` and compares
 * them with `equals`.
 *
 * @template T Type of the values the rule compares.
 */
export interface EqualityRule<T> {
	// Methods rather than properties holding functions, on purpose: a method's
	// parameters are compared both ways, so a rule over `User`, or a descriptor
	// whose `equals` takes its own values, is accepted where a list of rules
	// over `unknown` is asked for — with no `any` in sight. As properties, a
	// rule taking a `User` would be refused for not taking every value.

	/**
	 * Tells whether a value is one this rule compares.
	 *
	 * @param value Value to inspect.
	 * @returns `true` when it is.
	 */
	is(value: unknown): value is T;

	/**
	 * Compares two values this rule recognised, which are never the same
	 * value: a value always equals itself, before any rule is asked.
	 *
	 * @param left First value.
	 * @param right Second value.
	 * @param nested The variant this rule belongs to, for the values inside
	 * these two — it keeps track of what is already being compared, so a
	 * structure that refers to itself is compared once.
	 * @returns `true` when they are equal.
	 */
	equals(left: T, right: T, nested: Equals): boolean;
}

/** A member of a rule, as a JavaScript caller may have written it. */
type RuleMember = (this: unknown, ...values: unknown[]) => unknown;

/** A rule, with its members read once, when the variant was made. */
interface CapturedRule {
	/** What the members are called on, so a rule written as a class works. */
	readonly owner: unknown;
	readonly is: RuleMember;
	readonly equals: RuleMember;
}

/** The pairs being compared, each left object to the right ones it is being compared with. */
type InProgress = Map<object, Set<object>>;

/** Name of the operation, as error messages report it. */
const OPERATION = 'createEquals';

/**
 * Describes a value for an error message.
 *
 * @param value Value being reported.
 * @returns Its kind.
 */
const describeKind = (value: unknown): string => (value === null ? 'null' : typeof value);

/**
 * Reads a member of a rule, refusing one that is not a function.
 *
 * @param rule Rule as received.
 * @param index Its position in the list.
 * @param member Member to read.
 * @returns The member.
 * @throws {TypeError} When the member is not a function.
 */
const requireMember = (rule: unknown, index: number, member: 'is' | 'equals'): RuleMember => {
	// Read as what a JavaScript caller can actually pass, which the type rules out.
	const received: unknown = (rule as Readonly<Record<string, unknown>> | null | undefined)?.[
		member
	];

	if (typeof received !== 'function') {
		throw createError('FULCRO2003', {
			operation: OPERATION,
			index,
			member,
			received: describeKind(received),
		});
	}

	return received as RuleMember;
};

/**
 * Checks the rules and reads their members once, so that changing the list or
 * a rule afterwards changes nothing about the variant already made.
 *
 * @param rules Rules as received.
 * @returns The rules, captured.
 * @throws {TypeError} When `rules` is not an array, or a rule lacks `is` or
 * `equals`.
 */
const captureRules = (rules: unknown): readonly CapturedRule[] => {
	if (!Array.isArray(rules)) {
		throw createError('FULCRO2002', { operation: OPERATION, received: describeKind(rules) });
	}

	return Object.freeze(
		(rules as readonly unknown[]).map((rule, index) => {
			return Object.freeze({
				owner: rule,
				is: requireMember(rule, index, 'is'),
				equals: requireMember(rule, index, 'equals'),
			});
		}),
	);
};

/**
 * @param value Value to inspect.
 * @returns `true` for an object, `null` excluded.
 */
const isObject = (value: unknown): value is object => typeof value === 'object' && value !== null;

/**
 * Makes a variant of {@link equals} that compares some kinds of value by rules
 * of your own.
 *
 * ```ts
 * const sameUser = createEquals([byId]);
 *
 * sameUser([alice], [aliceAgain]); // true: the arrays as `equals` compares them, users by id
 * ```
 *
 * Two values are compared in this order:
 *
 * 1. The same value is always equal to itself, whatever a rule would say.
 * 2. The first rule that recognises either value decides: by its `equals`
 *    when it recognises both, and as unequal when it recognises only one. The
 *    rules after it are not asked.
 * 3. Otherwise, as {@link equals} compares them.
 *
 * So a rule can take over a kind `equals` already handles — dates compared by
 * day, say — and a struct passed as a rule is never equal to a plain object
 * that merely has its fields.
 *
 * A rule's members are read once, here; a rule that throws makes the
 * comparison throw.
 *
 * @param rules How each kind of value is compared, in the order they are asked.
 * @returns The variant.
 * @throws {TypeError} When `rules` is not an array, or a rule's `is` or
 * `equals` is not a function.
 */
export const createEquals = (rules: readonly EqualityRule<unknown>[]): Equals => {
	const captured: readonly CapturedRule[] = captureRules(rules);

	return (left, right) => {
		// Made only when the first two objects are reached, so comparing
		// primitives allocates nothing for it.
		let inProgress: InProgress | undefined;

		/**
		 * Decides two distinct values: by a rule, or by their contents.
		 *
		 * @param first First value.
		 * @param second Second value.
		 * @returns `true` when they are equal.
		 */
		const decide = (first: unknown, second: unknown): boolean => {
			for (const rule of captured) {
				const firstIs = Boolean(rule.is.call(rule.owner, first));
				const secondIs = Boolean(rule.is.call(rule.owner, second));

				if (firstIs || secondIs) {
					return (
						firstIs && secondIs && Boolean(rule.equals.call(rule.owner, first, second, nested))
					);
				}
			}

			if (isObject(first) && isObject(second)) return compareStructures(first, second, compare);

			return sameValueZero(first, second);
		};

		/**
		 * Compares two values, assuming equal a pair already being compared
		 * further up: a structure that refers to itself is equal to another
		 * when nothing else in them differs.
		 *
		 * @param first First value.
		 * @param second Second value.
		 * @returns `true` when they are equal.
		 */
		const compare = (first: unknown, second: unknown): boolean => {
			if (Object.is(first, second)) return true;
			if (!isObject(first) || !isObject(second)) return decide(first, second);

			inProgress ??= new Map();

			let seconds: Set<object> | undefined = inProgress.get(first);

			if (seconds?.has(second)) return true;

			if (seconds === undefined) {
				seconds = new Set();
				inProgress.set(first, seconds);
			}

			seconds.add(second);

			try {
				return decide(first, second);
			} finally {
				seconds.delete(second);
			}
		};

		const nested: Equals = compare;

		return compare(left, right);
	};
};
