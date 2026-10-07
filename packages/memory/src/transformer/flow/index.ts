import typescript from 'typescript';

/**
 * Walks a function in the order its code runs, carrying facts along every
 * path through it.
 *
 * Knows nothing of what the facts are: the rules that read and change them
 * are handed in, so the walk can serve another analysis — data races, after
 * borrows — without being copied. That is also why nothing here names a
 * function of this package.
 *
 * TypeScript keeps its own control flow graph internal, so this follows the
 * syntax instead, and approximates where the syntax does: a path that may run
 * counts as having run. Both branches of an `if` are joined; a loop body is
 * walked twice, so that what the end of one iteration did is seen by the
 * start of the next; a `catch` starts from both the start and the end of its
 * `try`. Code after `return`, `throw`, `break` or `continue` is not on any
 * path, and nothing in it is reported.
 */

/** What an analysis supplies to be carried through a function. */
export interface FlowRules<TFacts> {
	/** The facts at the start of a function. */
	readonly initial: () => TFacts;

	/** An independent copy, for a path that splits off. */
	readonly copy: (facts: TFacts) => TFacts;

	/**
	 * What holds after either of two paths: a new value, the two left alone.
	 */
	readonly join: (first: TFacts, second: TFacts) => TFacts;

	/**
	 * Whether two sets of facts say the same thing: when an iteration leaves
	 * a loop's facts as it found them, a second walk would find nothing new.
	 */
	readonly same: (first: TFacts, second: TFacts) => boolean;

	/**
	 * An identifier is read, where the code runs it.
	 *
	 * @param identifier The identifier read.
	 * @param facts The facts on this path, before the read.
	 */
	readonly read: (identifier: typescript.Identifier, facts: TFacts) => void;

	/**
	 * A call has evaluated its callee and its arguments and now runs.
	 *
	 * @param call The call.
	 * @param facts The facts on this path, changed in place.
	 */
	readonly call: (call: typescript.CallExpression, facts: TFacts) => void;

	/**
	 * A variable is given a value — declared, or assigned with `=` — once the
	 * value has been evaluated.
	 *
	 * @param name The variable.
	 * @param value What it was given; `undefined` for a declaration without
	 * one, and for each new value of a `for…of` or `for…in` variable.
	 * @param facts The facts on this path, changed in place.
	 */
	readonly bind: (
		name: typescript.Identifier,
		value: typescript.Expression | undefined,
		facts: TFacts,
	) => void;

	/**
	 * A function is created here, closing over what it names. Its own body is
	 * walked separately, from the initial facts.
	 *
	 * @param created The function, method or accessor.
	 * @param facts The facts on this path, where it is created.
	 */
	readonly capture: (
		created: typescript.FunctionLikeDeclaration,
		facts: TFacts,
	) => void;
}

/** The facts along one path, and whether any code runs on it at all. */
interface Path<TFacts> {
	readonly facts: TFacts;
	readonly reachable: boolean;
}

/** Where `break` and `continue` leave from, for the statement they target. */
interface Jumps<TFacts> {
	readonly breaks: Path<TFacts>[];
	readonly continues: Path<TFacts>[];
}

/** A function whose body is walked on its own. */
type FunctionWithBody = typescript.FunctionLikeDeclaration & {
	readonly body: typescript.Node;
};

/**
 * Tells whether a node is a function with a body to walk.
 *
 * @param node The node.
 * @returns `true` for a function, method, accessor or constructor with a body.
 */
const isFunctionWithBody = (node: typescript.Node): node is FunctionWithBody =>
	typescript.isFunctionLike(node) &&
	'body' in node &&
	(node as { body?: typescript.Node }).body !== undefined;

/**
 * Walks every function of a file, the top level included, each from the
 * initial facts.
 *
 * @template TFacts What the analysis carries.
 * @param sourceFile The file.
 * @param rules The analysis.
 */
