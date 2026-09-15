import typescript from 'typescript';

import {
	CallRewriter,
	IDENTIFIER_PATTERN,
	isTupleType,
	RewriteContext,
	utilityModuleSegment,
} from '@fulcro/transform-core';

/**
 * Rewriter of `defaultOf`.
 *
 * Replaces the call with an expression producing the default value of the type,
 * built by reading the type itself:
 *
 * ```ts
 * // written                  // emitted
 * defaultOf<string>()         ''
 * defaultOf<Order>()          { id: 0, customer: { name: '', active: false }, items: [] }
 * ```
 *
 * The rule driving every branch is that the emitted expression must be a valid
 * inhabitant of the type — which is what lets `defaultOf` be typed as `T`
 * rather than `T | null`. Required properties are filled, optional ones are
 * left out, and a literal type yields the single value it admits.
 *
 * Nothing of this is possible at runtime, so the call is only left in place
 * when the type cannot be resolved, and the runtime implementation then throws
 * rather than inventing a value.
 */

/**
 * How deep {@link buildDefaultExpression} is allowed to nest.
 *
 * A guard against a type that is deep rather than circular — a cycle is caught
 * by its own bookkeeping, but a long chain of nested shapes would still emit an
 * unreasonable literal.
 */
const MAX_DEPTH = 12;

/** State threaded through the recursive build. */
interface BuildState {
	/** Checker of the program being compiled. */
	readonly checker: typescript.TypeChecker;

	/** Node factory of the current transformation. */
	readonly factory: typescript.NodeFactory;

	/** Types already being built, to break circular references. */
	readonly seen: ReadonlySet<typescript.Type>;

	/** Current nesting depth. */
	readonly depth: number;
}

/**
 * Builds the expression producing the default value of a type.
 *
 * @param type Type whose default is built.
 * @param state Recursion state.
 * @returns The expression producing the default value.
 */
const buildDefaultExpression = (
	type: typescript.Type,
	state: BuildState,
): typescript.Expression => {
	const { checker, factory, seen, depth } = state;
	const { flags } = type;

	// A circular type has no finite default: `interface Node { next: Node }`
	// would nest forever, so the cycle is closed with `null`.
	if (seen.has(type) || depth > MAX_DEPTH) return factory.createNull();

	if (
		(flags &
			(typescript.TypeFlags.Undefined |
				typescript.TypeFlags.Void |
				typescript.TypeFlags.Never)) !==
		0
	) {
		return factory.createIdentifier('undefined');
	}

	if (
		(flags &
			(typescript.TypeFlags.Null |
				typescript.TypeFlags.Any |
				typescript.TypeFlags.Unknown)) !==
		0
	) {
		return factory.createNull();
	}

	// A literal type admits exactly one value, which is therefore its default.
	if (type.isStringLiteral()) return factory.createStringLiteral(type.value);
	if (type.isNumberLiteral()) {
		return type.value < 0
			? factory.createPrefixUnaryExpression(
					typescript.SyntaxKind.MinusToken,
					factory.createNumericLiteral(Math.abs(type.value)),
				)
			: factory.createNumericLiteral(type.value);
	}

	if ((flags & typescript.TypeFlags.BooleanLiteral) !== 0) {
		return checker.typeToString(type) === 'true'
			? factory.createTrue()
			: factory.createFalse();
	}

	if ((flags & typescript.TypeFlags.BigIntLiteral) !== 0) {
		return factory.createBigIntLiteral(
			`${checker.typeToString(type).replace(/n$/, '')}n`,
		);
	}

	if ((flags & typescript.TypeFlags.String) !== 0) {
		return factory.createStringLiteral('');
	}

	if ((flags & typescript.TypeFlags.Number) !== 0) {
		return factory.createNumericLiteral(0);
	}

	if ((flags & typescript.TypeFlags.BigInt) !== 0) {
		return factory.createBigIntLiteral('0n');
	}

	if ((flags & typescript.TypeFlags.Boolean) !== 0) {
		return factory.createFalse();
	}

	if ((flags & typescript.TypeFlags.ESSymbol) !== 0) {
		return factory.createCallExpression(
			factory.createIdentifier('Symbol'),
			undefined,
			[],
		);
	}

	// An enum defaults to its first member, which is the one carrying the
	// zero value of an auto numbered enum.
	if ((flags & typescript.TypeFlags.EnumLike) !== 0) {
		const [first] = type.isUnion() ? type.types : [type];

		if (first !== undefined && first !== type) {
			return buildDefaultExpression(first, { ...state, depth: depth + 1 });
		}
	}

	if (type.isUnion()) return buildUnionDefault(type, state);

	if ((flags & typescript.TypeFlags.Object) !== 0) {
		return buildObjectDefault(type as typescript.ObjectType, state);
	}

	// A type parameter that was never substituted, or anything else the
	// checker could not reduce.
	return factory.createNull();
};

/**
 * Builds the default of a union.
 *
 * @param type Union being built.
 * @param state Recursion state.
 * @returns The expression producing the default value.
 */
