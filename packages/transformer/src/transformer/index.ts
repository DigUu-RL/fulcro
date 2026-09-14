import typescript from 'typescript';

import { defaultOfRewriter } from '@/transformer/defaultOf';
import { nameOfRewriter } from '@/transformer/nameOf';
import {
	CallRewriter,
	isOwnedCall,
	RewriteContext,
} from '@/transformer/shared';
import { typeOfRewriter } from '@/transformer/typeOf';

/**
 * Compile time transformer backing the type aware utilities.
 *
 * TypeScript erases its own type system on the way to JavaScript: interfaces,
 * type aliases, generic arguments and the file a type was declared in leave no
 * trace in the emitted code. Anything a runtime function could report about a
 * value is therefore limited to the value itself, which is why `nameOf` has to
 * parse closures, `typeOf` can only inspect prototypes, and `defaultOf` has
 * nothing at all to work with.
 *
 * This module is only the composition root: it holds the checker, walks every
 * source file once, and hands each call to the rewriter that owns it. What each
 * utility actually emits lives in its own folder beside this one, so that a
 * change to how `defaultOf` fills a tuple is made in a file that knows nothing
 * about declaration sites or accessor parsing.
 *
 * Calls no rewriter can resolve are left untouched, so the runtime
 * implementations stay in charge and a project compiling without the
 * transformer keeps working — with `declared` reading `null`, `nameOf` falling
 * back to parsing, and `defaultOf` throwing, since a default it cannot compute
 * would be a lie.
 *
 * Wired through `ts-patch`, which teaches `tsc` to honour the `plugins` entry
 * of `tsconfig.json`.
 */

/**
 * Rewriters consulted for every call, in order.
 *
 * Each one claims a single exported function of a single module, so the order
 * carries no meaning beyond the one a reader gives it.
 */
const REWRITERS: readonly CallRewriter[] = [
	nameOfRewriter,
	typeOfRewriter,
	defaultOfRewriter,
];

/** Options accepted from the `plugins` entry of the tsconfig. */
export interface TransformerOptions {
	/** Root the reported declaration paths are made relative to. */
	readonly projectRoot?: string;
}

/**
 * Creates the transformer.
 *
 * @param program Program being compiled, used for its checker.
 * @param options Options coming from the tsconfig entry.
 * @returns The transformer factory consumed by the compiler.
 */
export default function transformer(
	program: typescript.Program,
	options: TransformerOptions = {},
): typescript.TransformerFactory<typescript.SourceFile> {
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
			const owner: CallRewriter | undefined = REWRITERS.find((rewriter) =>
				isOwnedCall(call, checker, rewriter),
			);

			return owner === undefined ? null : owner.rewrite(call, rewriteContext);
		};

		return (sourceFile: typescript.SourceFile) =>
			typescript.visitNode(sourceFile, visit) as typescript.SourceFile;
	};
}
