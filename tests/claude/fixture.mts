import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * A `.claude` tree built in a temporary directory.
 *
 * The validators read a repository from disk, so their suites write one. A
 * fixture rather than the repository itself, because both halves of every
 * check have to be exercised: what it refuses and what it must keep allowing.
 * The repository can only ever demonstrate the second half, and a checker
 * proven only against a tree that passes is a checker nobody has seen refuse
 * anything.
 */
export interface Tree {
	/** The absolute path of the temporary repository root. */
	readonly root: string;

	/**
	 * Writes a file, creating the directories above it.
	 *
	 * @param relative Path from the root, with forward slashes.
	 * @param content What goes in it.
	 */
	write(relative: string, content: string): void;

	/**
	 * Writes a skill.
	 *
	 * @param name The directory, which is also the expected `name`.
	 * @param frontmatter The lines of the block, without the fences.
	 * @param body What follows it.
	 */
	skill(name: string, frontmatter: string, body?: string): void;
}

const roots: string[] = [];

/**
 * Builds an empty repository with a `package.json` in it.
 *
 * The manifest is there because a skill naming `npm run build` is checked
 * against the scripts of the repository it lives in, and a fixture with no
 * manifest would make every such reference a finding.
 *
 * @param scripts The script names the fixture repository declares.
 * @returns The tree.
 */
export const tree = (scripts: string[] = ['build', 'typecheck']): Tree => {
	const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fulcro-claude-'));

	roots.push(root);

	const write = (relative: string, content: string): void => {
		const full = path.join(root, ...relative.split('/'));

		fs.mkdirSync(path.dirname(full), { recursive: true });
		fs.writeFileSync(full, content, 'utf8');
	};

	write(
		'package.json',
		`${JSON.stringify(
			{
				name: 'fixture',
				private: true,
				scripts: Object.fromEntries(scripts.map((name) => [name, 'true'])),
			},
			null,
			'\t',
		)}\n`,
	);

	return {
		root,
		write,
		skill: (name, frontmatter, body = `# ${name}\n`) => {
			write(
				`.claude/skills/${name}/SKILL.md`,
				`---\n${frontmatter}\n---\n\n${body}`,
			);
		},
	};
};

/**
 * Removes every tree built so far.
 *
 * Called from `afterEach`, so that a failing assertion does not leave the
 * machine carrying the directory it failed on.
 */
export const discardTrees = (): void => {
	while (roots.length > 0) {
		const root = roots.pop();

		if (root === undefined) continue;

		fs.rmSync(root, { recursive: true, force: true });
	}
};
