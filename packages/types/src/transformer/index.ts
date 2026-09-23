import {
	createProgramTransformer,
	type ProgramTransformer,
} from '@fulcro/transform-core';

import { OPERATOR_REWRITER } from '@/transformer/rewriter';

/**
 * The `tsc` plugin giving the operators their meaning on this package's
 * numeric types.
 *
 * A program transformer, not an ordinary one, and the tsconfig entry has to say
 * so: the rewrite must happen before the program is type checked, or
 * `decimal * decimal` has been reported as an error before anything could
 * rewrite it. Wire it through `ts-patch`:
 *
 * ```json
 * {
 * 	"compilerOptions": {
 * 		"plugins": [{ "transform": "@fulcro/types/transformer", "transformProgram": true }]
 * 	}
 * }
 * ```
 *
 * For a bundler use `@fulcro/types/unplugin`, and for the editor
 * `@fulcro/types/language-service`.
 *
 * Without it, the operators are the language's own: a primitive-backed type
 * does plain, unchecked arithmetic on its `number` or `bigint`, and a `Decimal`
 * is refused by the checker and throws at runtime.
 */
const transformer: ProgramTransformer =
	createProgramTransformer(OPERATOR_REWRITER);

export default transformer;
