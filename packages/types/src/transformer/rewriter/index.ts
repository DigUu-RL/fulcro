import typescript from 'typescript';

import {
	type ExpressionContext,
	type ExpressionRewriter,
	type Replacement,
} from '@fulcro/transform-core';

import { classify, type NumericKind } from '@/transformer/classify';

/**
 * The rewrite of the JavaScript operators on this package's numeric types.
 *
 * Every operator becomes a call to the operation that means it for the type —
 * `a + b` on two `SignedInteger<32>` becomes `SignedInteger(32).add(a, b)`,
 * checked for overflow; on two `Decimal`, `a.add(b)`. The call is what the
 * checker then sees, so the result keeps its type, and an operand of any other
 * type fails to type check as an argument: that is how "the same type only" is
 * enforced, with the checker's own message at the site.
 *
 * | Written                                          | Becomes                        |
 * | ------------------------------------------------ | ------------------------------ |
 * | `a + b`, `-`, `*`, `/`, `%`, `**`                | `T.add(a, b)` …                |
 * | `a & b`, `\|`, `^`, `<<`, `>>`, `>>>`            | `T.bitwiseAnd(a, b)` …         |
 * | `a < b`, `<=`, `>`, `>=`                         | `T.lessThan(a, b)` …           |
 * | `a === b`, `==`, `!==`, `!=`                     | `T.equals(a, b)`, negated      |
 * | `-a`, `+a`, `~a`                                 | `T.negate(a)`, `a`, `T.bitwiseNot(a)` |
 * | `++a`, `a++`, `--a`, `a--`                       | `T.increment` / `T.decrement`  |
 * | `a += b` and every compound assignment           | `a = T.add(a, b)` …            |
 *
 * Evaluation order and the value of each expression are those of the operator
 * it replaces: a compound assignment evaluates its target once, and a postfix
 * operator evaluates to the value before the change.
 */

/** Module every rewritten file imports, and the name it is imported under. */
const MODULE = '@fulcro/types';
const NAMESPACE = '__fulcroTypes';

/** The operation each binary operator stands for. */
const BINARY_OPERATIONS: ReadonlyMap<typescript.SyntaxKind, string> = new Map([
	[typescript.SyntaxKind.PlusToken, 'add'],
	[typescript.SyntaxKind.MinusToken, 'subtract'],
	[typescript.SyntaxKind.AsteriskToken, 'multiply'],
	[typescript.SyntaxKind.SlashToken, 'divide'],
	[typescript.SyntaxKind.PercentToken, 'remainder'],
	[typescript.SyntaxKind.AsteriskAsteriskToken, 'power'],
	[typescript.SyntaxKind.AmpersandToken, 'bitwiseAnd'],
	[typescript.SyntaxKind.BarToken, 'bitwiseOr'],
	[typescript.SyntaxKind.CaretToken, 'bitwiseXor'],
	[typescript.SyntaxKind.LessThanLessThanToken, 'shiftLeft'],
	[typescript.SyntaxKind.GreaterThanGreaterThanToken, 'shiftRight'],
	[
		typescript.SyntaxKind.GreaterThanGreaterThanGreaterThanToken,
		'shiftRightLogical',
	],
	[typescript.SyntaxKind.LessThanToken, 'lessThan'],
	[typescript.SyntaxKind.LessThanEqualsToken, 'lessThanOrEqual'],
	[typescript.SyntaxKind.GreaterThanToken, 'greaterThan'],
	[typescript.SyntaxKind.GreaterThanEqualsToken, 'greaterThanOrEqual'],
]);

/** The operation each compound assignment applies before assigning. */
const COMPOUND_OPERATIONS: ReadonlyMap<typescript.SyntaxKind, string> = new Map(
	[
		[typescript.SyntaxKind.PlusEqualsToken, 'add'],
		[typescript.SyntaxKind.MinusEqualsToken, 'subtract'],
		[typescript.SyntaxKind.AsteriskEqualsToken, 'multiply'],
		[typescript.SyntaxKind.SlashEqualsToken, 'divide'],
		[typescript.SyntaxKind.PercentEqualsToken, 'remainder'],
		[typescript.SyntaxKind.AsteriskAsteriskEqualsToken, 'power'],
		[typescript.SyntaxKind.AmpersandEqualsToken, 'bitwiseAnd'],
		[typescript.SyntaxKind.BarEqualsToken, 'bitwiseOr'],
		[typescript.SyntaxKind.CaretEqualsToken, 'bitwiseXor'],
		[typescript.SyntaxKind.LessThanLessThanEqualsToken, 'shiftLeft'],
		[typescript.SyntaxKind.GreaterThanGreaterThanEqualsToken, 'shiftRight'],
		[
			typescript.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
			'shiftRightLogical',
		],
	],
);

