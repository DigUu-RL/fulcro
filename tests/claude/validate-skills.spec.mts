import { afterEach, describe, expect, it } from 'vitest';

import { validateSkills } from '../../tools/claude/validate-skills.mjs';

import { discardTrees, tree } from './fixture.mjs';

/**
 * The structural validation of `.claude/skills`.
 *
 * Every case is a tree written to disk and a list of rule identifiers read
 * back. The identifiers are asserted rather than the messages: the wording of
 * a finding is allowed to change and what it catches is not.
 */

afterEach(discardTrees);

/**
 * The rules that fired at a given level.
 *
 * @param root The fixture root.
 * @param level Which half of the report to read.
 * @returns The rule identifiers, in the order they were reported.
 */
const rules = (root: string, level: 'error' | 'warning' = 'error'): string[] =>
	validateSkills(root)
		.filter((finding) => finding.level === level)
		.map((finding) => finding.rule);

const WELL_FORMED = [
	'name: exports-audit',
	'description: Audits every exports map against the entry point suite. Use when a package surface changed.',
].join('\n');

describe('the frontmatter', () => {
	it('accepts a skill that meets the contract', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED);

		expect(rules(fixture.root)).toEqual([]);
	});

	it('refuses a key Claude Code does not read', () => {
		const fixture = tree();

		fixture.skill(
			'exports-audit',
			`${WELL_FORMED}\nauto-invoke: always\nmodel: opus`,
		);

		expect(rules(fixture.root)).toEqual([
			'frontmatter-unknown-key',
			'frontmatter-unknown-key',
		]);
	});

	it('refuses a name that is not the directory, or not kebab case', () => {
		const fixture = tree();

		fixture.skill(
			'exports-audit',
			'name: Exports_Audit\ndescription: Audits the exports maps. Use before a release.',
		);

		expect(rules(fixture.root)).toEqual(['name-shape', 'name-directory']);
	});

	it('refuses two skills answering to one name', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED);
		fixture.write(
			'.claude/skills/api-audit/SKILL.md',
			`---\n${WELL_FORMED}\n---\n\n# api-audit\n`,
		);

		expect(rules(fixture.root)).toContain('name-duplicate');
	});

	it('refuses a name that belongs to Claude Code itself', () => {
		const fixture = tree();

		fixture.skill(
			'compact',
			'name: compact\ndescription: Squeezes the context. Use when the session is long.',
		);

		expect(rules(fixture.root)).toEqual(['name-reserved']);
	});

	it('refuses a block that is missing, unreadable, or missing its description', () => {
		const fixture = tree();

		fixture.write('.claude/skills/no-block/SKILL.md', '# no-block\n');
		fixture.skill('nameless', 'description: Does a thing. Use when asked.');

		expect(rules(fixture.root)).toEqual([
			'name-missing',
			'frontmatter-missing',
		]);
	});

	it('warns when a description never says when to use the skill', () => {
		const fixture = tree();

		fixture.skill(
			'exports-audit',
			'name: exports-audit\ndescription: Helps with API quality.',
		);

		expect(rules(fixture.root, 'warning')).toContain('description-trigger');
	});

	it('refuses a value of the wrong kind', () => {
		const fixture = tree();

		fixture.skill(
			'exports-audit',
			`${WELL_FORMED}\ndisable-model-invocation: yes\ncontext: isolated`,
		);

		expect(rules(fixture.root)).toEqual([
			'frontmatter-type',
			'frontmatter-type',
		]);
	});
});

describe('the directory', () => {
	it('reports one with no SKILL.md in it', () => {
		const fixture = tree();

		fixture.write('.claude/skills/half-written/notes.md', 'Later.\n');

		expect(rules(fixture.root)).toEqual(['skill-orphaned']);
	});
});

