import typescript from 'typescript';

/**
 * Writing out *where* a value stopped matching a type.
 *
 * The check beside this one answers yes or no, which is all a filter needs. An
 * `as<Order>(payload)` that refuses needs more than that: told only "not an
 * Order" about a record with forty fields, you are no better off than before
 * the check existed.
 *
 * So this emits a second walker that returns the first path that failed, and
 * what was there instead:
 *
 * ```text
 * customer.email: expected string, got number
 * items[3].quantity: expected number, got undefined
 * ```
 *
 * It runs **only after the fast check has already refused**, so nothing on the
 * happy path pays for it. That is also why it can be written the slow, obvious
 * way — as statements that walk and return early — rather than as one fused
 * expression.
 *
 * Where a type is more than this can describe precisely — an intersection, a
 * tuple, a union of object shapes — it falls back to naming the type that was
 * expected at that path. Vague beats wrong: a path is a promise about where the
 * problem is, and inventing one would send someone to the wrong field.
 */

/** How deep the walker descends before falling back to naming the type. */
const MAX_DEPTH = 8;

/** State carried down one generation of the walker. */
interface Walk {
	/** Checker of the program being compiled. */
	readonly checker: typescript.TypeChecker;

	/** Node factory of the current transformation. */
	readonly factory: typescript.NodeFactory;

	/** Node the lookups happen from, for scope. */
	readonly at: typescript.Node;

	/** Builds the yes-or-no check for a type, for the cases not described. */
	readonly fallback: (
		type: typescript.Type,
		value: typescript.Expression,
	) => typescript.Expression | null;

	/** How many loop variables have been handed out. */
	counter: { value: number };
}

/**
 * Tells whether a flag is present on a type.
 *
 * @param type Type being inspected.
 * @param flag Flag looked for.
 * @returns `true` when the type carries it.
 */
const has = (type: typescript.Type, flag: typescript.TypeFlags): boolean =>
	(type.flags & flag) !== 0;

/**
 * Builds the expression naming what a value actually is, at runtime.
 *
 * `typeof` with `null` corrected, which is the one answer it gives that would
 * mislead someone reading the message.
 *
 * @param factory Node factory.
 * @param value Expression being described.
 * @returns An expression producing the description.
 */
const describe = (
	factory: typescript.NodeFactory,
	value: typescript.Expression,
): typescript.Expression =>
	factory.createConditionalExpression(
		factory.createStrictEquality(value, factory.createNull()),
		undefined,
		factory.createStringLiteral('null'),
		undefined,
		factory.createTypeOfExpression(value),
	);

/**
 * Builds `return "<path>: expected <expected>, got " + typeof value`.
 *
 * @param factory Node factory.
 * @param path Path of the value inside the whole, as an expression so that an
 * array index can be part of it.
 * @param expected Name of the type that was wanted.
 * @param value Expression that failed.
 * @returns The return statement.
 */
const complain = (
	factory: typescript.NodeFactory,
	path: typescript.Expression,
	expected: string,
	value: typescript.Expression,
): typescript.Statement => {
	// At the root there is no path to name, and prefixing an empty one leaves a
	// stray colon in front of the message.
	const atRoot: boolean = typescript.isStringLiteral(path) && path.text === '';

	const prefix: typescript.Expression = atRoot
		? factory.createStringLiteral(`expected ${expected}, got `)
		: factory.createAdd(
				path,
				factory.createStringLiteral(`: expected ${expected}, got `),
			);

	return factory.createReturnStatement(
		factory.createAdd(prefix, describe(factory, value)),
	);
};

/**
 * Reads a property off an expression, quoting the key when it has to.
 *
 * @param factory Node factory.
 * @param value Expression carrying the property.
 * @param name Name of the property.
 * @returns The access expression.
 */
const propertyOf = (
	factory: typescript.NodeFactory,
	value: typescript.Expression,
	name: string,
): typescript.Expression =>
	/^[A-Za-z_$][\w$]*$/.test(name)
		? factory.createPropertyAccessExpression(value, name)
		: factory.createElementAccessExpression(
				value,
				factory.createStringLiteral(name),
			);

/**
 * Extends a path expression with a property name.
 *
 * @param factory Node factory.
 * @param path Path so far.
 * @param name Property being descended into.
 * @returns The extended path.
 */
const pathTo = (
	factory: typescript.NodeFactory,
	path: typescript.Expression,
	name: string,
): typescript.Expression =>
	typescript.isStringLiteral(path) && path.text === ''
		? factory.createStringLiteral(name)
		: factory.createAdd(path, factory.createStringLiteral(`.${name}`));

/**
 * Writes the statements that look for a failure of one type at one path.
 *
 * @param type Type being checked for.
 * @param value Expression the check applies to.
 * @param path Path of that expression inside the whole.
 * @param written The type as the consumer wrote it.
 * @param walk State of the generation.
 * @param depth How deep into the type this is.
 * @returns Statements returning a description, or `null` when nothing can be
 * said precisely enough to be worth saying.
 */
