/**
 * Every error a package creates comes from `@fulcro/errors`, with a code from
 * that package's own range.
 *
 * The type system already refuses an unregistered code and a code declared
 * outside its range in the catalog. What it cannot see is the two ways around
 * the catalog altogether — `new Error(...)` and a thrown string — and a
 * registered code used from the wrong package, which compiles fine and tells
 * whoever reads it to look in the wrong place.
 *
 * Rethrowing what was caught is untouched: an error that is somebody else's
 * stays theirs.
 */

/**
 * The leading digit of each package's range, by its directory under
 * `packages/`. A code is never moved between ranges, and a new package gets
 * the next digit when it is created.
 */
export const PACKAGE_RANGES = {
	collections: '1',
	functions: '2',
	parallel: '3',
	reflect: '4',
	'transform-core': '5',
	types: '6',
};

/** A constructor the language provides for an error, by name. */
const ERROR_CLASS = /^(?:\w*Error)$/;

/** A code as the catalog spells it. */
const CODE = /^FULCRO(\d)\d{3}$/;

/**
 * Reads the package a file belongs to from its path.
 *
 * @param {string} filename Path of the file being linted.
 * @returns {string | null} The directory under `packages/`, or `null`.
 */
const packageOf = (filename) => {
	// Either separator, and relative or absolute: ESLint hands over whatever
	// path it was given, and a path that failed to match would skip the range
	// check without a word.
	const match = /(?:^|[\\/])packages[\\/]([^\\/]+)[\\/]src[\\/]/.exec(filename);

	return match === null ? null : match[1];
};

/** @type {import('eslint').Rule.RuleModule} */
export const codedErrors = {
	meta: {
		type: 'problem',
		schema: [],
		messages: {
			constructed:
				"'new {{name}}(...)' bypasses the catalog. Register the error in @fulcro/errors and create it with createError(code, ...values).",
			thrownText:
				'A thrown string carries no code and no class. Register the error in @fulcro/errors and throw createError(code, ...values).',
			otherRange:
				'{{code}} belongs to the range FULCRO{{found}}xxx, and this file is in @fulcro/{{package}}, whose range is FULCRO{{expected}}xxx.',
			noRange:
				'@fulcro/{{package}} has no error range assigned. Add it to PACKAGE_RANGES in tools/eslint/coded-errors.mjs before it throws anything.',
		},
	},

	create(context) {
		const directory = packageOf(context.filename);

		return {
			NewExpression(node) {
				if (node.callee.type !== 'Identifier') return;
				if (!ERROR_CLASS.test(node.callee.name)) return;

				context.report({
					node,
					messageId: 'constructed',
					data: { name: node.callee.name },
				});
			},

			ThrowStatement(node) {
				const { argument } = node;

				if (argument.type === 'TemplateLiteral') {
					context.report({ node, messageId: 'thrownText' });
					return;
				}

				if (argument.type === 'Literal' && typeof argument.value === 'string') {
					context.report({ node, messageId: 'thrownText' });
				}
			},

			CallExpression(node) {
				if (node.callee.type !== 'Identifier') return;
				if (node.callee.name !== 'createError') return;

				const [first] = node.arguments;

				// A code passed through a variable is narrowed by the types to the
				// codes that variable can hold, which the compiler already checked.
				if (first?.type !== 'Literal' || typeof first.value !== 'string') {
					return;
				}

				const match = CODE.exec(first.value);

				if (match === null || directory === null) return;

				const expected = PACKAGE_RANGES[directory];

				if (expected === undefined) {
					context.report({
						node: first,
						messageId: 'noRange',
						data: { package: directory },
					});
					return;
				}

				if (match[1] !== expected) {
					context.report({
						node: first,
						messageId: 'otherRange',
						data: {
							code: first.value,
							found: match[1],
							expected,
							package: directory,
						},
					});
				}
			},
		};
	},
};
