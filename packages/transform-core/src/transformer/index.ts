import typescript from 'typescript';

import { createError } from '@fulcro/errors';

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

/**
 * What `ts-patch` hands a plugin beside its options: among other things, the
 * way to add a diagnostic to the compilation.
 */
export interface TransformerExtras {
	/**
	 * Adds an error to what the compiler reports.
	 *
	 * @param diagnostic The error.
	 */
	readonly addDiagnostic?: (diagnostic: typescript.Diagnostic) => unknown;
}

/** The factory shape `ts-patch` expects from a plugin module. */
export type TransformerFactory = (
	program: typescript.Program,
	options?: TransformerOptions,
	extras?: TransformerExtras,
) => typescript.TransformerFactory<typescript.SourceFile>;

/** The code a message from the catalog starts with, as a number. */
const CODE = /^FULCRO(\d{4})/;

/**
 * Builds the diagnostic of a refused call.
 *
 * @param node Node the error points at.
 * @param message What went wrong, starting with its `FULCRO` code.
 * @returns The diagnostic.
 */
const diagnosticAt = (
	node: typescript.Node,
	message: string,
): typescript.Diagnostic => ({
	category: typescript.DiagnosticCategory.Error,
	code: Number(CODE.exec(message)?.[1] ?? 0),
	file: node.getSourceFile(),
	start: node.getStart(),
	length: node.getWidth(),
	messageText: message,
	source: 'fulcro',
});

/**
 * A diagnostic as one line: where, and what.
 *
 * @param diagnostic The diagnostic.
 * @returns `file(line,column): message`.
 */
const describeDiagnostic = (diagnostic: typescript.Diagnostic): string => {
	const file = diagnostic.file as typescript.SourceFile;
	const { line, character } = file.getLineAndCharacterOfPosition(
		diagnostic.start ?? 0,
	);

	return `${file.fileName}(${line + 1},${character + 1}): ${String(diagnostic.messageText)}`;
};

/**
 * Builds a transformer from a set of rewriters.
 *
 * @param rewriters Rewriters consulted for every call, in order. Each one
 * claims a single exported function of a single module, so the order carries no
 * meaning beyond the one a reader gives it.
 *
 * A call a rewriter refuses with {@link RewriteContext.report} becomes an error
 * of the compilation: through `ts-patch`'s `addDiagnostic` when it is there,
 * and otherwise — a bundler, a test calling `program.emit` — as one error
 * thrown once the file is walked, listing every refusal in it.
 *
 * @returns The factory a package exports as the default of its transformer
 * entry point.
 */
export const createTransformer =
	(rewriters: readonly CallRewriter[]): TransformerFactory =>
	(
		program: typescript.Program,
		options: TransformerOptions = {},
		extras: TransformerExtras = {},
	): typescript.TransformerFactory<typescript.SourceFile> => {
		const checker: typescript.TypeChecker = program.getTypeChecker();
		const projectRoot: string =
			options.projectRoot ?? program.getCurrentDirectory();

		return (context: typescript.TransformationContext) => {
			const refused: typescript.Diagnostic[] = [];

			const report = (node: typescript.Node, message: string): void => {
				const diagnostic: typescript.Diagnostic = diagnosticAt(node, message);

				if (extras.addDiagnostic === undefined) refused.push(diagnostic);
				else extras.addDiagnostic(diagnostic);
			};

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
				report,
			};

			const rewriteCall = (
				call: typescript.CallExpression,
			): typescript.Node | null => {
				const owner: CallRewriter | undefined = rewriters.find((rewriter) =>
					isOwnedCall(call, checker, rewriter),
				);

				return owner === undefined ? null : owner.rewrite(call, rewriteContext);
			};

			return (sourceFile: typescript.SourceFile) => {
				const transformed = typescript.visitNode(
					sourceFile,
					visit,
				) as typescript.SourceFile;

				// Thrown only after the whole file is walked, so one run reports
				// every refusal in it rather than the first.
				if (refused.length > 0) {
					const report: string = refused.map(describeDiagnostic).join('\n');

					refused.length = 0;

					throw createError('FULCRO5003', report);
				}

				return transformed;
			};
		};
	};