describe('what a skill names', () => {
	it('refuses a supporting file that is not there', () => {
		const fixture = tree();

		fixture.skill(
			'exports-audit',
			WELL_FORMED,
			'Read `criteria.md` and then [the notes](notes/ranking.md).\n',
		);

		expect(rules(fixture.root)).toEqual([
			'reference-missing',
			'reference-missing',
		]);
	});

	it('accepts one that is, beside the skill or anywhere in the repository', () => {
		const fixture = tree();

		fixture.write('.claude/skills/exports-audit/criteria.md', '# criteria\n');
		fixture.write('docs/testing.md', '# testing\n');

		fixture.skill(
			'exports-audit',
			WELL_FORMED,
			'Read `criteria.md`, then `docs/testing.md`, then `testing.md` again.\n',
		);

		expect(rules(fixture.root)).toEqual([]);
	});

	it('leaves alone what an example, a quote or a code fence names', () => {
		const fixture = tree();

		fixture.skill(
			'exports-audit',
			WELL_FORMED,
			[
				'> Compare with `templates/other.md`.',
				'',
				'```sh',
				'node scripts/nowhere.mjs',
				'```',
				'',
				'## Examples',
				'',
				'- "Review `.claude/skills/diagnose/SKILL.md` before I commit it."',
			].join('\n'),
		);

		expect(rules(fixture.root)).toEqual([]);
	});

	it('refuses a script that is not in package.json', () => {
		const fixture = tree(['build']);

		fixture.skill(
			'exports-audit',
			WELL_FORMED,
			'Run `npm run build`, then `npm run audit:exports`.\n',
		);

		expect(rules(fixture.root)).toEqual(['script-missing']);
	});

	it('refuses a subagent that is not declared', () => {
		const fixture = tree();

		fixture.skill(
			'exports-audit',
			WELL_FORMED,
			'Delegate to `.claude/agents/api-reviewer.md`.\n',
		);

		expect(rules(fixture.root)).toContain('agent-missing');
	});

	it('accepts one that is', () => {
		const fixture = tree();

		fixture.write('.claude/agents/api-reviewer.md', '# api-reviewer\n');
		fixture.skill(
			'exports-audit',
			WELL_FORMED,
			'Delegate to `.claude/agents/api-reviewer.md`.\n',
		);

		expect(rules(fixture.root)).toEqual([]);
	});
});

describe('path scoping', () => {
	it('refuses a glob rooted at a directory that does not exist', () => {
		const fixture = tree();

		fixture.write('packages/collections/package.json', '{}\n');
		fixture.skill(
			'exports-audit',
			`${WELL_FORMED}\npaths: [packages/*/src/**, libraries/*/src/**]`,
		);

		expect(rules(fixture.root)).toEqual(['paths-missing']);
	});

	it('refuses an empty one', () => {
		const fixture = tree();

		fixture.skill('exports-audit', `${WELL_FORMED}\npaths: []`);

		expect(rules(fixture.root)).toEqual(['paths-empty']);
	});
});

describe('the operations a human keeps', () => {
	const body = (fence: string): string =>
		[`\`\`\`${fence}`, 'npm run build', 'git push origin dev', '```'].join(
			'\n',
		);

	it('refuses a model-invocable skill that runs one', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED, body('sh'));

		expect(rules(fixture.root)).toEqual(['dangerous-auto-invocable']);
	});

	it('accepts it once the skill has opted out of automatic invocation', () => {
		const fixture = tree();

		fixture.skill(
			'exports-audit',
			`${WELL_FORMED}\ndisable-model-invocation: true`,
			body('sh'),
		);

		expect(rules(fixture.root)).toEqual([]);
	});

	it('reads a sample of output as output rather than as an instruction', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED, body('text'));

		expect(rules(fixture.root)).toEqual([]);
	});
});

