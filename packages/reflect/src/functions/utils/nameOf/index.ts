import { createError } from '@fulcro/errors';

import {
	ANONYMOUS_NAME,
	resolveCallableId,
	typeOf,
} from '@/functions/utils/typeOf';

/** Accessor returning the member whose name is being read. */
export type NameAccessor = () => unknown;

/** Strips the parameter list of an arrow function from its source. */
const ARROW_BODY_PATTERN = /^[^=]*=>\s*/;

/** Strips the header of a classic function expression from its source. */
const FUNCTION_BODY_PATTERN =
	/^\s*(?:async\s+)?function\s*\*?\s*[\w$]*\s*\([^)]*\)\s*\{\s*return\s+/;

/** Matches a trailing `.member` or `?.member` access. */
const MEMBER_PATTERN = /([A-Za-z_$][\w$]*)\s*$/;

/** Matches a trailing `['member']` access, quoted in any of the three ways. */
const INDEXED_MEMBER_PATTERN = /\[\s*(['"`])([^'"`]+)\1\s*\]\s*$/;

/**
 * Extracts the last member name out of the source of an accessor.
 *
 * @param accessor Accessor whose source is read.
 * @returns The name, or `null` when the source is not a member access.
 */
const parseAccessedName = (accessor: NameAccessor): string | null => {
	const source: string = Function.prototype.toString
		.call(accessor)
		.replace(FUNCTION_BODY_PATTERN, '')
		.replace(ARROW_BODY_PATTERN, '')
		.replace(/[;}\s]+$/, '')
		.trim();

	const indexed: RegExpMatchArray | null = source.match(INDEXED_MEMBER_PATTERN);

	if (indexed !== null) return indexed[2];

	const member: RegExpMatchArray | null = source.match(MEMBER_PATTERN);

	// A call, a literal or an expression is not a name to report.
	return member !== null && !source.endsWith(')') ? member[1] : null;
};

/**
 * Reads the name of whatever it is given, as written in the source.
 *
 * Two forms are accepted:
 *
 * ```ts
 * // An accessor, for variables, properties and methods. The name is read from
 * // the source of the closure, so the value itself is never evaluated for its
 * // name, and a deep path reports its last segment.
 * const email = 'a@b.c';
 * nameOf(() => email);          // 'email'
 * nameOf(() => user.profile);   // 'profile'
 * nameOf(() => user.save);      // 'save'
 * nameOf(() => user['email']);  // 'email'
 *
 * // A value, for classes and callables, which carry their own name.
 * nameOf(User);                 // 'User'
 * nameOf(() => {});             // '(anonymous)'
 * ```
 *
 * Two limits are worth knowing, both of them consequences of the language
 * rather than of this implementation:
 *
 * - **Interfaces and type aliases cannot be named.** They are erased by the
 *   compiler and leave nothing to read at runtime. Only a compile time
 *   transformer could report them.
 * - **A minifier renames local variables**, so `nameOf(() => email)` may report
 *   the mangled name in a bundled build. Property and method names normally
 *   survive minification, and so does the form taking a class.
 *
 * Anything else falls back to the name of its type, so the function always
 * answers with something usable: `nameOf(42)` reads `'Number'`.
 *
 * @param input Accessor naming a member, or a value to be named.
 * @returns The name that was read.
 */
export function nameOf<T>(): string;
export function nameOf(input: unknown): string;
export function nameOf(input?: unknown): string {
	// The type argument form carries no value at all: it exists to be replaced
	// by the transformer, which is the only thing able to see a type. Reaching
	// the runtime means the project compiled without it.
	if (arguments.length === 0) {
		throw createError('FULCRO4008');
	}

	if (typeof input === 'function') {
		// A class carries its own name and is never an accessor, so its body is
		// not worth reading — and reading it would misfire on any arrow
		// function written inside one of its methods.
		if (resolveCallableId(input as () => unknown) === 'class') {
			return input.name.length > 0 ? input.name : ANONYMOUS_NAME;
		}

		const accessed: string | null = parseAccessedName(input as NameAccessor);

		if (accessed !== null) return accessed;

		return input.name.length > 0 ? input.name : ANONYMOUS_NAME;
	}

	return typeOf(input).name;
}
