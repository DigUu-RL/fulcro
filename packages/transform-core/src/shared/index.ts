import * as path from 'node:path';

import typescript from 'typescript';

/**
 * Contract shared by the rewriters of the transformer.
 *
 * Each utility owns one module here, so that a change to how `defaultOf` fills
 * a tuple never has to be made inside the same file that decides how `typeOf`
 * reports a declaration site. The composition root walks the tree once and asks
 * each rewriter whether the call in hand belongs to it.
 */

/** Everything a rewriter needs from the compilation in progress. */
export interface RewriteContext {
	/** Checker of the program being compiled. */
	readonly checker: typescript.TypeChecker;

	/** Node factory of the current transformation. */
	readonly factory: typescript.NodeFactory;

	/** Root that reported declaration paths are made relative to. */
	readonly projectRoot: string;

	/**
	 * Visits a node with the whole transformer.
	 *
	 * Handed over so that a rewriter keeping part of the original call — as
	 * `typeOf` does with its argument — still has the other utilities applied
	 * inside whatever it keeps.
	 */
	readonly visit: (node: typescript.Node) => typescript.Node;
}

/**
 * How a rewritten call is written at the call site.
 *
 * A free function is reached through an identifier the consumer imported; a
 * method is reached through whatever expression it is called on, so there is no
 * import to follow and the receiver could be anything. Both are resolved the
 * same way in the end — by following the symbol back to its declaration — but
 * the node to ask about differs.
 */
export type CallForm = 'function' | 'method';

/** Rewrites the calls of a single utility. */
export interface CallRewriter {
	/** Name the exported function is called by. */
	readonly functionName: string;

	/** Path segment identifying the module that declares it. */
	readonly moduleSegment: string;

	/**
	 * Shape of the call, defaulting to a free function.
	 *
	 * `'method'` claims `something.name(…)` rather than `name(…)`, which is what
	 * lets a library rewrite calls on its own types — `sequence.ofType<T>()` —
	 * where nothing was imported by that name.
	 */
	readonly callForm?: CallForm;

	/**
	 * Rewrites one call.
	 *
	 * @param call Call already known to belong to this rewriter.
	 * @param context Compilation in progress.
	 * @returns The replacement node, or `null` to leave the call untouched so
	 * that the runtime implementation stays in charge.
	 */
	readonly rewrite: (
		call: typescript.CallExpression,
		context: RewriteContext,
	) => typescript.Node | null;
}

/** Property names that can be emitted unquoted in an object literal. */
export const IDENTIFIER_PATTERN = /^[A-Za-z_$][\w$]*$/;

/**
 * Builds the path segment identifying a utility module.
 *
 * These segments tie this package to the folder layout `@fulcro/reflect`
 * publishes — a call is recognised by the module that declares it, and after
 * resolution that module is `functions/utils/<name>` inside the built output of
 * that package. Moving those folders there silently stops the rewriting here,
 * because a mismatch does not fail loudly on its own: the transformer simply
 * leaves the calls alone and the runtime fallbacks take over. The compile
 * fixture is what catches it, and it imports `@fulcro/reflect` by name rather
 * than by path precisely so that it resolves the same way a consumer would.
 *
 * Matched exactly, casing included.
 *
 * @param name Folder of the utility inside the output of `@fulcro/reflect`.
 * @returns The segment to look for in a declaration path.
 */
export const utilityModuleSegment = (name: string): string =>
	path.join('functions', 'utils', name);

/**
 * Tells whether a call resolves to the function a rewriter owns.
 *
 * The symbol is followed back to its declaration rather than matched by name,
 * so an unrelated local `nameOf` is never rewritten.
 *
 * @param call Call being inspected.
 * @param checker Checker of the program being compiled.
 * @param rewriter Rewriter claiming the call.
 * @returns `true` when the call targets the function of that rewriter.
 */
export const isOwnedCall = (
	call: typescript.CallExpression,
	checker: typescript.TypeChecker,
	rewriter: CallRewriter,
): boolean => {
	// The node carrying the name differs between the two forms: an identifier
	// standing on its own, or the member half of a property access. Everything
	// after this point is the same question asked of that node.
	// `MemberName` rather than `Identifier`: a property access can also name a
	// private member, which carries a `text` like any other and simply never
	// matches one of ours.
	const named: typescript.MemberName | null =
		rewriter.callForm === 'method'
			? typescript.isPropertyAccessExpression(call.expression)
				? call.expression.name
				: null
			: typescript.isIdentifier(call.expression)
				? call.expression
				: null;

	if (named === null) return false;
	if (named.text !== rewriter.functionName) return false;

	const symbol: typescript.Symbol | undefined =
		checker.getSymbolAtLocation(named);

	const resolved: typescript.Symbol | undefined =
		symbol !== undefined && (symbol.flags & typescript.SymbolFlags.Alias) !== 0
			? checker.getAliasedSymbol(symbol)
			: symbol;

	const declarations: readonly typescript.Declaration[] =
		resolved?.declarations ?? [];

	return declarations.some((declaration) =>
		path
			.normalize(declaration.getSourceFile().fileName)
			.includes(rewriter.moduleSegment),
	);
};

/**
 * Tells whether an object type is a tuple.
 *
 * Shared because both the description built by `typeOf` and the value built by
 * `defaultOf` have to tell a tuple apart from a plain array.
 *
 * @param type Type being inspected.
 * @returns `true` when the type is a tuple.
 */
export const isTupleType = (type: typescript.ObjectType): boolean =>
	(type.objectFlags & typescript.ObjectFlags.Reference) !== 0 &&
	((type as typescript.TypeReference).target.objectFlags &
		typescript.ObjectFlags.Tuple) !==
		0;
