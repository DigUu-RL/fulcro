import typescript from 'typescript';

import {
	type ExpressionRewriter,
	rewriteSourceFile,
	type RewriteStatistics,
} from '@/rewrite/file';
import { composeRewrites, type RewrittenText } from '@/rewrite/text';

/**
 * Rewriting a whole program until nothing more is claimed.
 *
 * One pass is not enough, because rewriting changes what the checker infers.
 * `const c = a + b` types `c` as `number` in the original — the checker has no
 * idea `+` means anything else — so a later `c + d` looks like arithmetic on a
 * plain number and is left alone. Once the first line reads
 * `const c = T.add(a, b)`, `c` has the type `T.add` returns, and the second
 * line is claimable. So the program is rewritten, re-checked, and rewritten
 * again until a pass claims nothing — each pass can only claim sites the one
 * before could not, so the loop ends, and a bound on it makes sure it does.
 *
 * Where the program comes from is the caller's: a fresh `createProgram` for
 * `tsc`, a language service for a bundler or an editor. This only needs to ask
 * for the current program and to hand text back.
 */

/** Something that holds a program and can have its files replaced. */
export interface ProgramSource {
	/** The program as it stands, with every text handed back so far. */
	readonly program: () => typescript.Program;

	/**
	 * Replaces the text of a file for the next {@link ProgramSource.program}.
	 *
	 * @param fileName File, as the program spells it.
	 * @param text Its new text.
	 */
	readonly update: (fileName: string, text: string) => void;
}

/** The outcome of rewriting a program. */
export interface ProgramRewrite {
	/** Each rewritten file, mapped back to its original text. */
	readonly files: ReadonlyMap<string, RewrittenText>;

	/** Passes it took, the last one claiming nothing. */
	readonly passes: number;

	/** Nodes considered and replaced, over every pass. */
	readonly statistics: RewriteStatistics;
}

/**
 * Passes after which the loop stops whether or not it has settled. Each pass
 * resolves one more step of inference through a chain of declarations, and a
 * program needing more than this has a chain of `const` declarations longer
 * than anyone writes — its remaining sites are left as the checker sees them,
 * and report their own type errors.
 */
const MAXIMUM_PASSES = 16;

/**
 * Tells whether a file is the consumer's own source, which is all a rewrite
 * touches: never a declaration file, never a dependency.
 *
 * @param sourceFile File of the program.
 * @returns `true` when it may be rewritten.
 */
export const isRewritable = (sourceFile: typescript.SourceFile): boolean =>
	!sourceFile.isDeclarationFile &&
	!sourceFile.fileName.includes('/node_modules/');

/**
 * Rewrites a program to a fixed point.
 *
 * @param source Where the program comes from.
 * @param rewriter What to rewrite.
 * @returns The rewritten files and what it took.
 */
export const rewriteToFixpoint = (
	source: ProgramSource,
	rewriter: ExpressionRewriter,
): ProgramRewrite => {
	const files = new Map<string, RewrittenText>();
	const statistics: RewriteStatistics = { visited: 0, rewritten: 0 };

	let passes = 0;

	while (passes < MAXIMUM_PASSES) {
		passes++;

		const program: typescript.Program = source.program();
		const checker: typescript.TypeChecker = program.getTypeChecker();
		const changed: [string, RewrittenText][] = [];

		for (const sourceFile of program.getSourceFiles()) {
			if (!isRewritable(sourceFile)) continue;

			const rewritten: RewrittenText | null = rewriteSourceFile(
				sourceFile,
				checker,
				rewriter,
				statistics,
			);

			if (rewritten !== null) changed.push([sourceFile.fileName, rewritten]);
		}

		if (changed.length === 0) break;

		// Handed back only once the pass is over, so every file of a pass is
		// read against the same program.
		for (const [fileName, rewritten] of changed) {
			const previous: RewrittenText | undefined = files.get(fileName);

			files.set(
				fileName,
				previous === undefined
					? rewritten
					: composeRewrites(previous, rewritten),
			);
			source.update(fileName, rewritten.text);
		}
	}

	return { files, passes, statistics };
};
