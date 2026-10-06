import * as path from 'node:path';

import typescript from 'typescript';

import { createError } from '@fulcro/errors';
import {
	type AnalysisContext,
	type CallTarget,
	type FileAnalyzer,
	isOwnedCall,
} from '@fulcro/transform-core';

import { type FlowRules, walkFlow } from '@/transformer/flow';

/**
 * Refuses, when the code is compiled, what `move`, `borrow` and
 * `borrowMutable` refuse when it runs: an owner used after it was moved, and
 * a borrow used after something its owner did ended it.
 *
 * The lifetime of a borrow is inferred, never written: a borrow lasts from
 * where it is taken to the last place it is used. A borrow that is never used again after a conflicting one is taken is
 * therefore fine — only using it is refused.
 *
 * What it follows is variables: an owner passed by name, and a borrow kept in
 * a variable. A value reached any other way — through a property, an alias,
 * a closure created before the move — is left to the runtime check, which
 * catches it when it runs.
 */

/** The functions this analysis follows. */
type Operation = 'move' | 'borrow' | 'borrowMutable';

/** Each one, as a call has to resolve to it. */
const TARGETS: Readonly<Record<Operation, CallTarget>> = {
	move: {
		functionName: 'move',
		moduleSegment: path.join('move', 'index'),
		packageName: '@fulcro/memory',
	},
	borrow: {
		functionName: 'borrow',
		moduleSegment: path.join('borrow', 'index'),
		packageName: '@fulcro/memory',
	},
	borrowMutable: {
		functionName: 'borrowMutable',
		moduleSegment: path.join('borrowMutable', 'index'),
		packageName: '@fulcro/memory',
	},
};

/** The operations, in the order a call is tested against them. */
const OPERATIONS: readonly Operation[] = ['move', 'borrow', 'borrowMutable'];

/**
 * Any of their names, as a whole word. Under `ts-patch` every file of the
 * program reaches the analyzer, with no bundler filtering first; a file that
 * never names one is skipped before the walk.
 */
const MENTIONED = /\b(move|borrow|borrowMutable)\b/;

/** Where an owner was moved. */
interface Moved {
	readonly line: number;
}

/** A borrow kept in a variable, and what ended it, if anything did. */
interface Loan {
	readonly owner: typescript.Symbol;
	readonly ownerName: string;
	readonly kind: 'borrow' | 'borrowMutable';
	readonly ended: { readonly by: Operation; readonly line: number } | null;
}

/** What is known along one path. */
interface Facts {
	readonly moved: Map<typescript.Symbol, Moved>;
	readonly loans: Map<typescript.Symbol, Loan>;
}

/**
 * The expression inside parentheses, type assertions and `!`.
 *
 * @param node The expression.
 * @returns What it wraps, all the way down.
 */
const unwrap = (node: typescript.Expression): typescript.Expression =>
	typescript.isParenthesizedExpression(node) ||
	typescript.isAsExpression(node) ||
	typescript.isSatisfiesExpression(node) ||
	typescript.isNonNullExpression(node)
		? unwrap(node.expression)
		: node;

/**
 * Builds the rules for one file.
 *
 * @param sourceFile The file.
 * @param context The compilation in progress.
 * @returns The rules.
 */
