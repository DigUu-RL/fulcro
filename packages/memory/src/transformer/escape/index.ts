import * as path from 'node:path';

import typescript from 'typescript';

import {
	type CallTarget,
	isOwnedCall,
	type RewriteContext,
	type StatementRewriter,
} from '@fulcro/transform-core';

/**
 * Decides where a storage lives: in a frame of its managed allocator when it
 * cannot outlive the block that allocates it, and in the allocator itself
 * otherwise.
 *
 * ```ts
 * const managed = createManagedAllocator();
 *
 * const step = (): number => {
 * 	const particles = allocate(Particle, 1_000, managed);
 *
 * 	particles.set(0, start);
 *
 * 	return particles.get(0).x;
 * };
 * ```
 *
 * `particles` is only ever reached through its own methods, inside the block
 * that declares it, so nothing can hold it once the block ends. The
 * declaration becomes:
 *
 * ```ts
 * using frame = managed.enter();
 * const particles = allocate(Particle, 1_000, frame);
 * ```
 *
 * and the next call to `step` reuses its bytes instead of asking the engine
 * for a buffer again.
 *
 * Whenever the proof is not there, the storage stays where it was written:
 * everything else a storage can be handed to — a function, `move`, `borrow`,
 * a closure, another variable, a property, a `return` — might keep it past
 * the block. So does a block the frame cannot be scoped to: the top of a
 * module, which never ends, and an `async` function or a generator, which
 * leave their block open across a suspension while other code opens frames
 * of its own. Nothing the analysis declines is wrong; it only goes on costing
 * what it cost.
 */

/** The allocation a declaration has to hold. */
const ALLOCATE: CallTarget = {
	functionName: 'allocate',
	moduleSegment: path.join('allocate', 'index'),
	packageName: '@fulcro/memory',
};

/** What the allocator it is given has to have been made by. */
const CREATE_MANAGED_ALLOCATOR: CallTarget = {
	functionName: 'createManagedAllocator',
	moduleSegment: path.join('managedAllocator', 'index'),
	packageName: '@fulcro/memory',
};

/** The members of a storage that use it without handing it anywhere. */
const LOCAL_MEMBERS: ReadonlySet<string> = new Set(['get', 'set', 'length']);

/** A declaration the rewrite applies to, taken apart. */
interface Candidate {
	/** The `const` statement, as the transformation has it. */
	readonly statement: typescript.VariableStatement;

	/** Its one declaration. */
	readonly declaration: typescript.VariableDeclaration & { readonly name: typescript.Identifier };

	/** The call to `allocate`, three arguments, the last one a name. */
	readonly call: typescript.CallExpression & {
		readonly arguments: typescript.NodeArray<typescript.Expression> &
			readonly [typescript.Expression, typescript.Expression, typescript.Identifier];
	};
}

/**
 * Tells whether declaration flags spell `const`.
 *
 * @param flags Flags of a declaration list, or combined up to one.
 * @returns `true` for `const`; `false` for `let`, `var`, `using` and `await
 * using` — the last of which carries the `Const` bit too, beside `Using`.
 */
const isConstant = (flags: typescript.NodeFlags): boolean => {
	return (flags & typescript.NodeFlags.Const) !== 0 && (flags & typescript.NodeFlags.Using) === 0;
};

/**
 * Takes a statement apart, by syntax alone: a `const` declaring one name
 * whose value is a call to something named `allocate`, with a name as its
 * allocator.
 *
 * Every statement of every block is offered, so this is the cheap part that
 * turns nearly all of them away before the checker is asked anything.
 *
 * @param statement The statement.
 * @returns Its parts, or `null` when it has another shape.
 */
const candidateOf = (statement: typescript.Statement): Candidate | null => {
	if (!typescript.isVariableStatement(statement)) return null;

	const list: typescript.VariableDeclarationList = statement.declarationList;

	if (!isConstant(list.flags)) return null;

	const [declaration, ...others] = list.declarations;

	if (declaration === undefined || others.length > 0) return null;
	if (!typescript.isIdentifier(declaration.name)) return null;

	const call: typescript.Expression | undefined = declaration.initializer;

	if (call === undefined || !typescript.isCallExpression(call)) return null;
	if (!typescript.isIdentifier(call.expression) || call.expression.text !== 'allocate') return null;

	const [, , allocator, ...rest] = call.arguments;

	if (allocator === undefined || rest.length > 0 || !typescript.isIdentifier(allocator)) {
		return null;
	}

	return { statement, declaration, call } as Candidate;
};

