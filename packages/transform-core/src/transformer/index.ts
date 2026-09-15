import typescript from 'typescript';

import { CallRewriter, isOwnedCall, RewriteContext } from '@/shared';

/**
 * Composition root shared by every Fulcro transformer.
 *
 * TypeScript erases its own type system on the way to JavaScript: interfaces,
 * type aliases, generic arguments and the file a type was declared in leave no
 * trace in the emitted code. A runtime function can therefore only report what
 * the value in front of it shows, which is why these libraries need a compiler
 * plugin to answer properly at all.
 *
 * This module holds the checker, walks every source file once, and hands each
 * call to the rewriter that owns it. What any particular utility emits lives in
 * the package that owns that utility — this one knows only how to walk and how
 * to ask.
 *
 * Which is the whole reason it is a package of its own: `@fulcro/reflect` and
 * `@fulcro/collections` each ship their own transformer, so neither has to be
 * installed for the other to work, and neither can drift out of version with
 * the runtime code it rewrites. The walking is the only part they share.
 *
 * Calls no rewriter can resolve are left untouched, so the runtime
 * implementations stay in charge and a project compiling without the
 * transformer keeps working, in whatever reduced form each utility documents.
 */

/** Options accepted from the `plugins` entry of the tsconfig. */
export interface TransformerOptions {
	/** Root the reported declaration paths are made relative to. */
	readonly projectRoot?: string;
}

/** The factory shape `ts-patch` expects from a plugin module. */
export type TransformerFactory = (
	program: typescript.Program,
	options?: TransformerOptions,
) => typescript.TransformerFactory<typescript.SourceFile>;

/**
 * Builds a transformer from a set of rewriters.
 *
 * @param rewriters Rewriters consulted for every call, in order. Each one
 * claims a single exported function of a single module, so the order carries no
 * meaning beyond the one a reader gives it.
 * @returns The factory a package exports as the default of its transformer
 * entry point.
 */
export const createTransformer =
	(rewriters: readonly CallRewriter[]): TransformerFactory =>
	(
		program: typescript.Program,
		options: TransformerOptions = {},
	): typescript.TransformerFactory<typescript.SourceFile> => {
		const checker: typescript.TypeChecker = program.getTypeChecker();
		const projectRoot: string =
			options.projectRoot ?? program.getCurrentDirectory();

		return (context: typescript.TransformationContext) => {
			const visit = (node: typescript.Node): typescript.Node => {
				if (typescript.isCallExpression(node)) {
					const rewritten: typescript.Node | null = rewriteCall(node);
					if (rewritten !== null) return rewritten;
				}

				return typescript.visitEachChild(node, visit, context);
			};

			const rewriteContext: RewriteContext = {
				checker,
				factory: context.factory,
				projectRoot,
				visit,
			};

			const rewriteCall = (
				call: typescript.CallExpression,
			): typescript.Node | null => {
				const owner: CallRewriter | undefined = rewriters.find((rewriter) =>
					isOwnedCall(call, checker, rewriter),
				);

				return owner === undefined ? null : owner.rewrite(call, rewriteContext);
			};

			return (sourceFile: typescript.SourceFile) =>
				typescript.visitNode(sourceFile, visit) as typescript.SourceFile;
		};
	};
