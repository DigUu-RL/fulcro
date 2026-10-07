import * as vm from 'node:vm';

import typescript from 'typescript';

import { createError } from '@fulcro/errors';
import {
	type CallRewriter,
	isOwnedCall,
	type RewriteContext,
	utilityModuleSegment,
} from '@fulcro/transform-core';

import { describeUnwritable } from '@/functions/utils/constantOf';
import { constantLiteral } from '@/transformer/literal';

/**
 * Compile-time evaluation of `constantOf`.
 *
 * Three steps, each of which can refuse:
 *
 * 1. **Prove.** Every name the function reads from outside itself is followed
 *    to its declaration. A `const` is proved by proving its initializer, a
 *    function by proving its body, a built-in by being on {@link BUILT_INS};
 *    anything else — a parameter, a `let`, a value only a `.d.ts` declares —
 *    is the reason the call is refused. A `const` holding another
 *    `constantOf` contributes its evaluated value, so a constant is evaluated
 *    once however many others read it.
 * 2. **Evaluate.** What was proved is assembled into one script — each outside
 *    name renamed to a binding of its own, so two files' `table` never meet —
 *    compiled to JavaScript and run in a fresh `node:vm` context: its own
 *    built-ins, no `Math.random`, no code generated from strings, and a time
 *    limit.
 * 3. **Emit.** The result, if a literal can write it, replaces the call,
 *    frozen at every level as the runtime would have frozen it.
 *
 * A refusal is an error at the call — never a quiet fallback to the runtime,
 * which would ship a computation the program asked to have done already.
 */

/** How long one evaluation may run, in milliseconds. */
const EVALUATION_TIMEOUT = 5_000;

/** How the call reads in a message; the diagnostic already says where. */
const CALL = 'constantOf(…)';

/**
 * The built-ins a constant may read: those whose answer depends on nothing but
 * their arguments. `Date`, `globalThis`, `process` and their like are left out
 * — they would make the result depend on when and where the build ran — and
 * `Math.random` is removed from the context the evaluation runs in.
 */
const BUILT_INS: ReadonlySet<string> = new Set([
	'Array',
	'ArrayBuffer',
	'BigInt',
	'BigInt64Array',
	'BigUint64Array',
	'Boolean',
	'DataView',
	'Error',
	'Float32Array',
	'Float64Array',
	'Infinity',
	'Int16Array',
	'Int32Array',
	'Int8Array',
	'JSON',
	'Map',
	'Math',
	'NaN',
	'Number',
	'Object',
	'RangeError',
	'RegExp',
	'Set',
	'String',
	'TypeError',
	'Uint16Array',
	'Uint32Array',
	'Uint8Array',
	'Uint8ClampedArray',
	'decodeURIComponent',
	'encodeURIComponent',
	'isFinite',
	'isNaN',
	'parseFloat',
	'parseInt',
	'undefined',
]);

/** What evaluating a call came to: its value, or the refusal to report. */
type Outcome =
	| { readonly kind: 'value'; readonly value: unknown }
	| { readonly kind: 'refused'; readonly message: string };

/** A proof that failed, and the name that made it fail. */
interface Failure {
	readonly reason: string;
}

/** Everything proved so far for one evaluation. */
interface Assembly {
	/** Binding each outside declaration was given in the script. */
	readonly bindings: Map<typescript.Symbol, string>;

	/** Declarations of the script, each after those it reads. */
	readonly declarations: string[];
}

/**
 * The outcome of every call already evaluated, per program, so a constant read
 * by several others is still evaluated once.
 */
const outcomes = new WeakMap<
	typescript.TypeChecker,
	Map<typescript.CallExpression, Outcome>
>();

/**
 * Tells whether a node sits inside another, in the same file.
 *
 * @param inner Node that may be inside.
 * @param outer Node that may contain it.
 * @returns `true` when it does.
 */
const isWithin = (inner: typescript.Node, outer: typescript.Node): boolean =>
	inner.getSourceFile() === outer.getSourceFile() &&
	inner.pos >= outer.pos &&
	inner.end <= outer.end;

/**
 * Tells whether an identifier is read as a value, rather than naming a member,
 * a declaration or a type.
 *
 * @param identifier The identifier.
 * @param root Node being proved, beyond which no ancestor is looked at.
 * @returns `true` when it reads a binding.
 */
