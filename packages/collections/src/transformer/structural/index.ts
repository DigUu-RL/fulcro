import typescript from 'typescript';

import { RewriteContext } from '@fulcro/transform-core';

/**
 * Writing out the checks a type implies.
 *
 * A type with no single runtime token — an interface, an object literal type, a
 * union of them — still has a *shape*, and the checker knows it completely
 * while the compiler is running. So rather than looking for something to point
 * at, this writes the test out: the properties, their types, their optionality,
 * all the way down.
 *
 * ```ts
 * // interface Account { id: number; tags: string[] }
 * values.ofType<Account>();
 *
 * // becomes, near enough:
 * values.ofType({
 * 	name: 'Account',
 * 	matches: (v) =>
 * 		v !== null &&
 * 		typeof v === 'object' &&
 * 		typeof v.id === 'number' &&
 * 		Array.isArray(v.tags) &&
 * 		v.tags.every((e) => typeof e === 'string'),
 * });
 * ```
 *
 * **The governing rule is that it refuses whatever it cannot prove.** A test
 * that answers `true` for something that is not an `Account` is worse than no
 * test at all: it is false confidence at exactly the boundary where the data is
 * least trustworthy. So every construct this does not fully understand returns
 * `null` from here, and the call is left unresolved for the runtime to reject
 * out loud. There is no partial or optimistic check anywhere in this file.
 */

/** How deep a type may nest before this gives up rather than grinding on. */
const MAX_DEPTH = 12;

/** State carried down a single generation, so cycles can be spotted. */
interface Generation {
	/** Compilation in progress. */
	readonly context: RewriteContext;

	/** Node the lookups happen from, for scope. */
	readonly at: typescript.Node;

	/** Types currently being written out, to catch a type that contains itself. */
	readonly open: Set<typescript.Type>;

