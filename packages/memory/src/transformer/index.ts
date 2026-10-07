import {
	createTransformer,
	type FileAnalyzer,
	type TransformerFactory,
} from '@fulcro/transform-core';

import { ownershipAnalyzer } from '@/transformer/ownership';

export type { TransformerOptions } from '@fulcro/transform-core';

/**
 * Compile time transformer that checks `move`, `borrow` and `borrowMutable`.
 *
 * It rewrites nothing. Every call stays as written and does at runtime what
 * it always does; what the transformer adds is refusing, when the code is
 * compiled, the uses the runtime would refuse when they run:
 *
 * ```ts
 * const next = move(queue);
 * borrow(queue); // FULCRO7027: 'queue' is used after it was moved at line 1
 * ```
 *
 * It is **optional**. Without it, every function of this package works and
 * every one of those uses still throws — only later, and only on the paths
 * that actually run.
 *
 * Wire it through `ts-patch`, which teaches `tsc` to honour the `plugins` entry
 * of a tsconfig:
 *
 * ```json
 * { "plugins": [{ "transform": "@fulcro/memory/transformer" }] }
 * ```
 *
 * For a bundler, use `@fulcro/memory/unplugin` instead. It sits alongside the
 * transformers of `@fulcro/reflect` and `@fulcro/collections`: each package
 * claims only the calls it can trace back to itself, and none knows the others
 * exist.
 */

/**
 * Analyzers of this package, run over every file.
 *
 * Exported so that the bundler entry point builds on the same list.
 */
export const ANALYZERS: readonly FileAnalyzer[] = [ownershipAnalyzer];

/**
 * The transformer, as `ts-patch` expects to find it.
 *
 * @param program Program being compiled, used for its checker.
 * @param options Options coming from the tsconfig entry.
 * @returns The transformer factory consumed by the compiler.
 */
const transformer: TransformerFactory = createTransformer([], ANALYZERS);

export default transformer;
