import {
	type CallRewriter,
	createTransformer,
	type TransformerFactory,
} from '@fulcro/transform-core';

// Re-exported straight from the source rather than imported and exported
// again, which TypeScript reads as an alias defined in terms of itself.
export type { TransformerOptions } from '@fulcro/transform-core';

import { alignOfRewriter } from '@/transformer/alignOf';
import { asRewriter } from '@/transformer/as';
import { defaultOfRewriter } from '@/transformer/defaultOf';
import { isRewriter } from '@/transformer/is';
import { keysOfRewriter } from '@/transformer/keysOf';
import { nameOfRewriter } from '@/transformer/nameOf';
import { pathOfRewriter } from '@/transformer/pathOf';
import { pathsOfRewriter } from '@/transformer/pathsOf';
import { sizeOfRewriter } from '@/transformer/sizeOf';
import { typeOfRewriter } from '@/transformer/typeOf';

/**
 * Compile time transformer backing `nameOf`, `typeOf` and `defaultOf`.
 *
 * TypeScript erases its own type system on the way to JavaScript: interfaces,
 * type aliases, generic arguments and the file a type was declared in leave no
 * trace in the emitted code. Anything a runtime function could report about a
 * value is therefore limited to the value itself, which is why `nameOf` has to
 * parse closures, `typeOf` can only inspect prototypes, and `defaultOf` has
 * nothing at all to work with.
 *
 * It ships **inside this package**, rather than beside it, and that is the
 * whole point: there is no second thing to install and therefore no way to end
 * up with the utilities but not the transformer, and no way for the two to
 * drift apart in version. What the calls mean and what they compile to are
 * released together because they are the same package.
 *
 * Wire it through `ts-patch`, which teaches `tsc` to honour the `plugins` entry
 * of a tsconfig:
 *
 * ```json
 * { "plugins": [{ "transform": "@fulcro/reflect/transformer" }] }
 * ```
 *
 * For a bundler, use `@fulcro/reflect/unplugin` instead.
 *
 * Calls this cannot resolve are left untouched, so the runtime implementations
 * stay in charge and a project compiling without it keeps working — with
 * `declared` reading `null`, `nameOf` falling back to parsing, and `defaultOf`
 * throwing, since a default it cannot compute would be a lie.
 */

/**
 * Rewriters of this package, consulted for every call.
 *
 * Each one claims a single exported function of a single module, so the order
 * carries no meaning beyond the one a reader gives it. Exported so that the
 * bundler entry point can build on the same list.
 */
export const REWRITERS: readonly CallRewriter[] = [
	nameOfRewriter,
	typeOfRewriter,
	defaultOfRewriter,
	isRewriter,
	asRewriter,
	keysOfRewriter,
	pathOfRewriter,
	pathsOfRewriter,
	sizeOfRewriter,
	alignOfRewriter,
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
