import * as ts from 'typescript';

import type { FlowRules } from '@/transformer/flow';

/** What the recording rules saw, in the order the walk met it. */
export interface Recording {
	/** `read x`, `read x (spent)`, `call f`, `bind x`, `capture`. */
	readonly events: string[];
}

/**
 * Rules simple enough to check the walk by: `spend(x)` spends `x`, giving `x`
 * a new value restores it, and every read says whether the variable was spent
 * on some path reaching it. Names stand for variables, so no checker is
 * needed.
 *
 * @returns The rules, and what they recorded.
 */
export const recordingRules = (): {
	rules: FlowRules<Set<string>>;
	recording: Recording;
} => {
	const recording: Recording = { events: [] };

	return {
		recording,
		rules: {
			initial: () => new Set<string>(),
			copy: (facts) => new Set(facts),
			join: (first, second) => new Set([...first, ...second]),
			same: (first, second) =>
				first.size === second.size &&
				[...first].every((name) => second.has(name)),
			read: (identifier, facts) => {
				recording.events.push(
					facts.has(identifier.text)
						? `read ${identifier.text} (spent)`
						: `read ${identifier.text}`,
				);
			},
			call: (call, facts) => {
				const callee: string = call.expression.getText();
				const [argument] = call.arguments;

				recording.events.push(`call ${callee}`);

				if (
					callee === 'spend' &&
					argument !== undefined &&
					ts.isIdentifier(argument)
				) {
					facts.add(argument.text);
				}
			},
			bind: (name, _value, facts) => {
				recording.events.push(`bind ${name.text}`);
				facts.delete(name.text);
			},
			capture: () => {
				recording.events.push('capture');
			},
		},
	};
};

/**
 * Parses source text as a file, with parents set so `getText` works.
 *
 * @param text The source.
 * @returns The file.
 */
export const parse = (text: string): ts.SourceFile =>
	ts.createSourceFile('flow.ts', text, ts.ScriptTarget.ES2022, true);
