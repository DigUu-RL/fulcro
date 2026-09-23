import { afterEach, describe, expect, it } from 'vitest';

import { review } from '../../.claude/hooks/protect-publish.mjs';

/**
 * The hook that keeps pushing, publishing and merging with a human.
 *
 * A refusal is a string and an allowance is `null`, so every case reads as
 * `toBeNull()` or not — deliberately, because the wording of a refusal is
 * allowed to change and what it refuses is not.
 */

afterEach(() => {
	delete process.env.FULCRO_HOOKS_ALLOW;
});

describe('pushing', () => {
	it('refuses a push however it is written', () => {
		expect(review({ command: 'git push' })).not.toBeNull();
		expect(review({ command: 'git push origin dev' })).not.toBeNull();
		expect(review({ command: 'git push --force-with-lease' })).not.toBeNull();
		expect(review({ command: 'npm run build && git push' })).not.toBeNull();
		expect(
			review({ command: 'git push 2>&1 | Select-Object -Last 3' }),
		).not.toBeNull();
	});

	it('leaves every other use of git alone', () => {
		expect(review({ command: 'git status' })).toBeNull();
		expect(review({ command: 'git commit -m "wire the hooks up"' })).toBeNull();
		expect(review({ command: 'git log --oneline -5' })).toBeNull();
		expect(review({ command: 'git fetch origin' })).toBeNull();
		expect(review({ command: 'git merge main' })).toBeNull();
	});
});

describe('publishing', () => {
	it('refuses every route to the registry', () => {
		expect(review({ command: 'npm publish' })).not.toBeNull();
		expect(
			review({ command: 'npm publish --workspaces --access public' }),
		).not.toBeNull();
		expect(review({ command: 'changeset publish' })).not.toBeNull();
		expect(review({ command: 'npx changeset publish' })).not.toBeNull();
		expect(review({ command: 'npm run release' })).not.toBeNull();
		expect(review({ command: 'pnpm publish' })).not.toBeNull();
	});

	it('leaves the commands around publishing alone', () => {
		expect(review({ command: 'npm run changeset' })).toBeNull();
		expect(review({ command: 'npm run build' })).toBeNull();
		expect(review({ command: 'npm test' })).toBeNull();
		expect(
			review({ command: 'npm view @fulcro/collections version' }),
		).toBeNull();
	});

	it('refuses a dry run too, because the guard reads the verb and not the flags', () => {
		// `--dry-run` publishes nothing. It is still refused: a guard that
		// decided from a flag would be one typo away from letting the real
		// thing through, and `npm pack --dry-run` answers the same question.
		expect(review({ command: 'npm publish --dry-run' })).not.toBeNull();
	});
});

describe('merging', () => {
	it('refuses landing a pull request', () => {
		expect(review({ command: 'gh pr merge 12 --squash' })).not.toBeNull();
		expect(
			review({
				command: '"C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 12',
			}),
		).not.toBeNull();
	});

	it('leaves the rest of the pull request workflow alone', () => {
		expect(review({ command: 'gh pr create --fill' })).toBeNull();
		expect(review({ command: 'gh pr view 12' })).toBeNull();
		expect(review({ command: 'gh run watch 1234 --exit-status' })).toBeNull();
	});
});

describe('what is not a command', () => {
	it('lets through a protected word that only appears inside a string', () => {
		expect(review({ command: 'echo "git push"' })).toBeNull();
		expect(
			review({ command: 'git commit -m "prepare to publish"' }),
		).toBeNull();
		expect(review({ command: 'grep -r "npm publish" docs' })).toBeNull();
	});

	it('has nothing to say about an event carrying no command', () => {
		expect(review({})).toBeNull();
		expect(review({ command: 42 })).toBeNull();
		expect(review({ command: '' })).toBeNull();
	});
});

describe('the documented exception', () => {
	it('re-opens exactly the operation a human named, and nothing else', () => {
		process.env.FULCRO_HOOKS_ALLOW = 'push';

		expect(review({ command: 'git push origin dev' })).toBeNull();
		expect(review({ command: 'npm publish' })).not.toBeNull();
	});

	it('takes more than one operation at once', () => {
		process.env.FULCRO_HOOKS_ALLOW = 'push, publish';

		expect(review({ command: 'git push origin dev' })).toBeNull();
		expect(review({ command: 'npm publish' })).toBeNull();
		expect(review({ command: 'gh pr merge 12' })).not.toBeNull();
	});

	it('ignores a name it does not recognise', () => {
		process.env.FULCRO_HOOKS_ALLOW = 'everything';

		expect(review({ command: 'git push' })).not.toBeNull();
	});
});