/** Equality operators, and whether each is negated. */
const EQUALITY: ReadonlyMap<typescript.SyntaxKind, boolean> = new Map([
	[typescript.SyntaxKind.EqualsEqualsEqualsToken, false],
	[typescript.SyntaxKind.EqualsEqualsToken, false],
	[typescript.SyntaxKind.ExclamationEqualsEqualsToken, true],
	[typescript.SyntaxKind.ExclamationEqualsToken, true],
]);

/** One operand of an emitted call: a node rendered in turn, or text. */
type Operand = string | typescript.Node;

/**
 * The call applying an operation to operands, in the form the kind uses.
 *
 * @param kind Kind the operation belongs to.
 * @param operation Name of the operation.
 * @param operands Its operands, in order.
 * @param separator What goes between two operands, line breaks included.
 * @param leftIsOurs Whether the first operand is of the kind — for a decimal,
 * whether the method can be called on it.
 * @returns The replacement.
 */
const call = (
	kind: NumericKind,
	operation: string,
	operands: readonly Operand[],
	separator = ', ',
	leftIsOurs = true,
): Operand[] => {
	if (kind.family === 'descriptor') {
		return [
			`${NAMESPACE}.${kind.descriptor}.${operation}(`,
			...interleave(operands, separator),
			')',
		];
	}

	const [receiver, ...rest] = operands;

	if (!leftIsOurs) {
		// The method cannot be called on an operand that is not a decimal, and
		// the checker has to say so at the site: a function taking two
		// decimals makes it.
		return [
			`((__left: ${NAMESPACE}.Decimal, __right: ${NAMESPACE}.Decimal) => __left.${operation}(__right))(`,
			...interleave(operands, separator),
			')',
		];
	}

	return [
		'(',
		receiver,
		`).${operation}(`,
		...interleave(rest, separator),
		')',
	];
};

/**
 * Puts a separator between operands.
 *
 * @param operands Operands, in order.
 * @param separator What goes between two of them.
 * @returns The operands with separators.
 */
const interleave = (
	operands: readonly Operand[],
	separator: string,
): Operand[] =>
	operands.flatMap((operand, index) =>
		index === 0 ? [operand] : [separator, operand],
	);

/**
 * One, as the kind writes it, for `++` and `--` on a decimal.
 *
 * @returns The expression.
 */
const decimalOne = (): string => `${NAMESPACE}.Decimal.from(1)`;

/**
 * The increment or decrement of an operand, as the kind computes it.
 *
 * @param kind Kind of the operand.
 * @param increment Whether it goes up.
 * @param operand The operand.
 * @returns The replacement.
 */
const step = (
	kind: NumericKind,
	increment: boolean,
	operand: Operand,
): Operand[] =>
	kind.family === 'descriptor'
		? call(kind, increment ? 'increment' : 'decrement', [operand])
		: call(kind, increment ? 'add' : 'subtract', [operand, decimalOne()]);

/**
 * Strips the parentheses around an expression.
 *
 * @param expression Expression, possibly parenthesized.
 * @returns The expression inside.
 */
const unwrap = (expression: typescript.Expression): typescript.Expression =>
	typescript.isParenthesizedExpression(expression)
		? unwrap(expression.expression)
		: expression;

/**
 * Tells whether an expression can be evaluated twice without anything
 * observable happening: a name, `this`, or a literal.
 *
 * @param expression Expression to inspect.
 * @returns `true` when evaluating it again is harmless.
 */
const isInert = (expression: typescript.Expression): boolean =>
	typescript.isIdentifier(expression) ||
	expression.kind === typescript.SyntaxKind.ThisKeyword ||
	typescript.isLiteralExpression(expression);

