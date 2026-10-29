import type { Rule } from 'eslint';
import type { Node, SourceLocation } from 'estree';

// JSX children follow the rule of statements: a child spanning more than one line is set apart from its siblings by a
// blank line, and children that fit on one line follow each other without one.

interface JsxChild {
	type: string;
	range: [number, number];
	loc: SourceLocation;
	value?: string;
}

interface JsxParent {
	children: JsxChild[];
}

const isBlankText = (child: JsxChild): boolean => {
	return child.type === 'JSXText' && (child.value ?? '').trim() === '';
};

const spansLines = (child: JsxChild): boolean => child.loc.start.line !== child.loc.end.line;

export const jsxChildrenSpacing: Rule.RuleModule = {
	meta: {
		type: 'layout',
		fixable: 'whitespace',
		docs: {
			description:
				'Require a blank line around JSX children spanning multiple lines, and none between single-line children.',
		},
		messages: {
			requireBlankLine: 'Set a JSX child spanning more than one line apart with a blank line.',
			forbidBlankLine: 'JSX children that fit on one line follow each other without a blank line.',
		},
		schema: [],
	},
	create: (context: Rule.RuleContext): Rule.RuleListener => {
		const checkChildren = (node: Node): void => {
			const children: JsxChild[] = (node as unknown as JsxParent).children;

			// Text mixed with elements is inline content, e.g. a sentence with links: it flows as written.
			const inlineContent: boolean = children.some((child: JsxChild): boolean => {
				return child.type === 'JSXText' && !isBlankText(child);
			});

			if (inlineContent) return;

			children.forEach((child: JsxChild, index: number): void => {
				const separator: JsxChild | undefined = children[index + 1];
				const next: JsxChild | undefined = children[index + 2];

				// Only siblings on their own lines, separated by whitespace; inline text flows as written.
				if (child.type === 'JSXText' || separator === undefined || next === undefined) return;
				if (!isBlankText(separator) || next.type === 'JSXText') return;

				const gap: number = next.loc.start.line - child.loc.end.line;
				const multiline: boolean = spansLines(child) || spansLines(next);

				if (gap === 0 || (multiline ? gap >= 2 : gap === 1)) return;

				const whitespace: string = context.sourceCode.text.slice(
					separator.range[0],
					separator.range[1],
				);

				const indentation: string = whitespace.slice(whitespace.lastIndexOf('\n') + 1);

				context.report({
					loc: { start: child.loc.end, end: next.loc.start },
					messageId: multiline ? 'requireBlankLine' : 'forbidBlankLine',
					fix: (fixer: Rule.RuleFixer): Rule.Fix => {
						return fixer.replaceTextRange(
							separator.range,
							`${multiline ? '\n\n' : '\n'}${indentation}`,
						);
					},
				});
			});
		};

		return { JSXElement: checkChildren, JSXFragment: checkChildren };
	},
};