const isValueReference = (
	identifier: typescript.Identifier,
	root: typescript.Node,
): boolean => {
	const { parent } = identifier;

	if (
		(typescript.isPropertyAccessExpression(parent) &&
			parent.name === identifier) ||
		(typescript.isPropertyAssignment(parent) && parent.name === identifier) ||
		(typescript.isMethodDeclaration(parent) && parent.name === identifier) ||
		(typescript.isPropertyDeclaration(parent) && parent.name === identifier) ||
		(typescript.isGetAccessor(parent) && parent.name === identifier) ||
		(typescript.isSetAccessor(parent) && parent.name === identifier) ||
		(typescript.isBindingElement(parent) &&
			parent.propertyName === identifier) ||
		typescript.isLabeledStatement(parent) ||
		typescript.isBreakOrContinueStatement(parent)
	) {
		return false;
	}

	for (
		let ancestor: typescript.Node = parent;
		ancestor !== root && ancestor !== undefined;
		ancestor = ancestor.parent
	) {
		if (typescript.isTypeNode(ancestor)) return false;
	}

	return true;
};

/**
 * Describes what a declaration is, for the reason a name was refused.
 *
 * @param declaration The declaration.
 * @returns A phrase: `a parameter`, `a class`, …
 */
const describeDeclaration = (declaration: typescript.Declaration): string => {
	if (typescript.isParameter(declaration)) return 'a parameter';
	if (typescript.isClassDeclaration(declaration)) return 'a class';
	if (typescript.isEnumDeclaration(declaration)) return 'an enum';
	if (typescript.isNamespaceImport(declaration)) return 'a namespace import';
	if (typescript.isBindingElement(declaration)) return 'destructured';

	return 'not a const or a function';
};

/**
 * Proves a node constant, and returns its text with every outside name renamed
 * to its binding.
 *
 * @param node Expression or function being proved.
 * @param context Compilation in progress.
 * @param assembly What has been proved so far.
 * @param start Where its text starts, when not where the node does.
 * @returns The text, or why the node cannot be proved.
 */
const prove = (
	node: typescript.Node,
	context: RewriteContext,
	assembly: Assembly,
	start: number = node.getStart(),
): string | Failure => {
	const { checker } = context;
	const source: typescript.SourceFile = node.getSourceFile();
	const replacements: { start: number; end: number; text: string }[] = [];
	let failure: Failure | null = null;

	const walk = (current: typescript.Node): void => {
		if (failure !== null) return;

		if (
			typescript.isMetaProperty(current) ||
			(typescript.isCallExpression(current) &&
				current.expression.kind === typescript.SyntaxKind.ImportKeyword)
		) {
			failure = { reason: 'it loads a module' };

			return;
		}

		if (typescript.isIdentifier(current) && isValueReference(current, node)) {
			const shorthand: boolean =
				typescript.isShorthandPropertyAssignment(current.parent) &&
				current.parent.name === current;
			const symbol: typescript.Symbol | undefined = shorthand
				? checker.getShorthandAssignmentValueSymbol(current.parent)
				: checker.getSymbolAtLocation(current);

			if (symbol !== undefined) {
				const binding: string | Failure = bind(
					current.text,
					symbol,
					node,
					context,
					assembly,
				);

				if (typeof binding !== 'string') {
					failure = binding;

					return;
				}

				if (binding !== '') {
					replacements.push({
						start: current.getStart(source),
						end: current.end,
						text: shorthand ? `${current.text}: ${binding}` : binding,
					});
				}
			}
		}

		typescript.forEachChild(current, walk);
	};

	walk(node);

	if (failure !== null) return failure;

	let text: string = source.text.slice(start, node.end);

	for (const replacement of replacements.sort(
		(left, right) => right.start - left.start,
	)) {
		text =
			text.slice(0, replacement.start - start) +
			replacement.text +
			text.slice(replacement.end - start);
	}

	return text;
};

/**
 * Where a function declaration's text starts once `export` and `default` are
 * left out — which a function expression cannot carry — and `async` kept.
 *
 * @param declaration The declaration.
 * @returns The position.
 */
const functionStart = (declaration: typescript.FunctionDeclaration): number => {
	const kept: typescript.ModifierLike | undefined = declaration.modifiers?.find(
		(modifier) =>
			modifier.kind !== typescript.SyntaxKind.ExportKeyword &&
			modifier.kind !== typescript.SyntaxKind.DefaultKeyword,
	);

	if (kept !== undefined) return kept.getStart();

	const keyword: typescript.Node | undefined = declaration
		.getChildren()
		.find((child) => child.kind === typescript.SyntaxKind.FunctionKeyword);

	return (keyword ?? declaration).getStart();
};