const explainFor = (
	type: typescript.Type,
	value: typescript.Expression,
	path: typescript.Expression,
	written: string,
	walk: Walk,
	depth: number,
): typescript.Statement[] | null => {
	const { checker, factory } = walk;

	if (depth > MAX_DEPTH) return vague(type, value, path, written, walk);

	// Nothing to report: these accept anything.
	if (has(type, typescript.TypeFlags.Any | typescript.TypeFlags.Unknown)) {
		return [];
	}

	const primitive: string | null = primitiveNameOf(type);

	if (primitive !== null) {
		return [
			factory.createIfStatement(
				factory.createStrictInequality(
					factory.createTypeOfExpression(value),
					factory.createStringLiteral(primitive),
				),
				factory.createBlock([complain(factory, path, primitive, value)], true),
			),
		];
	}

	if (has(type, typescript.TypeFlags.Object)) {
		if (checker.isArrayType(type)) {
			return explainArray(type, value, path, written, walk, depth);
		}

		// A tuple, a function, a class: all described by name rather than walked.
		// A class is checked with `instanceof` and there is no sub-path to point
		// at; a tuple would need its own index handling for little gain.
		if (checker.isTupleType(type)) {
			return vague(type, value, path, written, walk);
		}

		const symbol: typescript.Symbol | undefined = type.getSymbol();

		if (
			symbol !== undefined &&
			(symbol.flags & typescript.SymbolFlags.Class) !== 0
		) {
			return vague(type, value, path, written, walk);
		}

		if (type.getCallSignatures().length > 0) {
			return vague(type, value, path, written, walk);
		}

		return explainObject(type, value, path, written, walk, depth);
	}

	// Unions, intersections, literals and everything else: the yes-or-no check
	// is exact, so it decides, and the message names the type rather than
	// guessing at which member was meant.
	return vague(type, value, path, written, walk);
};

/**
 * The primitive flags that have a `typeof` name, and that name.
 */
const PRIMITIVE_NAMES: readonly (readonly [typescript.TypeFlags, string])[] = [
	[typescript.TypeFlags.StringLike, 'string'],
	[typescript.TypeFlags.NumberLike, 'number'],
	[typescript.TypeFlags.BigIntLike, 'bigint'],
	[typescript.TypeFlags.BooleanLike, 'boolean'],
	[typescript.TypeFlags.ESSymbolLike, 'symbol'],
];

/**
 * Names the `typeof` group a type belongs to, when it belongs to one.
 *
 * Literal types are excluded on purpose: `'dark'` is a string as far as
 * `typeof` goes, and reporting it as one would be a description that passes
 * while the value is still wrong.
 *
 * @param type Type being classified.
 * @returns The `typeof` name, or `null`.
 */
const primitiveNameOf = (type: typescript.Type): string | null => {
	if (type.isLiteral() || has(type, typescript.TypeFlags.BooleanLiteral)) {
		return null;
	}

	if (type.isUnion()) return null;

	for (const [flag, name] of PRIMITIVE_NAMES) {
		if (has(type, flag)) return name;
	}

	return null;
};

/**
 * Falls back to naming the expected type at a path.
 *
 * @param type Type that was wanted.
 * @param value Expression that failed.
 * @param path Path of that expression.
 * @param written The type as written.
 * @param walk State of the generation.
 * @returns The statements, or `null` when even the yes-or-no check is missing.
 */
const vague = (
	type: typescript.Type,
	value: typescript.Expression,
	path: typescript.Expression,
	written: string,
	walk: Walk,
): typescript.Statement[] | null => {
	const check: typescript.Expression | null = walk.fallback(type, value);

	if (check === null) return null;

	return [
		walk.factory.createIfStatement(
			walk.factory.createPrefixUnaryExpression(
				typescript.SyntaxKind.ExclamationToken,
				walk.factory.createParenthesizedExpression(check),
			),
			walk.factory.createBlock(
				[complain(walk.factory, path, written, value)],
				true,
			),
		),
	];
};

/**
 * Writes the statements describing an array that does not match.
 *
 * @param type Array type being checked for.
 * @param value Expression the check applies to.
 * @param path Path of that expression.
 * @param written The type as written.
 * @param walk State of the generation.
 * @param depth How deep into the type this is.
 * @returns The statements, or `null`.
 */
