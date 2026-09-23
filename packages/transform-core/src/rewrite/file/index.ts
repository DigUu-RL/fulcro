import typescript from 'typescript';

import {
	createTextBuilder,
	type RewrittenText,
	type TextBuilder,
} from '@/rewrite/text';

/**
 * One file rewritten before type checking.
 *
 * The call rewriters of `@/shared` run after the checker, on a tree whose types
 * are already settled, and replace a call by a node. This is the other kind:
 * it replaces **text**, before the checker has run on it, so that what it emits
 * is what gets type checked. That is the only way to give a type a meaning the
 * checker would otherwise refuse — `decimal * decimal` is a type error until it
 * has become `decimal.multiply(decimal)`.
 *
 * The rewriter is asked about each node, outermost first, and answers with the
 * text that replaces it, in which child nodes may appear to be rendered in turn.
 * Everything it does not claim is copied verbatim, so the output differs from
 * the input only where something was rewritten.
 */

/** Everything a rewriter needs to decide about one node. */
export interface ExpressionContext {
	/** Checker of the program the file belongs to. */
	readonly checker: typescript.TypeChecker;

	/** The file being rewritten. */
	readonly sourceFile: typescript.SourceFile;

	/**
	 * The line breaks the original text has between two offsets, as a string
	 * of newlines.
	 *
	 * Put into the synthesized text between two operands, it keeps every line
	 * of the file where it was — so an error the checker reports on the
	 * rewritten text still names the line the author wrote.
	 */
	readonly lineBreaks: (start: number, end: number) => string;
}

/**
 * What replaces a node: synthesized text and child nodes, in order. A node is
 * rendered in turn — itself rewritten where the rewriter claims it — and may
 * appear more than once.
 */
export type Replacement = readonly (string | typescript.Node)[];

/** Rewrites the nodes of one kind of construct, before type checking. */
export interface ExpressionRewriter {
	/**
	 * Module the rewritten code refers to, imported under
	 * {@link ExpressionRewriter.namespace} in every file that was rewritten.
	 */
	readonly module: string;

	/** Local name the module is imported under. */
	readonly namespace: string;

	/**
	 * Rewrites one node.
	 *
	 * @param node Node being considered.
	 * @param context The file and its checker.
	 * @returns The replacement, or `null` to keep the node and look inside it.
	 */
	readonly rewrite: (
		node: typescript.Node,
		context: ExpressionContext,
	) => Replacement | null;
}

/** How much a rewrite looked at, for the suites that count it. */
export interface RewriteStatistics {
	/** Nodes the rewriter was asked about. */
	visited: number;

	/** Nodes it replaced. */
	rewritten: number;
}

/**
 * Where the namespace import goes: on the first line of the first statement,
 * before it and without a line break, so no line of the file moves. At the end
 * of the file would keep the lines too, but a CommonJS emit leaves a `require`
 * where the import was written, and code above it would run first.
 *
 * @param sourceFile File being rewritten.
 * @returns The offset to insert at.
 */
const importOffset = (sourceFile: typescript.SourceFile): number => {
	const [first] = sourceFile.statements;

	return first === undefined ? sourceFile.end : first.getStart(sourceFile);
};

/**
 * Rewrites one source file.
 *
 * @param sourceFile File to rewrite, from a program whose checker is given.
 * @param checker Checker of that program.
 * @param rewriter What to rewrite.
 * @param statistics Counters to add to, when the caller keeps them.
 * @returns The rewritten text and its map, or `null` when nothing was claimed.
 */
export const rewriteSourceFile = (
	sourceFile: typescript.SourceFile,
	checker: typescript.TypeChecker,
	rewriter: ExpressionRewriter,
	statistics?: RewriteStatistics,
): RewrittenText | null => {
	const original: string = sourceFile.text;
	const output: TextBuilder = createTextBuilder(original);

	const context: ExpressionContext = {
		checker,
		sourceFile,
		lineBreaks: (start, end) =>
			'\n'.repeat(original.slice(start, end).split('\n').length - 1),
	};

	const importDeclaration = `import * as ${rewriter.namespace} from '${rewriter.module}'; `;

	let cursor = 0;
	let rewroteAny = false;

	/**
	 * Copies original text from the cursor up to an offset.
	 *
	 * @param end Offset to copy up to.
	 */
	const advance = (end: number): void => {
		output.copy(cursor, end);
		cursor = Math.max(cursor, end);
	};

	const render = (node: typescript.Node): void => {
		if (statistics !== undefined) statistics.visited++;

		const replacement: Replacement | null = rewriter.rewrite(node, context);

		if (replacement === null) {
			typescript.forEachChild(node, (child) => {
				advance(child.getStart(sourceFile));
				render(child);
			});

			return;
		}

		rewroteAny = true;
		if (statistics !== undefined) statistics.rewritten++;

		const start: number = node.getStart(sourceFile);

		advance(start);

		const close = output.open(start, node.end);

		for (const part of replacement) {
			if (typeof part === 'string') {
				output.write(part);
			} else {
				// A child is rendered from its own start, independently of the
				// cursor: it may be written twice, and in any order.
				const saved: number = cursor;

				cursor = part.getStart(sourceFile);
				render(part);
				output.copy(cursor, part.end);
				cursor = saved;
			}
		}

		close();
		cursor = node.end;
	};

	typescript.forEachChild(sourceFile, (child) => {
		advance(child.getStart(sourceFile));
		render(child);
	});

	advance(sourceFile.end);

	if (!rewroteAny) return null;

	// A second pass over an already rewritten file finds the import there and
	// must not add another. The import is only known to be needed once the
	// walk is over, so it is spliced in afterwards rather than written in
	// passing.
	if (original.includes(importDeclaration)) return output.build();

	return withImport(
		output.build(),
		importOffset(sourceFile),
		importDeclaration,
	);
};

/**
 * Inserts the namespace import into a rewritten text, extending its map.
 *
 * @param rewritten The rewritten text, without the import.
 * @param originalOffset Where, in the original, the import goes.
 * @param declaration The import declaration, with its trailing space.
 * @returns The text with the import and a map that accounts for it.
 */
const withImport = (
	rewritten: RewrittenText,
	originalOffset: number,
	declaration: string,
): RewrittenText => {
	const at: number = rewritten.toGenerated(originalOffset);
	const length: number = declaration.length;

	return {
		text: rewritten.text.slice(0, at) + declaration + rewritten.text.slice(at),
		toOriginal: (generated) =>
			generated < at
				? rewritten.toOriginal(generated)
				: generated < at + length
					? originalOffset
					: rewritten.toOriginal(generated - length),
		toGenerated: (original) => {
			const position: number = rewritten.toGenerated(original);

			return position < at ? position : position + length;
		},
	};
};