export const walkFlow = <TFacts>(
	sourceFile: typescript.SourceFile,
	rules: FlowRules<TFacts>,
): void => {
	const pending: typescript.Node[] = [sourceFile];

	const start = (): Path<TFacts> => ({
		facts: rules.initial(),
		reachable: true,
	});

	const unreachable = (): Path<TFacts> => ({
		facts: rules.initial(),
		reachable: false,
	});

	const fork = (path: Path<TFacts>): Path<TFacts> => ({
		facts: rules.copy(path.facts),
		reachable: path.reachable,
	});

	const merge = (first: Path<TFacts>, second: Path<TFacts>): Path<TFacts> =>
		!first.reachable
			? second
			: !second.reachable
				? first
				: { facts: rules.join(first.facts, second.facts), reachable: true };

	const mergeAll = (
		first: Path<TFacts>,
		rest: readonly Path<TFacts>[],
	): Path<TFacts> => rest.reduce(merge, first);

	/**
	 * Notes a function created here, and queues its body.
	 *
	 * @param declaration The function.
	 * @param path The path it is created on.
	 */
	const created = (
		declaration: typescript.FunctionLikeDeclaration,
		path: Path<TFacts>,
	): void => {
		if (path.reachable) rules.capture(declaration, path.facts);
		if (isFunctionWithBody(declaration)) pending.push(declaration.body);
	};

	/**
	 * Notes the methods, accessors and constructor of a class as functions
	 * created where the class is defined. Field initializers and static
	 * blocks are not walked: they run when the class is instantiated or
	 * loaded, which the syntax does not place on any path.
	 *
	 * @param node The class.
	 * @param path The path it is defined on.
	 */
	const defineClass = (
		node: typescript.ClassLikeDeclaration,
		path: Path<TFacts>,
	): void => {
		for (const member of node.members) {
			if (isFunctionWithBody(member)) created(member, path);
		}
	};

	const expression = (
		node: typescript.Node,
		path: Path<TFacts>,
	): Path<TFacts> => {
		if (typescript.isTypeNode(node)) return path;

		if (typescript.isIdentifier(node)) {
			if (path.reachable) rules.read(node, path.facts);

			return path;
		}

		if (typescript.isPropertyAccessExpression(node)) {
			return expression(node.expression, path);
		}

		if (
			typescript.isParenthesizedExpression(node) ||
			typescript.isAsExpression(node) ||
			typescript.isSatisfiesExpression(node) ||
			typescript.isTypeAssertionExpression(node) ||
			typescript.isNonNullExpression(node)
		) {
			return expression(node.expression, path);
		}

		if (typescript.isCallExpression(node)) {
			let after: Path<TFacts> = expression(node.expression, path);

			for (const argument of node.arguments) {
				after = expression(argument, after);
			}

			if (after.reachable) rules.call(node, after.facts);

			return after;
		}

		if (typescript.isBinaryExpression(node)) return binary(node, path);

		if (typescript.isConditionalExpression(node)) {
			const condition: Path<TFacts> = expression(node.condition, path);
			const whenTrue: Path<TFacts> = expression(node.whenTrue, fork(condition));

			return merge(whenTrue, expression(node.whenFalse, condition));
		}

		if (
			typescript.isArrowFunction(node) ||
			typescript.isFunctionExpression(node)
		) {
			created(node, path);

			return path;
		}

		if (typescript.isClassExpression(node)) {
			defineClass(node, path);

			return path;
		}

		if (typescript.isObjectLiteralExpression(node)) {
			return node.properties.reduce(property, path);
		}

		let after: Path<TFacts> = path;

		typescript.forEachChild(node, (child) => {
			after = expression(child, after);
		});

		return after;
	};

	const property = (
		path: Path<TFacts>,
		node: typescript.ObjectLiteralElementLike,
	): Path<TFacts> => {
		const named: Path<TFacts> =
			node.name !== undefined && typescript.isComputedPropertyName(node.name)
				? expression(node.name.expression, path)
				: path;

		if (typescript.isPropertyAssignment(node)) {
			return expression(node.initializer, named);
		}

		if (typescript.isShorthandPropertyAssignment(node)) {
			return expression(node.name, named);
		}

		if (typescript.isSpreadAssignment(node)) {
			return expression(node.expression, named);
		}

		created(node, named);

		return named;
	};

	const binary = (
		node: typescript.BinaryExpression,
		path: Path<TFacts>,
	): Path<TFacts> => {
		const operator: typescript.SyntaxKind = node.operatorToken.kind;

		// The right side of these runs only on some paths.
		if (
			operator === typescript.SyntaxKind.AmpersandAmpersandToken ||
			operator === typescript.SyntaxKind.BarBarToken ||
			operator === typescript.SyntaxKind.QuestionQuestionToken
		) {
			const left: Path<TFacts> = expression(node.left, path);

			return merge(left, expression(node.right, fork(left)));
		}

		// A plain assignment gives the variable a new value; it does not read
		// the old one.
		if (
			operator === typescript.SyntaxKind.EqualsToken &&
			typescript.isIdentifier(node.left)
		) {
			const after: Path<TFacts> = expression(node.right, path);

			if (after.reachable) rules.bind(node.left, node.right, after.facts);

			return after;
		}

		return expression(node.right, expression(node.left, path));
	};

	const declare = (
		list: typescript.VariableDeclarationList,
		path: Path<TFacts>,
	): Path<TFacts> =>
		list.declarations.reduce((before, declaration) => {
			const after: Path<TFacts> =
				declaration.initializer === undefined
					? before
					: expression(declaration.initializer, before);

			if (after.reachable && typescript.isIdentifier(declaration.name)) {
				rules.bind(declaration.name, declaration.initializer, after.facts);
			}

			return after;
		}, path);

	/**
	 * Walks a loop: once from where it is entered, and once more from what
	 * the first iteration and its `continue`s leave, which is how a value
	 * moved at the end of an iteration is seen as moved at the start of the
	 * next.
	 *
	 * The second walk happens only when the first changed something. Walking
	 * every body twice would double the work at each level of nesting — ten
	 * nested loops walked a thousand times — where an ordinary loop, changing
	 * nothing the rules track, is walked once.
	 *
	 * @param entry The path entering the loop.
	 * @param iterate Walks one iteration, its condition included.
	 * @returns The path leaving it.
	 */
	const loop = (
		entry: Path<TFacts>,
		iterate: (path: Path<TFacts>, jumps: Jumps<TFacts>) => Path<TFacts>,
	): Path<TFacts> => {
		const firstJumps: Jumps<TFacts> = { breaks: [], continues: [] };
		const first: Path<TFacts> = iterate(fork(entry), firstJumps);
		const again: Path<TFacts> = mergeAll(fork(entry), [
			first,
			...firstJumps.continues,
		]);

		if (rules.same(again.facts, entry.facts)) {
			return mergeAll(again, firstJumps.breaks);
		}

		const secondJumps: Jumps<TFacts> = { breaks: [], continues: [] };
		const second: Path<TFacts> = iterate(fork(again), secondJumps);

		return mergeAll(again, [
			second,
			...secondJumps.continues,
			...firstJumps.breaks,
			...secondJumps.breaks,
		]);
	};

	const statement = (
		node: typescript.Node,
		path: Path<TFacts>,
		jumps: Jumps<TFacts> | undefined,
	): Path<TFacts> => {
		if (typescript.isBlock(node) || typescript.isSourceFile(node)) {
			return node.statements.reduce(
				(before, each) => statement(each, before, jumps),
				path,
			);
		}

		if (typescript.isVariableStatement(node)) {
			return declare(node.declarationList, path);
		}

		if (typescript.isExpressionStatement(node)) {
			return expression(node.expression, path);
		}

		if (typescript.isIfStatement(node)) {
			const condition: Path<TFacts> = expression(node.expression, path);
			const whenTrue: Path<TFacts> = statement(
				node.thenStatement,
				fork(condition),
				jumps,
			);

			return merge(
				whenTrue,
				node.elseStatement === undefined
					? condition
					: statement(node.elseStatement, condition, jumps),
			);
		}

		if (
			typescript.isReturnStatement(node) ||
			typescript.isThrowStatement(node)
		) {
			if (node.expression !== undefined) expression(node.expression, path);

			return unreachable();
		}

		if (typescript.isBreakStatement(node)) {
			jumps?.breaks.push(path);

			return unreachable();
		}

		if (typescript.isContinueStatement(node)) {
			jumps?.continues.push(path);

			return unreachable();
		}

		if (typescript.isWhileStatement(node)) {
			return loop(path, (each, own) =>
				statement(node.statement, expression(node.expression, each), own),
			);
		}

		if (typescript.isDoStatement(node)) {
			return loop(path, (each, own) =>
				expression(node.expression, statement(node.statement, each, own)),
			);
		}

		if (typescript.isForStatement(node)) {
			const initialized: Path<TFacts> =
				node.initializer === undefined
					? path
					: typescript.isVariableDeclarationList(node.initializer)
						? declare(node.initializer, path)
						: expression(node.initializer, path);

			return loop(initialized, (each, own) => {
				const tested: Path<TFacts> =
					node.condition === undefined
						? each
						: expression(node.condition, each);
				const ran: Path<TFacts> = statement(node.statement, tested, own);
				const continued: Path<TFacts> = mergeAll(ran, own.continues.splice(0));

				return node.incrementor === undefined
					? continued
					: expression(node.incrementor, continued);
			});
		}

		if (
			typescript.isForOfStatement(node) ||
			typescript.isForInStatement(node)
		) {
			const iterated: Path<TFacts> = expression(node.expression, path);

			return loop(iterated, (each, own) => {
				const names: readonly typescript.Identifier[] =
					typescript.isVariableDeclarationList(node.initializer)
						? node.initializer.declarations
								.map((declaration) => declaration.name)
								.filter(typescript.isIdentifier)
						: typescript.isIdentifier(node.initializer)
							? [node.initializer]
							: [];

				if (each.reachable) {
					for (const name of names) rules.bind(name, undefined, each.facts);
				}

				return statement(node.statement, each, own);
			});
		}

		if (typescript.isSwitchStatement(node)) {
			const tested: Path<TFacts> = expression(node.expression, path);
			const own: Jumps<TFacts> = {
				breaks: [],
				continues: jumps?.continues ?? [],
			};
			let falling: Path<TFacts> = unreachable();
			let hasDefault = false;

			for (const clause of node.caseBlock.clauses) {
				const entered: Path<TFacts> = merge(fork(tested), falling);
				const matched: Path<TFacts> = typescript.isCaseClause(clause)
					? expression(clause.expression, entered)
					: entered;

				hasDefault ||= typescript.isDefaultClause(clause);
				falling = clause.statements.reduce(
					(before, each) => statement(each, before, own),
					matched,
				);
			}

			return mergeAll(falling, [
				...own.breaks,
				hasDefault ? unreachable() : tested,
			]);
		}

		if (typescript.isTryStatement(node)) {
			const tried: Path<TFacts> = statement(node.tryBlock, fork(path), jumps);
			const caught: Path<TFacts> =
				node.catchClause === undefined
					? tried
					: merge(
							tried,
							statement(
								node.catchClause.block,
								merge(fork(path), fork(tried)),
								jumps,
							),
						);

			return node.finallyBlock === undefined
				? caught
				: statement(node.finallyBlock, caught, jumps);
		}

		if (typescript.isLabeledStatement(node)) {
			return statement(node.statement, path, jumps);
		}

		if (typescript.isFunctionDeclaration(node)) {
			// Hoisted: it may run before anything above it, so what it names is
			// not judged by where it is written.
			if (node.body !== undefined) pending.push(node.body);

			return path;
		}

		if (typescript.isClassDeclaration(node)) {
			defineClass(node, path);

			return path;
		}

		if (
			typescript.isImportDeclaration(node) ||
			typescript.isImportEqualsDeclaration(node) ||
			typescript.isExportDeclaration(node) ||
			typescript.isInterfaceDeclaration(node) ||
			typescript.isTypeAliasDeclaration(node) ||
			typescript.isModuleDeclaration(node) ||
			typescript.isEnumDeclaration(node)
		) {
			return path;
		}

		if (typescript.isExportAssignment(node)) {
			return expression(node.expression, path);
		}

		return expression(node, path);
	};

	while (pending.length > 0) {
		const body = pending.shift() as typescript.Node;

		// An arrow function's body may be an expression rather than a block.
		if (typescript.isBlock(body) || typescript.isSourceFile(body)) {
			statement(body, start(), undefined);
			continue;
		}

		expression(body, start());
	}
};
