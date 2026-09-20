import { afterEach, describe, expect, it } from 'vitest';

import { review } from '../../.claude/hooks/block-destructive.mjs';

/**
 * The hook that refuses the commands which throw work away.
 *
 * Half of these cases are the allowances. A guard on deletion that made
 * `rm -rf dist` awkward would be worked around within a day, and a worked
 * around guard protects nothing — so the line it draws is written down here as
 * carefully as the refusals are.
 */

afterEach(() => {
	delete process.env.FULCRO_HOOKS_ALLOW;
});

describe('git reset --hard', () => {
	it('refuses it wherever it appears in the line', () => {
		expect(review({ command: 'git reset --hard' })).not.toBeNull();
		expect(review({ command: 'git reset --hard HEAD~1' })).not.toBeNull();
		expect(
			review({ command: 'git fetch && git reset --hard origin/main' }),
		).not.toBeNull();
	});

	it('leaves a reset that keeps the files alone', () => {
		expect(review({ command: 'git reset HEAD~1' })).toBeNull();
		expect(review({ command: 'git reset --soft HEAD~1' })).toBeNull();
		expect(
			review({ command: 'git restore packages/collections/src/index.ts' }),
		).toBeNull();
		expect(review({ command: 'git stash' })).toBeNull();
	});
});

describe('git clean', () => {
	it('refuses a forced clean, spelled long or bundled', () => {
		expect(review({ command: 'git clean -fd' })).not.toBeNull();
		expect(review({ command: 'git clean -fdx' })).not.toBeNull();
		expect(review({ command: 'git clean --force -d' })).not.toBeNull();
	});

	it('leaves the dry run alone, which is how you find out what would go', () => {
		expect(review({ command: 'git clean -n' })).toBeNull();
		expect(review({ command: 'git clean -nd' })).toBeNull();
		expect(review({ command: 'git clean --dry-run' })).toBeNull();
	});
});

describe('recursive deletion', () => {
	it('refuses a target that takes the checkout, a home or a root', () => {
		expect(review({ command: 'rm -rf .' })).not.toBeNull();
		expect(review({ command: 'rm -rf ..' })).not.toBeNull();
		expect(review({ command: 'rm -rf *' })).not.toBeNull();
		expect(review({ command: 'rm -rf ~' })).not.toBeNull();
		expect(review({ command: 'rm -rf /' })).not.toBeNull();
		expect(review({ command: 'rm -rf $HOME' })).not.toBeNull();
		expect(review({ command: 'rm -rf .git' })).not.toBeNull();
		expect(review({ command: `rm -rf ${process.cwd()}` })).not.toBeNull();
	});

	it('refuses the same target under another shell', () => {
		expect(review({ command: 'Remove-Item -Recurse -Force .' })).not.toBeNull();
		expect(
			review({ command: 'Remove-Item -Recurse -Force %USERPROFILE%' }),
		).not.toBeNull();
		expect(review({ command: 'rmdir /s /q .' })).not.toBeNull();
	});

	it('leaves the deletions this repository actually performs alone', () => {
		expect(review({ command: 'rm -rf dist' })).toBeNull();
		expect(review({ command: 'rm -rf node_modules' })).toBeNull();
		expect(review({ command: 'rm -rf .tmp dist' })).toBeNull();
		expect(review({ command: 'rm -rf packages/collections/dist' })).toBeNull();
		expect(review({ command: 'rm -f src/e2e-check.ts' })).toBeNull();
		expect(review({ command: 'Remove-Item -Recurse -Force dist' })).toBeNull();
	});

	it('refuses a whole-tree deletion even when a safe one is next to it', () => {
		expect(review({ command: 'rm -rf dist && rm -rf ~' })).not.toBeNull();
	});
});

describe('what is not a command', () => {
	it('lets through a refused shape that only appears inside a string', () => {
		expect(review({ command: 'echo "rm -rf /"' })).toBeNull();
		expect(
			review({ command: 'git commit -m "undo the git reset --hard advice"' }),
		).toBeNull();
	});

	it('has nothing to say about an event carrying no command', () => {
		expect(review({})).toBeNull();
		expect(review({ command: null })).toBeNull();
	});
});

describe('the documented exception', () => {
	it('re-opens exactly the operation a human named, and nothing else', () => {
		process.env.FULCRO_HOOKS_ALLOW = 'reset-hard';

		expect(review({ command: 'git reset --hard origin/main' })).toBeNull();
		expect(review({ command: 'git clean -fd' })).not.toBeNull();
		expect(review({ command: 'rm -rf ~' })).not.toBeNull();
	});
});
