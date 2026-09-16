/** An accessor reading a value, used only for the path written inside it. */
export type PathAccessor = () => unknown;

/** Strips the parameter list of an arrow function from its source. */
const ARROW_BODY_PATTERN = /^[^=]*=>\s*/;

/** Strips the header of a classic function expression from its source. */
const FUNCTION_BODY_PATTERN = /^function[^{]*\{\s*return\s*/;

/** A path made of identifiers, dots, and bracketed indices or string keys. */
const PATH_PATTERN =
	/^[A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*|\[\s*(?:\d+|'[^']*'|"[^"]*")\s*\])+/;

/** One bracketed segment, so a quoted key can become a dotted one. */
const BRACKET_PATTERN = /\[\s*(?:'([^']*)'|"([^"]*)"|(\d+))\s*\]/g;

/**
 * Reads the path written inside an accessor.
 *
 * @param accessor Accessor whose source is read.
 * @returns The path without its root, or `null` when the source is not one.
 */
const parsePath = (accessor: PathAccessor): string | null => {
	const source: string = Function.prototype.toString
		.call(accessor)
		.replace(FUNCTION_BODY_PATTERN, '')
		.replace(ARROW_BODY_PATTERN, '')
		.replace(/[;\s}]+$/, '')
		.trim();

	const matched: RegExpMatchArray | null = source.match(PATH_PATTERN);

	if (matched === null) return null;

	// A call is not a path: `user.save()` reads nothing, it does something.
	if (source.slice(matched[0].length).trimStart().startsWith('(')) return null;

	const normalised: string = matched[0]
		.replaceAll('?.', '.')
		// A quoted key becomes a dotted segment; a numeric index keeps its
		// brackets, since `items.0.sku` is not how anyone writes a path.
		.replace(BRACKET_PATTERN, (_whole, single, double, digits) =>
			digits === undefined ? `.${single ?? double}` : `[${digits}]`,
		);

	// The root is dropped. `pathOf(() => user.profile.email)` answers
	// `profile.email`, because the root is the thing the path is relative *to* —
	// a form object, a row, a document — and repeating its local variable name
	// would make the answer depend on what that variable happened to be called.
	const firstDot: number = normalised.indexOf('.');
	const firstBracket: number = normalised.indexOf('[');

	const cut: number =
		firstDot === -1
			? firstBracket
			: firstBracket === -1
				? firstDot
				: Math.min(firstDot, firstBracket);

	if (cut === -1) return null;

	return normalised.slice(cut).replace(/^\./, '');
};

/**
 * Reads the whole path an accessor walks, as written in the source.
 *
 * Where `nameOf` answers with the last segment, this answers with all of them:
 *
 * ```ts
 * nameOf(() => user.profile.email); // 'email'
 * pathOf(() => user.profile.email); // 'profile.email'
 * ```
 *
 * Which is what a form field, a database column, a sort key or a translation
 * key actually needs — the name alone loses where the value lives.
 *
 * The root is dropped, because the path is relative to it: the object being
 * described is the form, the row, the document, and repeating whatever the
 * local variable happened to be called would make the answer depend on that.
 *
 * ```ts
 * pathOf(() => order.customer.address.city); // 'customer.address.city'
 * pathOf(() => order.items[0].sku); // 'items[0].sku'
 * pathOf(() => order['customer'].email); // 'customer.email'
 * ```
 *
 * The accessor is **never invoked**. The path is read out of the source of the
 * closure, so this is safe on a getter with side effects and costs nothing to
 * evaluate.
 *
 * With the transformer it is resolved to a literal before a minifier can rename
 * anything. Without it, the source is parsed at runtime — which works, and
 * carries the same caveat `nameOf` does: a minifier renames local variables,
 * though property names normally survive, and the root is dropped here anyway.
 *
 * @param accessor Accessor walking the path.
 * @returns The path, or `null` when the accessor does not walk one.
 */
export const pathOf = (accessor: PathAccessor): string | null =>
	parsePath(accessor);