/**
 * The symbol a name refers to, through any import or re-export.
 *
 * @param symbol The symbol where the name is used.
 * @param checker Checker of the program.
 * @returns The symbol it was declared as.
 */
const declaredSymbol = (
	symbol: typescript.Symbol,
	checker: typescript.TypeChecker,
): typescript.Symbol => {
	return (symbol.flags & typescript.SymbolFlags.Alias) !== 0
		? checker.getAliasedSymbol(symbol)
		: symbol;
};

/**
 * Tells whether a name is a `const` holding a managed allocator, made where it
 * is declared — the one allocator whose frames never refuse a request, so that
 * moving an allocation into one cannot make it fail.
 *
 * @param name The name given as the allocator.
 * @param checker Checker of the program.
 * @returns `true` for `const name = createManagedAllocator()`.
 */
const isManagedAllocator = (
	name: typescript.Identifier,
	checker: typescript.TypeChecker,
): boolean => {
	const symbol: typescript.Symbol | undefined = checker.getSymbolAtLocation(name);

	if (symbol === undefined) return false;

	const declaration: typescript.Declaration | undefined = declaredSymbol(
		symbol,
		checker,
	).valueDeclaration;

	if (declaration === undefined || !typescript.isVariableDeclaration(declaration)) return false;

	const made: typescript.Expression | undefined = declaration.initializer;

	return (
		isConstant(typescript.getCombinedNodeFlags(declaration)) &&
		made !== undefined &&
		typescript.isCallExpression(made) &&
		made.arguments.length === 0 &&
		isOwnedCall(made, checker, CREATE_MANAGED_ALLOCATOR)
	);
};

/**
 * Tells whether a block ends before anything it started can resume: inside a
 * function that is neither `async` nor a generator.
 *
 * @param block The block.
 * @returns `false` at the top of a module, in a static block, and in a
 * function that can suspend.
 */
const endsWhereItIsLeft = (block: typescript.Block): boolean => {
	for (let node: typescript.Node = block.parent; ; node = node.parent) {
		if (typescript.isSourceFile(node) || typescript.isClassStaticBlockDeclaration(node)) {
			return false;
		}

		if (typescript.isFunctionLike(node)) {
			const suspends: boolean =
				('asteriskToken' in node && node.asteriskToken !== undefined) ||
				(typescript.canHaveModifiers(node) &&
					(typescript.getModifiers(node) ?? []).some((modifier) => {
						return modifier.kind === typescript.SyntaxKind.AsyncKeyword;
					}));

			return !suspends;
		}
	}
};

/**
 * Tells whether one use of a storage keeps it in its block: a method of its
 * own called, or its length read, outside any function created in the block.
 *
 * @param use The name, where the storage is used.
 * @param block The block that declares it.
 * @returns `false` for any use that might hand the storage on.
 */
const isLocalUse = (use: typescript.Identifier, block: typescript.Block): boolean => {
	const member: typescript.Node = use.parent;

	if (
		!typescript.isPropertyAccessExpression(member) ||
		member.expression !== use ||
		!LOCAL_MEMBERS.has(member.name.text)
	) {
		return false;
	}

	// `storage.get` taken as a value works detached, and keeps the storage.
	const called: boolean =
		typescript.isCallExpression(member.parent) && member.parent.expression === member;

	if (member.name.text !== 'length' && !called) return false;

	for (let node: typescript.Node = member.parent; node !== block; node = node.parent) {
		if (typescript.isFunctionLike(node) || typescript.isClassLike(node)) return false;
	}

	return true;
};

/**
 * The identifiers of each block walked so far, by their text.
 *
 * A block holding many candidates would otherwise be walked once for each of
 * them, which grows with the square of its size. Keyed by the node as written,
 * which no later compilation reuses, so an entry goes when its program does.
 */
const identifiersOf = new WeakMap<
	typescript.Block,
	ReadonlyMap<string, readonly typescript.Identifier[]>
>();

/**
 * The identifiers of a block that may reach a value at runtime, by their text:
 * a type names a variable without reaching it, so none inside one is listed.
 *
 * @param block The block, as written.
 * @returns Its identifiers, gathered on the first call for the block.
 */
