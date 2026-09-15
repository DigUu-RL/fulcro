import * as path from 'node:path';

import typescript from 'typescript';

import { CallRewriter, RewriteContext } from '@fulcro/transform-core';

import { Resolution, resolveTypeToken } from '@/transformer/resolve';

/**
 * Rewriters of `ofType` and `cast`.
 *
 * Both operators already work at runtime, given a token naming what to look
 * for: `'string'`, or a constructor. What they cannot do on their own is take
 * the type as a **type**:
 *
 * ```ts
 * // written                    // emitted
 * values.ofType<string>()       values.ofType('string')
 * values.cast<Admin>()          values.cast(Admin)
 * ```
 *
 * A type argument is erased before the code runs, so without this the call
 * would reach the runtime knowing nothing about what it was asked for. That is
 * why the no-argument forms refuse rather than guess.
 *
 * These are **method** calls, unlike everything `@fulcro/reflect` rewrites.
 * Nothing was imported by the name `ofType`; it is reached through whatever
 * expression it is called on, so the method symbol is followed back to the
 * `Sequence` declaration instead of an import.
 */

/**
 * Path segment identifying the module declaring the sequence operators.
 *
 * Tied to the folder layout `@fulcro/collections` publishes: after resolution
 * the declarations live at `@types/collections/sequence` inside its built
 * output. Moving that folder silently stops the rewriting — a mismatch does not
 * fail loudly on its own, the calls are simply left alone and the runtime
 * refuses them. The compile fixture is what catches it.
 */
const SEQUENCE_MODULE_SEGMENT = path.join('@types', 'collections', 'sequence');

/**
 * Builds the rewriter for one of the two operators.
 *
 * They differ only in their name: what a resolved type argument becomes, and
 * when it cannot be resolved, is the same question for both.
 *
 * @param functionName Name of the method being claimed.
 * @returns The rewriter.
 */
const narrowingRewriter = (functionName: string): CallRewriter => ({
	functionName,
	moduleSegment: SEQUENCE_MODULE_SEGMENT,
	callForm: 'method',

	rewrite: (
		call: typescript.CallExpression,
		context: RewriteContext,
	): typescript.Node | null => {
		const [typeArgument] = call.typeArguments ?? [];

		// Only the no-argument form is ours to fill in. Written with a token
		// already — `ofType('string')` — there is nothing to resolve, and the
		// argument the consumer wrote wins.
		if (typeArgument === undefined || call.arguments.length > 0) return null;

		const resolved: Resolution = resolveTypeToken(typeArgument, call, context);

		// Left alone deliberately when the type has no runtime form. The call
		// reaches the runtime with no argument, which is exactly the shape it
		// refuses — and it refuses with a message naming both reasons it could
		// have arrived that way, since from there they are indistinguishable.
		if (resolved.kind === 'unsupported') return null;

		return context.factory.updateCallExpression(
			call,
			// Visited, so a call further left in the same chain is rewritten too:
			// `seq.ofType<string>().cast<string>()` has one inside the other.
			context.visit(call.expression) as typescript.Expression,
			// Dropped: the type argument has done its work, and leaving it would
			// not match the overload now that an argument is being passed.
			undefined,
			[resolved.token],
		);
	},
});

/** Rewriter turning `ofType<T>()` into the runtime test for `T`. */
export const ofTypeRewriter: CallRewriter = narrowingRewriter('ofType');

/** Rewriter turning `cast<T>()` into the runtime test for `T`. */
export const castRewriter: CallRewriter = narrowingRewriter('cast');