const buildUnionDefault = (
	type: typescript.UnionType,
	state: BuildState,
): typescript.Expression => {
	const { factory, depth } = state;

	// A nullable union is happiest empty: `null` and `undefined` are the
	// cheapest inhabitants, and the ones a caller expects from a default.
	const nullish = type.types.find(
		(member) =>
			(member.flags &
				(typescript.TypeFlags.Null | typescript.TypeFlags.Undefined)) !==
			0,
	);

	if (nullish !== undefined) {
		return (nullish.flags & typescript.TypeFlags.Null) !== 0
			? factory.createNull()
			: factory.createIdentifier('undefined');
	}

	const [first] = type.types;

	return first === undefined
		? factory.createNull()
		: buildDefaultExpression(first, { ...state, depth: depth + 1 });
};

/**
 * Builds the default of the built-in collections, which are better served by
 * an empty instance than by a literal describing their internals.
 *
 * @param type Object type being built.
 * @param factory Node factory of the current transformation.
 * @returns The expression, or `null` when the type is not a known built-in.
 */
const buildBuiltInDefault = (
	type: typescript.ObjectType,
	factory: typescript.NodeFactory,
): typescript.Expression | null => {
	const name: string | undefined = type.symbol?.getName();

	if (name === undefined) return null;

	const constructible: Record<string, readonly typescript.Expression[]> = {
		Map: [],
		Set: [],
		WeakMap: [],
		WeakSet: [],
		Date: [factory.createNumericLiteral(0)],
	};

	const args = constructible[name];

	return args === undefined
		? null
		: factory.createNewExpression(factory.createIdentifier(name), undefined, [
				...args,
			]);
};

/**
 * Builds the default of an object type: an array, a tuple, a known built-in or
 * a shape whose required properties are filled in.
 *
 * @param type Object type being built.
 * @param state Recursion state.
 * @returns The expression producing the default value.
 */
const buildObjectDefault = (
	type: typescript.ObjectType,
	state: BuildState,
): typescript.Expression => {
	const { checker, factory, seen, depth } = state;
	const deeper: BuildState = { ...state, depth: depth + 1 };

	if (isTupleType(type)) {
		const elements: readonly typescript.Type[] =
			checker.getTypeArguments(type as typescript.TypeReference) ?? [];

		return factory.createArrayLiteralExpression(
			elements.map((element) => buildDefaultExpression(element, deeper)),
			false,
		);
	}

	if (checker.isArrayType(type)) {
		return factory.createArrayLiteralExpression([], false);
	}

	const builtIn: typescript.Expression | null = buildBuiltInDefault(
		type,
		factory,
	);

	if (builtIn !== null) return builtIn;

	// A callable shape defaults to a function honouring its own signature, so
	// that the result stays callable and its return value stays a valid one.
	const [signature] = type.getCallSignatures();

	if (signature !== undefined) {
		return factory.createArrowFunction(
			undefined,
			undefined,
			[],
			undefined,
			factory.createToken(typescript.SyntaxKind.EqualsGreaterThanToken),
			buildDefaultExpression(signature.getReturnType(), deeper),
		);
	}

	const nested: BuildState = {
		...deeper,
		seen: new Set(seen).add(type),
	};

	const assignments: typescript.PropertyAssignment[] = checker
		.getPropertiesOfType(type)
		// An optional property is satisfied by its own absence, which keeps
		// the emitted literal to what the type actually requires.
		.filter(
			(property) => (property.flags & typescript.SymbolFlags.Optional) === 0,
		)
		.map((property) => {
			const propertyType: typescript.Type = checker.getTypeOfSymbolAtLocation(
				property,
				property.valueDeclaration ??
					property.declarations?.[0] ??
					(type.symbol?.declarations?.[0] as typescript.Node),
			);

			const name: string = property.getName();

			return factory.createPropertyAssignment(
				// A plain identifier keeps the emitted literal readable;
				// anything else has to stay quoted to remain valid.
				IDENTIFIER_PATTERN.test(name)
					? factory.createIdentifier(name)
					: factory.createStringLiteral(name),
				buildDefaultExpression(propertyType, nested),
			);
		});

	return factory.createObjectLiteralExpression(assignments, true);
};

/** Rewriter turning a `defaultOf` call into the value it describes. */
export const defaultOfRewriter: CallRewriter = {
	functionName: 'defaultOf',
	moduleSegment: utilityModuleSegment('defaultOf'),

	rewrite: (
		call: typescript.CallExpression,
		{ checker, factory }: RewriteContext,
	): typescript.Node | null => {
		// The type can be written explicitly, or inferred from what the result
		// is assigned to — `const order: Order = defaultOf()`.
		const [typeArgument] = call.typeArguments ?? [];

		const type: typescript.Type =
			typeArgument !== undefined
				? checker.getTypeFromTypeNode(typeArgument)
				: (checker.getContextualType(call) ?? checker.getTypeAtLocation(call));

		// An unresolved type parameter would silently produce `null` where the
		// caller was promised a value, so the call is left alone and the
		// runtime error explains itself.
		if ((type.flags & typescript.TypeFlags.TypeParameter) !== 0) return null;

		return buildDefaultExpression(type, {
			checker,
			factory,
			seen: new Set(),
			depth: 0,
		});
	},
};
