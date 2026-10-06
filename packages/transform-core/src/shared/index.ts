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

/** What an analyzer needs from the compilation in progress. */
export interface AnalysisContext {
	/** Checker of the program being compiled. */
	readonly checker: typescript.TypeChecker;

	/**
	 * Refuses code at compile time, as an error located at the node.
	 *
	 * @param node Node the error points at, from the source being compiled.
	 * @param message What went wrong, starting with its `FULCRO` code.
	 */
	readonly report: (node: typescript.Node, message: string) => void;
}

/**
 * Checks a whole source file, without rewriting it.
 *
 * For a rule no single call can decide: whether a value is used after it was
 * moved depends on everything the function does after the call, not on the
 * call. A rewriter sees one call at a time, top down, so four of them asking
 * the same question would each walk the enclosing function again and report
 * one conflict from both of its ends. An analyzer walks the file once, before
 * any rewriter runs, and sees the source exactly as it was written.
 */
export interface FileAnalyzer {
	/**
	 * Names of the functions whose calls the analyzer looks at.
	 *
	 * A file mentioning none of them is never type checked on its behalf — the
	 * same cheap pre-filter rewriters get from their `functionName`.
	 */
	readonly functionNames: readonly string[];

	/**
	 * Checks one file, reporting through the context.
	 *
	 * @param sourceFile File as written, before any rewriter touched it.
	 * @param context Compilation in progress.
	 */
	readonly analyze: (
		sourceFile: typescript.SourceFile,
		context: AnalysisContext,
	) => void;
}

/** Everything a rewriter needs from the compilation in progress. */
export interface RewriteContext extends AnalysisContext {
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

	/**
	 * Refuses a call at compile time, as an error located at the node.
	 *
	 * For a call the rewriter owns but cannot answer, where leaving it to the
	 * runtime would ship a wrong or silently weaker answer — the case
	 * `transformers.md` calls failing loudly. The rewriter still returns what it
	 * returns; the build is what fails.
	 *
	 * @param node Node the error points at, from the source being compiled.
	 * @param message What went wrong, starting with its `FULCRO` code.
	 */
	readonly report: (node: typescript.Node, message: string) => void;
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

/** Identifies the exported function a call has to resolve to. */
export interface CallTarget {
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
	 * Name of the package that must declare the function, as its `package.json`
	 * spells it.
	 *
	 * Needed where the module segment alone is not distinctive. A segment such
	 * as `move/index` also matches a consumer's own `src/move/index.ts`, and a
	 * transformer that reports errors — rather than declining — would then fail
	 * that consumer's build over a function it never wrote. When set, the
	 * nearest `package.json` above the declaration has to carry this name.
	 */
	readonly packageName?: string;
}

/** Rewrites the calls of a single utility. */
export interface CallRewriter extends CallTarget {
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
 * Name of the package each directory belongs to, once looked up.
 *
 * A program holds thousands of declarations from a handful of directories, and
 * every call asks again, so the walk up to a `package.json` and the read of it
 * happen once per directory for the life of the process.
 */
const packageNames = new Map<string, string | null>();

/**
 * Reads the package name a directory's own `package.json` declares.
 *
 * @param directory Directory to look in.
 * @returns The name; `null` when the manifest names nothing; `undefined` when
 * the directory has no manifest, and the search goes on above it.
 */
const manifestNameIn = (directory: string): string | null | undefined => {
	const manifest: string = path.join(directory, 'package.json');

	if (!typescript.sys.fileExists(manifest)) return undefined;

	const name: unknown = (
		JSON.parse(typescript.sys.readFile(manifest) ?? '{}') as { name?: unknown }
	).name;

	return typeof name === 'string' ? name : null;
};

/**
 * Tells which package a directory belongs to, remembering the answer for it.
 *
 * @param directory Absolute directory.
 * @returns The package name, or `null` when no manifest above it names one.
 */
const packageNameIn = (directory: string): string | null => {
	const cached: string | null | undefined = packageNames.get(directory);

	if (cached !== undefined) return cached;

	const parent: string = path.dirname(directory);
	const declared: string | null | undefined = manifestNameIn(directory);
	const found: string | null =
		declared !== undefined
			? declared
			: parent === directory
				? null
				: packageNameIn(parent);

	packageNames.set(directory, found);

	return found;
};

/**
 * Tells which package a file belongs to: the `name` in the nearest
 * `package.json` above it.
 *
 * @param fileName File, in either spelling of the separator.
 * @returns The package name, or `null` when no `package.json` above the file
 * names one.
 */
export const packageNameOf = (fileName: string): string | null =>
	packageNameIn(path.dirname(path.resolve(fileName)));

/**
 * Tells whether a call resolves to the function a rewriter owns.
 *
 * The symbol is followed back to its declaration rather than matched by name,
 * so an unrelated local `nameOf` is never rewritten.
 *
 * @param call Call being inspected.
 * @param checker Checker of the program being compiled.
 * @param rewriter Rewriter claiming the call, or any other description of the
 * function a call has to resolve to.
 * @returns `true` when the call targets the function of that rewriter.
 */
export const isOwnedCall = (
	call: typescript.CallExpression,
	checker: typescript.TypeChecker,
	rewriter: CallTarget,
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

	return declarations.some((declaration) => {
		const fileName: string = path.normalize(
			declaration.getSourceFile().fileName,
		);

		if (!fileName.includes(rewriter.moduleSegment)) return false;

		return (
			rewriter.packageName === undefined ||
			packageNameOf(fileName) === rewriter.packageName
		);
	});
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