/**
 * Proves the declaration a name reads, and gives it a binding in the script.
 *
 * @param name The name, as written.
 * @param symbol What it resolves to.
 * @param root Node being proved; a declaration inside it is its own business.
 * @param context Compilation in progress.
 * @param assembly What has been proved so far.
 * @returns The binding; `''` when the name is local or a built-in and stays as
 * written; or why it cannot be proved.
 */
const bind = (
	name: string,
	symbol: typescript.Symbol,
	root: typescript.Node,
	context: RewriteContext,
	assembly: Assembly,
): string | Failure => {
	const { checker } = context;
	const resolved: typescript.Symbol =
		(symbol.flags & typescript.SymbolFlags.Alias) !== 0
			? checker.getAliasedSymbol(symbol)
			: symbol;
	const declarations: readonly typescript.Declaration[] =
		resolved.declarations ?? [];

	// `undefined` is the one built-in the checker gives a symbol with no
	// declaration at all.
	if (declarations.length === 0) {
		return BUILT_INS.has(resolved.name)
			? ''
			: { reason: `'${name}' has no declaration the compiler can see` };
	}

	if (declarations.every((declaration) => isWithin(declaration, root))) {
		return '';
	}

	const [declaration] = declarations;
	const file: typescript.SourceFile = declaration.getSourceFile();

	if (file.hasNoDefaultLib) {
		return BUILT_INS.has(resolved.name)
			? ''
			: {
					reason: `'${name}' is a built-in whose answer can change from one build to the next`,
				};
	}

	if (file.isDeclarationFile) {
		return {
			reason: `'${name}' is only declared in a declaration file, whose value the compiler cannot see`,
		};
	}

	const known: string | undefined = assembly.bindings.get(resolved);

	if (known !== undefined) return known;

	const binding = `constant${assembly.bindings.size}_${resolved.name}`;

	// Reserved before the declaration is proved, so two functions calling each
	// other each find the other's binding instead of proving forever.
	assembly.bindings.set(resolved, binding);

	if (typescript.isFunctionDeclaration(declaration)) {
		if (declaration.body === undefined) {
			return { reason: `'${name}' is an overload with no body` };
		}

		const text: string | Failure = prove(
			declaration,
			context,
			assembly,
			functionStart(declaration),
		);

		if (typeof text !== 'string') return text;

		// A declaration in parentheses is a named function expression, which
		// keeps its own name for its recursion.
		assembly.declarations.push(`const ${binding} = (${text});`);

		return binding;
	}

	if (
		!typescript.isVariableDeclaration(declaration) ||
		!typescript.isIdentifier(declaration.name)
	) {
		return {
			reason: `'${name}' is ${describeDeclaration(declaration)}`,
		};
	}

	if ((declaration.parent.flags & typescript.NodeFlags.Const) === 0) {
		return {
			reason: `'${name}' is declared with let or var, so it can change`,
		};
	}

	const { initializer } = declaration;

	if (initializer === undefined) {
		return { reason: `'${name}' has no initializer` };
	}

	if (
		typescript.isCallExpression(initializer) &&
		isOwnedCall(initializer, checker, constantOfRewriter)
	) {
		const outcome: Outcome = evaluate(initializer, context);

		if (outcome.kind === 'refused') {
			return { reason: `'${name}' is a constant that could not be evaluated` };
		}

		assembly.declarations.push(
			`const ${binding} = ${printLiteral(outcome.value)};`,
		);

		return binding;
	}

	const text: string | Failure = prove(initializer, context, assembly);

	if (typeof text !== 'string') return text;

	assembly.declarations.push(`const ${binding} = (${text});`);

	return binding;
};

/**
 * A value as the source of a literal, for the script of another evaluation.
 *
 * @param value A value a literal can write.
 * @returns Its source.
 */
const printLiteral = (value: unknown): string =>
	typescript
		.createPrinter()
		.printNode(
			typescript.EmitHint.Expression,
			constantLiteral(typescript.factory, value),
			typescript.createSourceFile('', '', typescript.ScriptTarget.ES2022),
		);