	/** How many parameter names have been handed out, to keep them distinct. */
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
 * Builds `typeof value === name`.
 *
 * @param factory Node factory.
 * @param value Expression being tested.
 * @param name Expected `typeof` answer.
 * @returns The comparison.
 */
const typeofIs = (
	factory: typescript.NodeFactory,
	value: typescript.Expression,
	name: string,
): typescript.Expression =>
	factory.createStrictEquality(
		factory.createTypeOfExpression(value),
		factory.createStringLiteral(name),
	);

/**
 * Joins checks with `&&`, or answers `true` when there are none.
 *
 * @param factory Node factory.
 * @param checks Checks to combine.
 * @returns The combined expression.
 */
const all = (
	factory: typescript.NodeFactory,
	checks: readonly typescript.Expression[],
): typescript.Expression =>
	checks.length === 0
		? factory.createTrue()
		: checks.reduce((left, right) => factory.createLogicalAnd(left, right));

/**
 * Joins checks with `||`, or answers `false` when there are none.
 *
 * @param factory Node factory.
 * @param checks Checks to combine.
 * @returns The combined expression.
 */
const any = (
	factory: typescript.NodeFactory,
	checks: readonly typescript.Expression[],
): typescript.Expression =>
	checks.length === 0
		? factory.createFalse()
		: checks.reduce((left, right) => factory.createLogicalOr(left, right));

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
 * Names a global constructor that is safe to test with `instanceof`.
 *
 * Only the ones every runtime has. A user class goes through the scope check
 * instead, since it may not be in scope as a value at the call site.
 */
const GLOBAL_CLASSES = new Set([
	'Date',
	'RegExp',
	'Map',
	'Set',
	'WeakMap',
	'WeakSet',
	'Promise',
	'Error',
	'ArrayBuffer',
	'DataView',
	'Uint8Array',
	'Int8Array',
	'Uint16Array',
	'Int16Array',
	'Uint32Array',
	'Int32Array',
	'Float32Array',
	'Float64Array',
	'BigInt64Array',
	'BigUint64Array',
]);

/**
 * Tells whether a type already admits `undefined` on its own.
 *
 * An optional property normally carries it in its declared type, and the check
 * written for that union tests it. Knowing that saves wrapping the result in
 * the same test a second time.
 *
 * @param type Type being inspected.
 * @returns `true` when `undefined` is one of its members.
 */
const admitsUndefined = (type: typescript.Type): boolean =>
	has(type, typescript.TypeFlags.Undefined) ||
	(type.isUnion() &&
		type.types.some((member) => has(member, typescript.TypeFlags.Undefined)));

/**
 * Tells whether a name is usable as a value where the call sits.
 *
 * A class imported with `import type` is erased before the emitted code runs,
 * so naming it in a runtime position would compile and then fail.
 *
 * @param name Name being looked up.
 * @param generation State of the generation.
 * @returns `true` when the name survives into the emitted code as a value.
 */
const isValueInScope = (name: string, generation: Generation): boolean => {
	if (GLOBAL_CLASSES.has(name)) return true;

	const resolved: typescript.Symbol | undefined =
		generation.context.checker.resolveName(
			name,
			generation.at,
			typescript.SymbolFlags.Value,
			false,
		);

	if (resolved === undefined) return false;

	return !(resolved.declarations ?? []).some((declaration) => {
		if (typescript.isImportSpecifier(declaration)) {
			return (
				declaration.isTypeOnly || declaration.parent.parent.isTypeOnly === true
			);
		}

		if (typescript.isImportClause(declaration)) return declaration.isTypeOnly;

		return false;
	});
};

/**
 * Writes the check for one type, applied to one expression.
 *
 * @param type Type being checked for.
 * @param value Expression the check is applied to.
 * @param generation State of the generation.
 * @param depth How deep into the type this is.
 * @returns The check, or `null` when the type cannot be proven at runtime.
 */
const checkFor = (
	type: typescript.Type,
	value: typescript.Expression,
	generation: Generation,
	depth: number,
): typescript.Expression | null => {
	const { checker, factory } = generation.context;

	if (depth > MAX_DEPTH) return null;

	// Accepts everything, honestly: there is nothing to check, and saying so is
	// not the same as failing to check.
	if (has(type, typescript.TypeFlags.Any | typescript.TypeFlags.Unknown)) {
		return factory.createTrue();
	}

	if (has(type, typescript.TypeFlags.Never)) return factory.createFalse();

	if (has(type, typescript.TypeFlags.Null)) {
		return factory.createStrictEquality(value, factory.createNull());
	}

	if (has(type, typescript.TypeFlags.Undefined | typescript.TypeFlags.Void)) {
		return factory.createStrictEquality(
			value,
			factory.createIdentifier('undefined'),
		);
	}

	// Literals before the primitive groups they belong to, or `'dark'` would be
	// checked as any old string.
	if (type.isStringLiteral()) {
		return factory.createStrictEquality(
			value,
			factory.createStringLiteral(type.value),
		);
	}

	if (type.isNumberLiteral()) {
		return factory.createStrictEquality(
			value,
			factory.createNumericLiteral(type.value),
		);
	}

	if (has(type, typescript.TypeFlags.BooleanLiteral)) {
		const written: string = checker.typeToString(type);

		return factory.createStrictEquality(
			value,
			written === 'true' ? factory.createTrue() : factory.createFalse(),
		);
	}

	// A union takes in enums too, which the checker presents as one.
	if (type.isUnion()) {
		const members: (typescript.Expression | null)[] = type.types.map((member) =>
			checkFor(member, value, generation, depth + 1),
		);

		if (members.some((member) => member === null)) return null;

		return factory.createParenthesizedExpression(
			any(factory, members as typescript.Expression[]),
		);
	}

	if (type.isIntersection()) {
		const members: (typescript.Expression | null)[] = type.types.map((member) =>
			checkFor(member, value, generation, depth + 1),
		);

		if (members.some((member) => member === null)) return null;

		return factory.createParenthesizedExpression(
			all(factory, members as typescript.Expression[]),
		);
	}

	if (has(type, typescript.TypeFlags.StringLike)) {
		return typeofIs(factory, value, 'string');
	}

	if (has(type, typescript.TypeFlags.NumberLike)) {
		return typeofIs(factory, value, 'number');
	}

	if (has(type, typescript.TypeFlags.BigIntLike)) {
		return typeofIs(factory, value, 'bigint');
	}

	if (has(type, typescript.TypeFlags.BooleanLike)) {
		return typeofIs(factory, value, 'boolean');
	}

	if (has(type, typescript.TypeFlags.ESSymbolLike)) {
		return typeofIs(factory, value, 'symbol');
	}

	// A type that contains itself. Writing it out would not terminate, and the
	// named-function form that would handle it is deliberately out of scope.
	if (generation.open.has(type)) return null;

	if (!has(type, typescript.TypeFlags.Object)) return null;

	return checkForObject(type, value, generation, depth);
};

/**
 * Writes the check for an object type: array, tuple, class, or plain shape.
 *
 * @param type Type being checked for.
 * @param value Expression the check is applied to.
 * @param generation State of the generation.
 * @param depth How deep into the type this is.
 * @returns The check, or `null` when the type cannot be proven at runtime.
 */
const checkForObject = (
	type: typescript.Type,
	value: typescript.Expression,
	generation: Generation,
	depth: number,
): typescript.Expression | null => {
	const { checker, factory } = generation.context;

	generation.open.add(type);

	try {
		if (checker.isArrayType(type)) {
			const [element] = checker.getTypeArguments(
				type as typescript.TypeReference,
			);

			if (element === undefined) return null;

			const parameter: string = `e${generation.counter.value++}`;

			const inner: typescript.Expression | null = checkFor(
				element,
				factory.createIdentifier(parameter),
				generation,
				depth + 1,
			);

			if (inner === null) return null;

			// Every element, not a sample: a check that looked at the first one
			// would be exactly the optimistic half-answer this file refuses to
			// produce. What that costs is the caller's to know, and documented.
			return factory.createLogicalAnd(
				factory.createCallExpression(
					factory.createPropertyAccessExpression(
						factory.createIdentifier('Array'),
						'isArray',
					),
					undefined,
					[value],
				),
				factory.createCallExpression(
					factory.createPropertyAccessExpression(value, 'every'),
					undefined,
					[
						factory.createArrowFunction(
							undefined,
							undefined,
							[
								factory.createParameterDeclaration(
									undefined,
									undefined,
									parameter,
								),
							],
							undefined,
							factory.createToken(typescript.SyntaxKind.EqualsGreaterThanToken),
							inner,
						),
					],
				),
			);
		}

		if (checker.isTupleType(type)) {
			const reference = type as typescript.TypeReference;
			const target = reference.target as typescript.TupleType;

			// A rest or optional element makes the length variable, and a length
			// this cannot pin down is one it will not guess at.
			if (target.hasRestElement || target.minLength !== target.fixedLength) {
				return null;
			}

			const elements: readonly typescript.Type[] =
				checker.getTypeArguments(reference);

			const checks: typescript.Expression[] = [
				factory.createCallExpression(
					factory.createPropertyAccessExpression(
						factory.createIdentifier('Array'),
						'isArray',
					),
					undefined,
					[value],
				),
				factory.createStrictEquality(
					factory.createPropertyAccessExpression(value, 'length'),
					factory.createNumericLiteral(elements.length),
				),
			];

			for (const [index, element] of elements.entries()) {
				const inner: typescript.Expression | null = checkFor(
					element,
					factory.createElementAccessExpression(
						value,
						factory.createNumericLiteral(index),
					),
					generation,
					depth + 1,
				);

				if (inner === null) return null;

				checks.push(inner);
			}

			return factory.createParenthesizedExpression(all(factory, checks));
		}

		const symbol: typescript.Symbol | undefined = type.getSymbol();

		// A class, or one of the built-in types that behaves like one.
		//
		// The built-ins do not carry `SymbolFlags.Class`: the standard library
		// declares `interface Date` beside a separate `declare var Date`, so the
		// flag check alone misses them — and then the shape path below writes out
		// a `typeof` check for all fifty methods of `Date`, including its symbol
		// keyed member, which cannot be named in source at all. Matching the
		// known names first is what keeps that from being emitted.
		const isClassLike: boolean =
			symbol !== undefined &&
			((symbol.flags & typescript.SymbolFlags.Class) !== 0 ||
				GLOBAL_CLASSES.has(symbol.getName()));

		if (isClassLike && symbol !== undefined) {
			const name: string = symbol.getName();

			return isValueInScope(name, generation)
				? factory.createBinaryExpression(
						value,
						factory.createToken(typescript.SyntaxKind.InstanceOfKeyword),
						factory.createIdentifier(name),
					)
				: null;
		}

		// A function type. Only that it is callable can be checked — no runtime
		// sees a signature — and the shape below would be wrong for one.
		if (
			type.getCallSignatures().length > 0 ||
			type.getConstructSignatures().length > 0
		) {
			return typeofIs(factory, value, 'function');
		}

		// An index signature means arbitrary keys, which this does not attempt.
		if (checker.getIndexInfosOfType(type).length > 0) return null;

		const properties: readonly typescript.Symbol[] = type.getProperties();

		// An object type with nothing in it accepts any object, and a check that
		// only says "is an object" is not what the caller asked about.
		if (properties.length === 0) return null;

		const checks: typescript.Expression[] = [
			factory.createStrictInequality(value, factory.createNull()),
			typeofIs(factory, value, 'object'),
		];

		for (const property of properties) {
			const name: string = property.getName();

			// A member keyed by a symbol. The compiler spells these `__@name@id`,
			// which is not a property name any source can write, so there is no
			// honest check to emit for one.
			if (name.startsWith('__@')) return null;

			const propertyType: typescript.Type = checker.getTypeOfSymbolAtLocation(
				property,
				generation.at,
			);

			const optional: boolean =
				(property.flags & typescript.SymbolFlags.Optional) !== 0;

			const access: typescript.Expression = propertyOf(factory, value, name);

			const inner: typescript.Expression | null = checkFor(
				propertyType,
				access,
				generation,
				depth + 1,
			);

			if (inner === null) return null;

			// Absent and present-but-undefined are the same here, which is what
			// reading a missing property gives back anyway. Extra properties are
			// never rejected: structural typing allows them, and rejecting them
			// would make this disagree with the compiler that produced it.
			//
			// Only wrapped when the property's own type does not already admit
			// `undefined`, which it normally does — otherwise the emitted check
			// asks the same question twice.
			const needsWrapping: boolean = optional && !admitsUndefined(propertyType);

			checks.push(
				needsWrapping
					? factory.createParenthesizedExpression(
							factory.createLogicalOr(
								factory.createStrictEquality(
									access,
									factory.createIdentifier('undefined'),
								),
								inner,
							),
						)
					: inner,
			);
		}

		return factory.createParenthesizedExpression(all(factory, checks));
	} finally {
		generation.open.delete(type);
	}
};

/**
 * Builds the shape test for a type, when one can be proven.
 *
 * @param type Type the call asked for.
 * @param written The type as the consumer wrote it, for error messages.
 * @param at Node the call sits at, for scope.
 * @param context Compilation in progress.
 * @returns The object literal to pass at runtime, or `null` when the type
 * cannot be checked honestly.
 */
export const buildStructuralTest = (
	type: typescript.Type,
	written: string,
	at: typescript.Node,
	context: RewriteContext,
): typescript.Expression | null => {
	const { factory } = context;

	const generation: Generation = {
		context,
		at,
		open: new Set(),
		counter: { value: 0 },
	};

	const parameter = 'v';

	const body: typescript.Expression | null = checkFor(
		type,
		factory.createIdentifier(parameter),
		generation,
		0,
	);

	if (body === null) return null;

	return factory.createObjectLiteralExpression(
		[
			factory.createPropertyAssignment(
				'name',
				factory.createStringLiteral(written),
			),
			factory.createPropertyAssignment(
				'matches',
				factory.createArrowFunction(
					undefined,
					undefined,
					[factory.createParameterDeclaration(undefined, undefined, parameter)],
					undefined,
					factory.createToken(typescript.SyntaxKind.EqualsGreaterThanToken),
					body,
				),
			),
		],
		false,
	);
};