const createRules = (
	sourceFile: typescript.SourceFile,
	context: AnalysisContext,
): FlowRules<Facts> => {
	const { checker } = context;
	const operations = new Map<typescript.CallExpression, Operation | null>();
	const reported = new Set<string>();

	/**
	 * Which of ours a call is, asked once per call: the walk meets the same
	 * call again in the second pass over a loop, and as a variable's value.
	 *
	 * @param call The call.
	 * @returns The operation, or `null` for anything else.
	 */
	const operationOf = (call: typescript.CallExpression): Operation | null => {
		if (!operations.has(call)) {
			const named: string | null = typescript.isIdentifier(call.expression)
				? call.expression.text
				: null;
			const found: Operation | undefined = OPERATIONS.find(
				(operation) =>
					operation === named && isOwnedCall(call, checker, TARGETS[operation]),
			);

			operations.set(call, found ?? null);
		}

		return operations.get(call) ?? null;
	};

	/**
	 * The variable an identifier names, where it is read.
	 *
	 * @param identifier The identifier.
	 * @returns Its symbol, if it has one.
	 */
	const symbolOf = (
		identifier: typescript.Identifier,
	): typescript.Symbol | undefined =>
		typescript.isShorthandPropertyAssignment(identifier.parent)
			? checker.getShorthandAssignmentValueSymbol(identifier.parent)
			: checker.getSymbolAtLocation(identifier);

	/**
	 * The variable a call's first argument names, if it names one.
	 *
	 * @param call The call.
	 * @returns The identifier and its symbol, or `null`.
	 */
	const ownerOf = (
		call: typescript.CallExpression,
	): { name: string; symbol: typescript.Symbol } | null => {
		const [first] = call.arguments;
		const argument: typescript.Expression | undefined =
			first === undefined ? undefined : unwrap(first);

		if (argument === undefined || !typescript.isIdentifier(argument)) {
			return null;
		}

		const symbol: typescript.Symbol | undefined = symbolOf(argument);

		return symbol === undefined ? null : { name: argument.text, symbol };
	};

	const lineOf = (node: typescript.Node): number =>
		sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line +
		1;

	/**
	 * Reports once per place and error, though a loop walks it twice.
	 *
	 * @param node Where.
	 * @param message What.
	 */
	const report = (node: typescript.Node, message: string): void => {
		const key = `${node.getStart(sourceFile)}:${message.slice(0, 10)}`;

		if (reported.has(key)) return;

		reported.add(key);
		context.report(node, message);
	};

	/**
	 * Refuses a read of a moved owner, or of a borrow that has ended.
	 *
	 * @param identifier What is read.
	 * @param facts What is known where it is read.
	 */
	const read = (identifier: typescript.Identifier, facts: Facts): void => {
		// Nothing moved or lent on this path: no read can be refused, and asking
		// the checker for every identifier of a file would be most of the cost.
		if (facts.moved.size === 0 && facts.loans.size === 0) return;

		const symbol: typescript.Symbol | undefined = symbolOf(identifier);

		if (symbol === undefined) return;

		const moved: Moved | undefined = facts.moved.get(symbol);

		if (moved !== undefined) {
			report(
				identifier,
				createError('FULCRO7027', {
					operation: 'move',
					name: identifier.text,
					line: moved.line,
				}).message,
			);

			return;
		}

		const loan: Loan | undefined = facts.loans.get(symbol);

		if (loan === undefined || loan.ended === null) return;

		report(
			identifier,
			loan.ended.by === 'move'
				? createError('FULCRO7029', {
						operation: loan.kind,
						name: identifier.text,
						owner: loan.ownerName,
						line: loan.ended.line,
					}).message
				: createError('FULCRO7028', {
						operation: loan.kind,
						name: identifier.text,
						owner: loan.ownerName,
						conflict: loan.ended.by,
						line: loan.ended.line,
					}).message,
		);
	};

	/**
	 * Applies what one of ours does to the facts: a move spends the owner and
	 * ends its borrows; a borrow for writing ends every borrow before it; a
	 * borrow for reading ends a borrow for writing.
	 *
	 * @param call The call, its arguments already read.
	 * @param facts What is known, changed in place.
	 */
	const call = (call: typescript.CallExpression, facts: Facts): void => {
		const operation: Operation | null = operationOf(call);
		const owner = operation === null ? null : ownerOf(call);

		if (operation === null || owner === null) return;

		const line: number = lineOf(call);

		if (operation === 'move') facts.moved.set(owner.symbol, { line });

		for (const [symbol, loan] of facts.loans) {
			const ends: boolean =
				loan.owner === owner.symbol &&
				loan.ended === null &&
				(operation !== 'borrow' || loan.kind === 'borrowMutable');

			if (ends) {
				facts.loans.set(symbol, { ...loan, ended: { by: operation, line } });
			}
		}
	};

	/**
	 * A variable given a new value is no longer moved, and is a borrow only
	 * when the value is one of ours taken from a named owner.
	 *
	 * @param name The variable.
	 * @param value Its new value, if it has one.
	 * @param facts What is known, changed in place.
	 */
	const bind = (
		name: typescript.Identifier,
		value: typescript.Expression | undefined,
		facts: Facts,
	): void => {
		const symbol: typescript.Symbol | undefined =
			checker.getSymbolAtLocation(name);

		if (symbol === undefined) return;

		facts.moved.delete(symbol);
		facts.loans.delete(symbol);

		const unwrapped: typescript.Expression | undefined =
			value === undefined ? undefined : unwrap(value);

		if (unwrapped === undefined || !typescript.isCallExpression(unwrapped)) {
			return;
		}

		const operation: Operation | null = operationOf(unwrapped);
		const owner = ownerOf(unwrapped);

		if (operation === null || operation === 'move' || owner === null) return;

		facts.loans.set(symbol, {
			owner: owner.symbol,
			ownerName: owner.name,
			kind: operation,
			ended: null,
		});
	};

	/**
	 * Refuses a function created after a value it names was moved or ended:
	 * whenever it runs, the value it reaches is already spent.
	 *
	 * @param created The function.
	 * @param facts What is known where it is created.
	 */
	const capture = (
		created: typescript.FunctionLikeDeclaration,
		facts: Facts,
	): void => {
		if (facts.moved.size === 0 && facts.loans.size === 0) return;

		const visit = (node: typescript.Node): void => {
			if (typescript.isTypeNode(node)) return;

			if (typescript.isIdentifier(node)) {
				read(node, facts);

				return;
			}

			typescript.forEachChild(node, visit);
		};

		if (created.body !== undefined) visit(created.body);
	};

	return {
		initial: (): Facts => ({ moved: new Map(), loans: new Map() }),
		copy: (facts: Facts): Facts => ({
			moved: new Map(facts.moved),
			loans: new Map(facts.loans),
		}),
		join: (first: Facts, second: Facts): Facts => {
			const loans = new Map<typescript.Symbol, Loan>(first.loans);

			for (const [symbol, loan] of second.loans) {
				const known: Loan | undefined = loans.get(symbol);

				loans.set(
					symbol,
					known === undefined || known.ended !== null
						? (known ?? loan)
						: { ...known, ended: loan.ended },
				);
			}

			return {
				moved: new Map([...second.moved, ...first.moved]),
				loans,
			};
		},
		same: (first: Facts, second: Facts): boolean =>
			first.moved.size === second.moved.size &&
			first.loans.size === second.loans.size &&
			[...first.moved.keys()].every((symbol) => second.moved.has(symbol)) &&
			[...first.loans].every(([symbol, loan]) => {
				const other: Loan | undefined = second.loans.get(symbol);

				return (
					other !== undefined &&
					other.owner === loan.owner &&
					other.kind === loan.kind &&
					other.ended?.by === loan.ended?.by
				);
			}),
		read,
		call,
		bind,
		capture,
	};
};

/**
 * The analysis, as the transformer runs it: once per file, before anything
 * in it is rewritten.
 */
export const ownershipAnalyzer: FileAnalyzer = {
	functionNames: OPERATIONS,
	analyze: (sourceFile, context): void => {
		if (!MENTIONED.test(sourceFile.text)) return;

		walkFlow(sourceFile, createRules(sourceFile, context));
	},
};