const identifiersIn = (
	block: typescript.Block,
): ReadonlyMap<string, readonly typescript.Identifier[]> => {
	const known: ReadonlyMap<string, readonly typescript.Identifier[]> | undefined =
		identifiersOf.get(block);

	if (known !== undefined) return known;

	const found = new Map<string, typescript.Identifier[]>();

	const gather = (node: typescript.Node): void => {
		if (typescript.isTypeNode(node)) return;

		if (typescript.isIdentifier(node)) {
			const same: typescript.Identifier[] = found.get(node.text) ?? [];

			same.push(node);
			found.set(node.text, same);

			return;
		}

		typescript.forEachChild(node, gather);
	};

	gather(block);
	identifiersOf.set(block, found);

	return found;
};

/**
 * Tells whether every use of a variable keeps it in the block declaring it.
 *
 * Only identifiers spelled like the variable are put to the checker; every
 * other one is turned away by its text.
 *
 * @param declaration The declaration, as written.
 * @param block The block declaring it, as written.
 * @param checker Checker of the program.
 * @returns `true` when nothing can reach the value once the block ends.
 */
const staysInBlock = (
	declaration: typescript.VariableDeclaration & { readonly name: typescript.Identifier },
	block: typescript.Block,
	checker: typescript.TypeChecker,
): boolean => {
	const symbol: typescript.Symbol | undefined = checker.getSymbolAtLocation(declaration.name);

	if (symbol === undefined) return false;

	const spelled: readonly typescript.Identifier[] =
		identifiersIn(block).get(declaration.name.text) ?? [];

	return spelled.every((identifier) => {
		if (identifier === declaration.name) return true;

		const used: typescript.Symbol | undefined = typescript.isShorthandPropertyAssignment(
			identifier.parent,
		)
			? checker.getShorthandAssignmentValueSymbol(identifier.parent)
			: checker.getSymbolAtLocation(identifier);

		// A name declared again inside the block — a parameter, a variable of a
		// nested function — is another variable, and says nothing about this one.
		return used !== symbol || isLocalUse(identifier, block);
	});
};

/**
 * The rewrite, as the transformer runs it: offered every statement of every
 * block.
 */
export const escapeRewriter: StatementRewriter = {
	functionNames: ['allocate'],
	rewrite: (statement, context: RewriteContext): readonly typescript.Statement[] | null => {
		const current: Candidate | null = candidateOf(statement);

		if (current === null) return null;

		// The checker knows the statement as written; another package's
		// transformer may have handed over a copy with no position.
		const written: Candidate | null = candidateOf(
			typescript.getOriginalNode(statement, typescript.isVariableStatement),
		);

		const block: typescript.Node | undefined = written?.statement.parent;

		if (
			written === null ||
			block === undefined ||
			!typescript.isBlock(block) ||
			!isOwnedCall(written.call, context.checker, ALLOCATE) ||
			!isManagedAllocator(written.call.arguments[2], context.checker) ||
			!endsWhereItIsLeft(block) ||
			!staysInBlock(written.declaration, block, context.checker)
		) {
			return null;
		}

		const { factory } = context;
		const frame: typescript.Identifier = factory.createUniqueName('frame');
		const [element, length, allocator] = current.call.arguments;

		const opened: typescript.VariableStatement = factory.createVariableStatement(
			undefined,
			factory.createVariableDeclarationList(
				[
					factory.createVariableDeclaration(
						frame,
						undefined,
						undefined,
						factory.createCallExpression(
							factory.createPropertyAccessExpression(allocator, 'enter'),
							undefined,
							[],
						),
					),
				],
				typescript.NodeFlags.Using,
			),
		);

		const allocated: typescript.VariableStatement = factory.updateVariableStatement(
			current.statement,
			current.statement.modifiers,
			factory.updateVariableDeclarationList(current.statement.declarationList, [
				factory.updateVariableDeclaration(
					current.declaration,
					current.declaration.name,
					current.declaration.exclamationToken,
					current.declaration.type,
					factory.updateCallExpression(
						current.call,
						current.call.expression,
						current.call.typeArguments,
						[element, length, frame],
					),
				),
			]),
		);

		return [opened, allocated];
	},
};
