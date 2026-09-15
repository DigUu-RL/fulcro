import {
	type CallRewriter,
	createTransformer,
	type TransformerFactory,
} from '@fulcro/transform-core';

import { castRewriter, ofTypeRewriter } from '@/transformer/narrowing';

export type { TransformerOptions } from '@fulcro/transform-core';

/**
 * Compile time transformer backing the type argument forms of the sequence
 * operators.
 *
 * `ofType` and `cast` both work without it, given a token naming what to look
 * for — `'string'`, or a constructor. This is what lets them take the type as a
 * type instead:
 *
 * ```ts
 * values.ofType<string>(); // filters and narrows to Sequence<string>
 * values.cast<Admin>(); // throws on the first element that is not one
 * ```
 *
 * It is **optional**, and differs from `@fulcro/reflect`'s in that respect:
 * every operator in this package works with no compiler plugin at all. Only the
 * no-argument forms need it, and they refuse loudly rather than guessing when
 * it has not run.
 *
 * Wire it through `ts-patch`, which teaches `tsc` to honour the `plugins` entry
 * of a tsconfig:
 *
 * ```json
 * { "plugins": [{ "transform": "@fulcro/collections/transformer" }] }
 * ```
 *
 * For a bundler, use `@fulcro/collections/unplugin` instead. Both can sit
 * alongside `@fulcro/reflect`'s: each package rewrites only the calls it owns,
 * and neither knows the other exists.
 */

/**
 * Rewriters of this package, consulted for every call.
 *
 * Exported so that the bundler entry point builds on the same list.
 */
export const REWRITERS: readonly CallRewriter[] = [
	ofTypeRewriter,
	castRewriter,
];

/**
 * The transformer, as `ts-patch` expects to find it.
 *
 * @param program Program being compiled, used for its checker.
 * @param options Options coming from the tsconfig entry.
 * @returns The transformer factory consumed by the compiler.
 */
const transformer: TransformerFactory = createTransformer(REWRITERS);

export default transformer;