const explainArray = (
	type: typescript.Type,
	value: typescript.Expression,
	path: typescript.Expression,
	written: string,
	walk: Walk,
	depth: number,
): typescript.Statement[] | null => {
	const { checker, factory } = walk;

	const [element] = checker.getTypeArguments(type as typescript.TypeReference);

	if (element === undefined) return vague(type, value, path, written, walk);

	const isArray: typescript.Statement = factory.createIfStatement(
		factory.createPrefixUnaryExpression(
			typescript.SyntaxKind.ExclamationToken,
			factory.createCallExpression(
				factory.createPropertyAccessExpression(
					factory.createIdentifier('Array'),
					'isArray',
				),
				undefined,
				[value],
			),
		),
		factory.createBlock([complain(factory, path, 'an array', value)], true),
	);

	const index = `i${walk.counter.value++}`;

	const elementPath: typescript.Expression = factory.createAdd(
		factory.createAdd(path, factory.createStringLiteral('[')),
		factory.createAdd(
			factory.createIdentifier(index),
			factory.createStringLiteral(']'),
		),
	);

	const inner: typescript.Statement[] | null = explainFor(
		element,
		factory.createElementAccessExpression(
			value,
			factory.createIdentifier(index),
		),
		elementPath,
		checker.typeToString(element),
		walk,
		depth + 1,
	);

	if (inner === null) return [isArray];

	// A plain loop rather than `every`, so the index is in hand for the path and
	// the walk can return out of the middle of it.
	return [
		isArray,
		factory.createForStatement(
			factory.createVariableDeclarationList(
				[
					factory.createVariableDeclaration(
						index,
						undefined,
						undefined,
						factory.createNumericLiteral(0),
					),
				],
				typescript.NodeFlags.Let,
			),
			factory.createLessThan(
				factory.createIdentifier(index),
				factory.createPropertyAccessExpression(value, 'length'),
			),
			factory.createPostfixIncrement(factory.createIdentifier(index)),
			factory.createBlock(inner, true),
		),
	];
};

/**
 * Writes the statements describing an object that does not match.
 *
 * @param type Object type being checked for.
 * @param value Expression the check applies to.
 * @param path Path of that expression.
 * @param written The type as written.
 * @param walk State of the generation.
 * @param depth How deep into the type this is.
 * @returns The statements, or `null`.
 */
const explainObject = (
	type: typescript.Type,
	value: typescript.Expression,
	path: typescript.Expression,
	written: string,
	walk: Walk,
	depth: number,
): typescript.Statement[] | null => {
	const { checker, factory } = walk;

	const properties: readonly typescript.Symbol[] = type.getProperties();

	if (properties.length === 0) return vague(type, value, path, written, walk);

	// Ruled out before any property is read, or the walk would throw while
	// trying to explain rather than returning the explanation.
	const statements: typescript.Statement[] = [
		factory.createIfStatement(
			factory.createLogicalOr(
				factory.createStrictEquality(value, factory.createNull()),
				factory.createStrictInequality(
					factory.createTypeOfExpression(value),
					factory.createStringLiteral('object'),
				),
			),
			factory.createBlock([complain(factory, path, written, value)], true),
		),
	];

	for (const property of properties) {
		const name: string = property.getName();

		if (name.startsWith('__@')) continue;

		const propertyType: typescript.Type = checker.getTypeOfSymbolAtLocation(
			property,
			walk.at,
		);

		const access: typescript.Expression = propertyOf(factory, value, name);

		const inner: typescript.Statement[] | null = explainFor(
			propertyType,
			access,
			pathTo(factory, path, name),
			checker.typeToString(propertyType),
			walk,
			depth + 1,
		);

		if (inner === null || inner.length === 0) continue;

		const optional: boolean =
			(property.flags & typescript.SymbolFlags.Optional) !== 0;

		// An absent optional property is not a failure, so the whole check for it
		// is skipped rather than being made to pass.
		statements.push(
			optional
				? factory.createIfStatement(
						factory.createStrictInequality(
							access,
							factory.createIdentifier('undefined'),
						),
						factory.createBlock(inner, true),
					)
				: factory.createBlock(inner, true),
		);
	}

	return statements;
};

/**
 * Builds the walker that names where a value stopped matching a type.
 *
 * @param type Type the call asked for.
 * @param written The type as the consumer wrote it.
 * @param at Node the call sits at, for scope.
 * @param checker Checker of the program being compiled.
 * @param factory Node factory of the current transformation.
 * @param fallback Builds the yes-or-no check for a type, for what this cannot
 * describe precisely.
 * @returns The arrow function, or `null` when nothing useful can be said.
 */
export const buildExplainer = (
	type: typescript.Type,
	written: string,
	at: typescript.Node,
	checker: typescript.TypeChecker,
	factory: typescript.NodeFactory,
	fallback: (
		type: typescript.Type,
		value: typescript.Expression,
	) => typescript.Expression | null,
): typescript.Expression | null => {
	const walk: Walk = { checker, factory, at, fallback, counter: { value: 0 } };

	const parameter = 'v';

	const body: typescript.Statement[] | null = explainFor(
		type,
		factory.createIdentifier(parameter),
		factory.createStringLiteral(''),
		written,
		walk,
		0,
	);

	if (body === null || body.length === 0) return null;

	return factory.createArrowFunction(
		undefined,
		undefined,
		[factory.createParameterDeclaration(undefined, undefined, parameter)],
		undefined,
		factory.createToken(typescript.SyntaxKind.EqualsGreaterThanToken),
		factory.createBlock(
			[...body, factory.createReturnStatement(factory.createNull())],
			true,
		),
	);
};
