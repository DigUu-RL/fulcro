/**
 * Braces on any branch that does not fit on one line.
 *
 * ESLint's own `curly` has no setting for this. `multi-line` only complains
 * once the body itself wraps, which leaves the far more common shape
 *
 *     if (condition)
 *         doSomething();
 *
 * unreported — and that is precisely the shape where a second statement gets
 * added later, indented to match, and runs unconditionally. `all` would catch
 * it and also outlaw `if (condition) return;`, which is worth keeping.
 *
 * So the rule is stated exactly: braces are optional only while the whole
 * statement sits on a single line.
 */

import type { AST, Rule } from 'eslint';
import type { Node, Statement } from 'estree';

export const braceWrappedBranches: Rule.RuleModule = {
	meta: {
		type: 'problem',
		fixable: 'code',
		schema: [],
		messages: {
			needed:
				'A branch spanning more than one line needs braces; only a branch written entirely on one line may omit them.',
		},
	},

	create: (context: Rule.RuleContext): Rule.RuleListener => {
		/**
		 * Reports a branch whose body starts on a later line than its keyword.
		 *
		 * @param start Node the branch begins at.
		 * @param body Statement the branch runs.
		 */
		const check = (start: Node | AST.Token | null, body: Statement | null | undefined): void => {
			if (start === null || body === null || body === undefined) return;
			if (body.type === 'BlockStatement') return;

			// An `else if` is a branch of its own and is reported there.
			if (body.type === 'IfStatement') return;
			if (start.loc?.start.line === body.loc?.end.line) return;

			context.report({
				node: body,
				messageId: 'needed',
				fix: (fixer: Rule.RuleFixer): Rule.Fix[] => {
					return [fixer.insertTextBefore(body, '{'), fixer.insertTextAfter(body, '}')];
				},
			});
		};

		return {
			IfStatement: (node): void => {
				check(node, node.consequent);

				if (node.alternate !== null && node.alternate !== undefined) {
					const elseToken = context.sourceCode.getTokenBefore(node.alternate);

					check(elseToken, node.alternate);
				}
			},
			ForStatement: (node): void => {
				check(node, node.body);
			},
			ForOfStatement: (node): void => {
				check(node, node.body);
			},
			ForInStatement: (node): void => {
				check(node, node.body);
			},
			WhileStatement: (node): void => {
				check(node, node.body);
			},
		};
	},
};