describe('size', () => {
	it('warns past the guidance and not before it', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED, `${'A line.\n'.repeat(400)}`);
		expect(rules(fixture.root, 'warning')).not.toContain('size');

		const long = tree();

		long.skill('exports-audit', WELL_FORMED, `${'A line.\n'.repeat(600)}`);
		expect(rules(long.root, 'warning')).toContain('size');
	});
});

describe('the eval suites', () => {
	const suite = (cases: unknown[]): string =>
		`${JSON.stringify({ skill: 'exports-audit', cases }, null, '\t')}\n`;

	const complete = [
		{
			id: 'positive',
			kind: 'positive',
			prompt: 'Audit the exports maps.',
			expect: { invokes: true, output: 'A table of drift.' },
		},
		{
			id: 'negative',
			kind: 'negative',
			prompt: 'Add an operator.',
			expect: { invokes: false },
		},
		{
			id: 'edge',
			kind: 'edge',
			prompt: 'The types changed but the exports map did not.',
			expect: { invokes: true, output: 'A table of drift.' },
		},
	];

	it('accepts a suite covering all three kinds', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED);
		fixture.write(
			'tools/claude/skill-evals/exports-audit.eval.json',
			suite(complete),
		);

		expect(rules(fixture.root)).toEqual([]);
		expect(rules(fixture.root, 'warning')).toEqual([]);
	});

	it('warns for a skill with no suite, and for each kind a suite is missing', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED);
		expect(rules(fixture.root, 'warning')).toEqual(['eval-absent']);

		const partial = tree();

		partial.skill('exports-audit', WELL_FORMED);
		partial.write(
			'tools/claude/skill-evals/exports-audit.eval.json',
			suite(complete.slice(0, 1)),
		);

		expect(rules(partial.root, 'warning')).toEqual([
			'eval-coverage',
			'eval-coverage',
		]);
	});

	it('refuses a suite naming a skill that is not there, or a file named for another', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED);
		fixture.write(
			'tools/claude/skill-evals/api-audit.eval.json',
			suite(complete),
		);

		expect(rules(fixture.root)).toEqual(['eval-file-name']);

		const unknown = tree();

		unknown.write(
			'tools/claude/skill-evals/api-audit.eval.json',
			`${JSON.stringify({ skill: 'api-audit', cases: complete })}\n`,
		);

		expect(rules(unknown.root)).toEqual(['eval-unknown-skill']);
	});

	it('refuses a case that cannot be judged', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED);
		fixture.write(
			'tools/claude/skill-evals/exports-audit.eval.json',
			suite([
				{
					id: 'one',
					kind: 'positive',
					prompt: 'Audit them.',
					expect: { invokes: true },
				},
				{
					id: 'one',
					kind: 'maybe',
					prompt: '',
					expect: { invokes: 'sometimes' },
				},
				{
					id: 'three',
					kind: 'negative',
					prompt: 'Audit them.',
					expect: { invokes: true },
				},
			]),
		);

		// The last case is wrong twice over: it is a negative case that says
		// the skill runs, and having said so it owes an output shape.
		expect(rules(fixture.root)).toEqual([
			'eval-case-expect',
			'eval-case-id',
			'eval-case-kind',
			'eval-case-prompt',
			'eval-case-expect',
			'eval-case-expect',
			'eval-case-expect',
		]);
	});

	it('refuses a file that is not JSON, and one with no cases at all', () => {
		const fixture = tree();

		fixture.skill('exports-audit', WELL_FORMED);
		fixture.write(
			'tools/claude/skill-evals/exports-audit.eval.json',
			'nearly\n',
		);

		expect(rules(fixture.root)).toEqual(['eval-unreadable']);

		const empty = tree();

		empty.skill('exports-audit', WELL_FORMED);
		empty.write('tools/claude/skill-evals/exports-audit.eval.json', suite([]));

		expect(rules(empty.root)).toEqual(['eval-empty']);
	});
});

describe('this repository', () => {
	it('passes its own validator, warnings included', () => {
		expect(validateSkills()).toEqual([]);
	});
});