/**
 * How an assignment target is written back to, evaluating its parts once.
 *
 * A name, or a member of a name, is written twice as it stands. Any other
 * member — `items[next()]`, `load().total` — is evaluated once into the
 * parameters of an arrow function called on the spot, which is also what keeps
 * the order of evaluation JavaScript's.
 *
 * @param target The target, parentheses stripped.
 * @returns How to wrap an assignment to it.
 */
const assignmentForm = (
	target: typescript.Expression,
): {
	/** The target as the body reads and writes it. */
	readonly reference: Operand;

	/** Opening of the wrapper, with the parameters of the arrow. */
	readonly open: Operand[];

	/** Closing of the wrapper, with the arguments of the call. */
	readonly close: Operand[];
} => {
	if (
		typescript.isPropertyAccessExpression(target) &&
		!isInert(target.expression)
	) {
		return {
			reference: `__target.${target.name.text}`,
			open: ['((__target) => ('],
			close: ['))(', target.expression, ')'],
		};
	}

	if (
		typescript.isElementAccessExpression(target) &&
		!(isInert(target.expression) && isInert(target.argumentExpression))
	) {
		return {
			reference: '__target[__key]',
			open: ['((__target, __key) => ('],
			close: ['))(', target.expression, ', ', target.argumentExpression, ')'],
		};
	}

	return { reference: target, open: ['('], close: [')'] };
};

/**
 * Tells whether a type is one a string concatenation would produce, which
 * `+` then means instead of addition.
 *
 * @param type Type of an operand.
 * @returns `true` for a string.
 */
const isString = (type: typescript.Type): boolean =>
	(type.flags & typescript.TypeFlags.StringLike) !== 0;

/**
 * Tells whether a type is a plain number or bigint — the kind of operand an
 * equality with one of ours has to refuse, rather than leave to a comparison
 * that would quietly succeed.
 *
 * @param type Type of an operand.
 * @returns `true` for a number or a bigint.
 */
const isNumeric = (type: typescript.Type): boolean =>
	(type.flags &
		(typescript.TypeFlags.NumberLike | typescript.TypeFlags.BigIntLike)) !==
	0;

/**
 * Rewrites a binary expression.
 *
 * @param node The expression.
 * @param context The file and its checker.
 * @returns The replacement, or `null`.
 */
const rewriteBinary = (
	node: typescript.BinaryExpression,
	context: ExpressionContext,
): Replacement | null => {
	const { checker } = context;
	const operator: typescript.SyntaxKind = node.operatorToken.kind;
	const leftType: typescript.Type = checker.getTypeAtLocation(node.left);
	const rightType: typescript.Type = checker.getTypeAtLocation(node.right);
	const left: NumericKind | null = classify(leftType, checker, node.left);
	const right: NumericKind | null = classify(rightType, checker, node.right);
	const kind: NumericKind | null = left ?? right;

	if (kind === null) return null;

	const separator = `, ${context.lineBreaks(node.left.end, node.right.getStart(context.sourceFile))}`;

	const compound: string | undefined = COMPOUND_OPERATIONS.get(operator);

	if (compound !== undefined) {
		const target: typescript.Expression = unwrap(node.left);
		const form = assignmentForm(target);

		return [
			...form.open,
			form.reference,
			' = ',
			...call(
				kind,
				compound,
				[form.reference, node.right],
				separator,
				left !== null,
			),
			...form.close,
		];
	}

	const negated: boolean | undefined = EQUALITY.get(operator);

	if (negated !== undefined) {
		// An equality with something that is not a number at all — `null`, an
		// object — is a question about identity, and stays one.
		const comparable: boolean =
			(left !== null || isNumeric(leftType)) &&
			(right !== null || isNumeric(rightType));

		if (!comparable) return null;

		const equals: Operand[] = call(
			kind,
			'equals',
			[node.left, node.right],
			separator,
			left !== null,
		);

		return negated ? ['(!', ...equals, ')'] : equals;
	}

	const operation: string | undefined = BINARY_OPERATIONS.get(operator);

	if (operation === undefined) return null;

	if (
		operator === typescript.SyntaxKind.PlusToken &&
		(isString(leftType) || isString(rightType))
	) {
		// Concatenation, not addition. A primitive-backed value concatenates as
		// a number does; a decimal refuses the implicit conversion, so its text
		// is asked for explicitly.
		if (kind.family !== 'decimal') return null;

		const text = (operand: typescript.Node, ours: boolean): Operand[] =>
			ours ? ['(', operand, ').toString()'] : [operand];

		return [
			...text(node.left, left !== null),
			` + ${context.lineBreaks(node.left.end, node.right.getStart(context.sourceFile))}`,
			...text(node.right, right !== null),
		];
	}

	return call(
		kind,
		operation,
		[node.left, node.right],
		separator,
		left !== null,
	);
};

