import type { Rule } from 'eslint';
import type { ArrowFunctionExpression } from 'estree';

// Arrow functions may omit braces only when the whole function fits on a single line.
export const requireBracesForMultilineArrowBody: Rule.RuleModule = {
	meta: {
		type: 'layout',
		docs: {
			description: 'Require a block body with braces for arrow functions spanning multiple lines.',
		},
		messages: {
			requireBraces:
				'Arrow functions spanning more than one line must use a block body with braces.',
		},
		schema: [],
	},
	create: (context: Rule.RuleContext): Rule.RuleListener => {
		return {
			ArrowFunctionExpression: (node: ArrowFunctionExpression): void => {
				const startLine: number | undefined = node.loc?.start.line;
				const endLine: number | undefined = node.loc?.end.line;
				const hasBlockBody: boolean = node.body.type === 'BlockStatement';

				if (hasBlockBody || startLine === endLine) return;

				context.report({ node, messageId: 'requireBraces' });
			},
		};
	},
};