/**
 * Describes what an evaluation threw, which may come from the evaluation's own
 * realm and so is not an `Error` of this one.
 *
 * @param thrown What was thrown.
 * @returns Its message, or its text.
 */
const describeThrown = (thrown: unknown): string => {
	const message: unknown = (thrown as { message?: unknown } | null)?.message;

	return typeof message === 'string' ? message : String(thrown);
};

/**
 * Runs a script in a context of its own.
 *
 * @param script The script, in JavaScript, its last statement the value.
 * @returns The value, or the refusal.
 */
const run = (script: string): Outcome => {
	const sandbox: vm.Context = vm.createContext(
		{},
		{ codeGeneration: { strings: false, wasm: false } },
	);

	vm.runInContext('delete Math.random;', sandbox);

	try {
		return {
			kind: 'value',
			value: vm.runInContext(script, sandbox, { timeout: EVALUATION_TIMEOUT }),
		};
	} catch (thrown) {
		return {
			kind: 'refused',
			message:
				(thrown as { code?: unknown } | null)?.code ===
				'ERR_SCRIPT_EXECUTION_TIMEOUT'
					? createError('FULCRO4013', {
							operation: 'constantOf',
							call: CALL,
							milliseconds: EVALUATION_TIMEOUT,
						}).message
					: createError('FULCRO4012', {
							operation: 'constantOf',
							call: CALL,
							thrown: describeThrown(thrown),
						}).message,
		};
	}
};

/**
 * Evaluates one call, once per program.
 *
 * @param call The call.
 * @param context Compilation in progress.
 * @returns Its value, or why it has none.
 */
const evaluate = (
	call: typescript.CallExpression,
	context: RewriteContext,
): Outcome => {
	let evaluated: Map<typescript.CallExpression, Outcome> | undefined =
		outcomes.get(context.checker);

	if (evaluated === undefined) {
		evaluated = new Map();
		outcomes.set(context.checker, evaluated);
	}

	const known: Outcome | undefined = evaluated.get(call);

	if (known !== undefined) return known;

	const outcome: Outcome = computeOutcome(call, context);

	evaluated.set(call, outcome);

	return outcome;
};

/**
 * Proves, assembles, runs and checks one call.
 *
 * @param call The call.
 * @param context Compilation in progress.
 * @returns Its value, or why it has none.
 */
const computeOutcome = (
	call: typescript.CallExpression,
	context: RewriteContext,
): Outcome => {
	const refuse = (reason: string): Outcome => ({
		kind: 'refused',
		message: createError('FULCRO4010', {
			operation: 'constantOf',
			call: CALL,
			reason,
		}).message,
	});

	if (call.arguments.length !== 1) {
		return refuse('it takes exactly one function');
	}

	const [argument] = call.arguments;

	if (
		!typescript.isArrowFunction(argument) &&
		!typescript.isFunctionExpression(argument) &&
		!typescript.isIdentifier(argument)
	) {
		return refuse('its argument is neither a function nor the name of one');
	}

	const assembly: Assembly = { bindings: new Map(), declarations: [] };
	const text: string | Failure = prove(argument, context, assembly);

	if (typeof text !== 'string') return refuse(text.reason);

	const script: string = typescript.transpileModule(
		`${assembly.declarations.join('\n')}\n(${text})();\n`,
		{
			compilerOptions: {
				target: typescript.ScriptTarget.ES2022,
				module: typescript.ModuleKind.None,
				alwaysStrict: true,
			},
		},
	).outputText;

	const outcome: Outcome = run(script);

	if (outcome.kind === 'refused') return outcome;

	const unwritable: string | null = describeUnwritable(outcome.value);

	return unwritable === null
		? outcome
		: {
				kind: 'refused',
				message: createError('FULCRO4011', {
					operation: 'constantOf',
					call: CALL,
					received: unwritable,
				}).message,
			};
};

/**
 * Rewriter of `constantOf`.
 *
 * ```ts
 * // written                                   // emitted
 * constantOf(() => [1, 2, 3].map((n) => n * n)) Object.freeze([1, 4, 9])
 * ```
 */
export const constantOfRewriter: CallRewriter = {
	functionName: 'constantOf',
	moduleSegment: utilityModuleSegment('constantOf'),
	rewrite: (call, context) => {
		const outcome: Outcome = evaluate(call, context);

		if (outcome.kind === 'refused') {
			context.report(call, outcome.message);

			return null;
		}

		return constantLiteral(context.factory, outcome.value);
	},
};
