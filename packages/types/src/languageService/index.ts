import {
	createLanguageServicePlugin,
	type LanguageServicePlugin,
} from '@fulcro/transform-core';

import { OPERATOR_REWRITER } from '@/transformer/rewriter';

/**
 * The editor plugin giving the operators their meaning on this package's
 * numeric types: the types, the hover, the completions and the errors an editor
 * shows are those of the rewritten code, mapped back onto the code as written.
 *
 * ```json
 * {
 * 	"compilerOptions": {
 * 		"plugins": [{ "name": "@fulcro/types/language-service" }]
 * 	}
 * }
 * ```
 *
 * VS Code loads it only from the workspace's own TypeScript: select it with
 * **TypeScript: Select TypeScript Version → Use Workspace Version**. An editor
 * that does not load it shows what `tsc` alone would — the operators on a
 * `Decimal` underlined, the others typed as `number`.
 */
const plugin: LanguageServicePlugin =
	createLanguageServicePlugin(OPERATOR_REWRITER);

// `tsserver` loads a plugin with `require` and calls what it gets.
export = plugin;
