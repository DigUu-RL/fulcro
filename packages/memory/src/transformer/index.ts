import {
	createTransformer,
	type FileAnalyzer,
	type TransformerFactory,
} from '@fulcro/transform-core';

import { escapeRewriter } from '@/src/transformer/escape';
import { ownershipAnalyzer } from '@/src/transformer/ownership';

export type { TransformerOptions } from '@fulcro/transform-core';

/**
 * Compile time transformer that checks `move`, `borrow` and `borrowMutable`,
 * and decides where an allocation that cannot outlive its block lives.
 *
 * It refuses, when the code is compiled, the uses the runtime would refuse
 * when they run:
 *
 * ```ts
 * const next = move(queue);
 * borrow(queue); // FULCRO7027: 'queue' is used after it was moved at line 1
 * ```
 *
 * And it rewrites one thing. A storage allocated from a managed allocator and
 * reached only through its own methods, inside the block that allocates it,
 * is allocated from a frame of that allocator instead, which the block leaves
 * when it ends:
 *
 * ```ts
 * const particles = allocate(Particle, 1_000, managed);
 * // becomes
 * using frame = managed.enter();
 * const particles = allocate(Particle, 1_000, frame);
 * ```
 *
 * Nothing the program can observe changes — nothing can reach the storage
 * once the block ends — except how often the engine is asked for memory: the
 * next time the block runs, it reuses the same bytes.
 *
 * It is **optional**. Without it, every function of this package works, every
 * one of those uses still throws — only later, and only on the paths that
 * actually run — and every allocation stays where it was written.
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
const transformer: TransformerFactory = createTransformer([], ANALYZERS, [escapeRewriter]);

export default transformer;
