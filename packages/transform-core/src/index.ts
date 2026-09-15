/**
 * Shared machinery behind the Fulcro compile time transformers.
 *
 * **Not a package to depend on directly.** It is installed for you by
 * `@fulcro/reflect` and `@fulcro/collections`, each of which ships its own
 * transformer built on this, and its shape is theirs to change.
 *
 * What lives here is everything that has nothing to do with any particular
 * utility: following a call back to the declaration that owns it, walking a
 * source file once, building and keeping a program for the bundlers that have
 * no checker of their own, and the adapter surface `unplugin` expects.
 *
 * What lives in each library instead is the part that knows what to emit — how
 * `defaultOf` fills a tuple, how `ofType` turns a type argument into a runtime
 * test. That split is why a package can own its compile time behaviour without
 * a second install, and why two of them can do so without knowing about each
 * other.
 */

export {
	createFileTransformer,
	type FileTransformer,
	type TransformCoreOptions,
} from '@/program';
export {
	type CallForm,
	type CallRewriter,
	IDENTIFIER_PATTERN,
	isOwnedCall,
	isTupleType,
	type RewriteContext,
	utilityModuleSegment,
} from '@/shared';
export {
	createTransformer,
	type TransformerFactory,
	type TransformerOptions,
} from '@/transformer';