/**
 * Rewrites an increment or a decrement, written before or after its operand.
 *
 * @param node The expression.
 * @param operand Its operand.
 * @param increment Whether it goes up.
 * @param postfix Whether it was written after the operand.
 * @param context The file and its checker.
 * @returns The replacement, or `null`.
 */
const rewriteStep = (
	node: typescript.Node,
	operand: typescript.Expression,
	increment: boolean,
	postfix: boolean,
	context: ExpressionContext,
): Replacement | null => {
	const kind: NumericKind | null = classify(
		context.checker.getTypeAtLocation(operand),
		context.checker,
		operand,
	);

	if (kind === null) return null;

	const target: typescript.Expression = unwrap(operand);
	const form = assignmentForm(target);

	// Where the value of the expression is thrown away — a statement of its
	// own, the step of a `for` — the prefix form does the same work.
	const valueUnused: boolean =
		typescript.isExpressionStatement(node.parent) ||
		(typescript.isForStatement(node.parent) &&
			node.parent.incrementor === node);

	if (!postfix || valueUnused) {
		return [
			...form.open,
			form.reference,
			' = ',
			...step(kind, increment, form.reference),
			...form.close,
		];
	}

	// The value before the step is taken once, as a default parameter, so the
	// target is read once and the expression still evaluates to it.
	if (typeof form.reference === 'string') {
		const [head] = form.open;
		const parameters: string = (head as string).replace(
			') => (',
			`, __previous = ${form.reference}) => (`,
		);

		return [
			parameters,
			'(',
			form.reference,
			' = ',
			...step(kind, increment, '__previous'),
			'), __previous',
			...form.close,
		];
	}

	return [
		'((__previous) => ((',
		target,
		' = ',
		...step(kind, increment, '__previous'),
		'), __previous))(',
		target,
		')',
	];
};

/**
 * Rewrites a unary expression written before its operand.
 *
 * @param node The expression.
 * @param context The file and its checker.
 * @returns The replacement, or `null`.
 */
const rewritePrefix = (
	node: typescript.PrefixUnaryExpression,
	context: ExpressionContext,
): Replacement | null => {
	switch (node.operator) {
		case typescript.SyntaxKind.PlusPlusToken:
			return rewriteStep(node, node.operand, true, false, context);
		case typescript.SyntaxKind.MinusMinusToken:
			return rewriteStep(node, node.operand, false, false, context);
	}

	const kind: NumericKind | null = classify(
		context.checker.getTypeAtLocation(node.operand),
		context.checker,
		node.operand,
	);

	if (kind === null) return null;

	switch (node.operator) {
		case typescript.SyntaxKind.MinusToken:
			return call(kind, 'negate', [node.operand]);
		case typescript.SyntaxKind.TildeToken:
			return call(kind, 'bitwiseNot', [node.operand]);
		case typescript.SyntaxKind.PlusToken:
			// The identity, which on a `number` would still widen the type.
			return ['(', node.operand, ')'];
		default:
			return null;
	}
};

/** The rewriter of the operators on this package's numeric types. */
export const OPERATOR_REWRITER: ExpressionRewriter = {
	module: MODULE,
	namespace: NAMESPACE,

	rewrite: (node, context) => {
		if (typescript.isBinaryExpression(node)) {
			return rewriteBinary(node, context);
		}
		if (typescript.isPrefixUnaryExpression(node)) {
			return rewritePrefix(node, context);
		}

		if (typescript.isPostfixUnaryExpression(node)) {
			return rewriteStep(
				node,
				node.operand,
				node.operator === typescript.SyntaxKind.PlusPlusToken,
				true,
				context,
			);
		}

		return null;
	},
};
