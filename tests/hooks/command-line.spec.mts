import { describe, expect, it } from 'vitest';

import {
	commandsOf,
	deletionTargets,
	hasFlag,
	invocationOf,
	isRepositoryWide,
	nameOf,
	runs,
} from '../../.claude/hooks/command-line.mjs';

/**
 * The reader the two guards share.
 *
 * Everything the hooks refuse or allow is decided here, so this is where the
 * awkward spellings belong: a command hidden behind `&&`, a command named
 * inside a string, a Windows path to an executable, a bundle of short flags.
 */

describe('commandsOf', () => {
	it('splits a line on every operator that starts a new command', () => {
		expect(commandsOf('npm run build && git push')).toEqual([
			['npm', 'run', 'build'],
			['git', 'push'],
		]);

		expect(commandsOf('npm test; npm publish')).toEqual([
			['npm', 'test'],
			['npm', 'publish'],
		]);

		expect(commandsOf('git status | head -3')).toEqual([
			['git', 'status'],
			['head', '-3'],
		]);
	});

	it('brings a command out of a substitution or a script block', () => {
		expect(commandsOf('echo $(git push)')).toEqual([
			['echo', '$'],
			['git', 'push'],
		]);

		expect(commandsOf('$ids | ForEach-Object { npm publish }')).toEqual([
			['$ids'],
			['ForEach-Object'],
			['npm', 'publish'],
		]);
	});

	it('keeps quoted text in one token, so a command named in a string is not one', () => {
		expect(commandsOf('echo "git push && rm -rf ."')).toEqual([
			['echo', 'git push && rm -rf .'],
		]);

		expect(commandsOf("git commit -m 'do not publish'")).toEqual([
			['git', 'commit', '-m', 'do not publish'],
		]);
	});

	it('reads a backslash as part of a path rather than as an escape', () => {
		expect(commandsOf('node C:\\Users\\Rodrigo\\tool.mjs')).toEqual([
			['node', 'C:\\Users\\Rodrigo\\tool.mjs'],
		]);
	});

	it('has no commands in an empty or blank line', () => {
		expect(commandsOf('')).toEqual([]);
		expect(commandsOf('   \n  ')).toEqual([]);
	});
});

describe('nameOf', () => {
	it('strips the directory and the extension a command was written with', () => {
		expect(nameOf('git')).toBe('git');
		expect(nameOf('/usr/bin/git')).toBe('git');
		expect(nameOf('C:\\Program Files\\GitHub CLI\\gh.exe')).toBe('gh');
		expect(nameOf('.\\scripts\\release.CMD')).toBe('release');
	});
});

describe('invocationOf', () => {
	it('looks past what stands in front of the real command', () => {
		expect(invocationOf(['timeout', '300', 'npm', 'publish'])).toEqual({
			name: 'npm',
			arguments: ['publish'],
		});

		expect(invocationOf(['npx', '--yes', 'changeset', 'publish'])).toEqual({
			name: 'changeset',
			arguments: ['publish'],
		});

		expect(invocationOf(['NODE_ENV=production', 'npm', 'publish'])).toEqual({
			name: 'npm',
			arguments: ['publish'],
		});

		expect(invocationOf(['sudo', 'rm', '-rf', '/'])).toEqual({
			name: 'rm',
			arguments: ['-rf', '/'],
		});
	});

	it('names no command when there is nothing but prefixes', () => {
		expect(invocationOf([])).toBeNull();
		expect(invocationOf(['sudo', '--'])).toBeNull();
	});
});

describe('runs', () => {
	it('matches the command and the words that follow it, in order', () => {
		const push = invocationOf(['git', 'push', 'origin', 'dev']);

		expect(runs(push, ['git', 'push'])).toBe(true);
		expect(runs(push, ['git', 'pull'])).toBe(false);
		expect(runs(push, ['npm', 'push'])).toBe(false);
	});

	it('is not thrown off by flags sitting between the words', () => {
		expect(
			runs(invocationOf(['git', 'push', '--force', 'origin']), ['git', 'push']),
		).toBe(true);
		expect(
			runs(invocationOf(['npm', 'run', '--silent', 'release']), [
				'npm',
				'run',
				'release',
			]),
		).toBe(true);
	});

	it('answers false for no command at all', () => {
		expect(runs(null, ['git', 'push'])).toBe(false);
	});
});

describe('hasFlag', () => {
	it('finds a flag written out in full, whatever its case', () => {
		expect(hasFlag(invocationOf(['git', 'reset', '--hard']), '--hard')).toBe(
			true,
		);
		expect(
			hasFlag(invocationOf(['Remove-Item', 'dist', '-Recurse']), '-recurse'),
		).toBe(true);
		expect(hasFlag(invocationOf(['git', 'reset', 'HEAD~1']), '--hard')).toBe(
			false,
		);
	});

	it('finds a short flag bundled with its neighbours', () => {
		expect(hasFlag(invocationOf(['rm', '-rf', 'dist']), '--force', 'f')).toBe(
			true,
		);
		expect(
			hasFlag(invocationOf(['git', 'clean', '-fdx']), '--force', 'f'),
		).toBe(true);
		expect(hasFlag(invocationOf(['git', 'clean', '-nd']), '--force', 'f')).toBe(
			false,
		);
	});

	it('does not read a PowerShell parameter as a bundle of short flags', () => {
		// `-Recurse` contains an `r`, an `e` and an `s`. None of them is a flag.
		expect(
			hasFlag(invocationOf(['Remove-Item', '-Recurse']), '--force', 'f'),
		).toBe(false);
		expect(
			hasFlag(invocationOf(['Remove-Item', '-Recurse']), '--silent', 's'),
		).toBe(false);
	});
});

describe('isRepositoryWide', () => {
	it('recognises a target that takes the checkout or more', () => {
		expect(isRepositoryWide('.')).toBe(true);
		expect(isRepositoryWide('..')).toBe(true);
		expect(isRepositoryWide('~')).toBe(true);
		expect(isRepositoryWide('*')).toBe(true);
		expect(isRepositoryWide('$HOME')).toBe(true);
		expect(isRepositoryWide('%USERPROFILE%')).toBe(true);
		expect(isRepositoryWide(process.cwd())).toBe(true);
	});

	it('recognises a root on either platform, wherever it is read', () => {
		// Written as text on purpose: a drive letter is a root whether or not
		// the machine running the suite has drives, and CI runs both.
		expect(isRepositoryWide('/')).toBe(true);
		expect(isRepositoryWide('C:\\')).toBe(true);
		expect(isRepositoryWide('C:')).toBe(true);
		expect(isRepositoryWide('/usr')).toBe(true);
		expect(isRepositoryWide('\\')).toBe(true);
	});

	it('leaves an ordinary path inside the repository alone', () => {
		expect(isRepositoryWide('dist')).toBe(false);
		expect(isRepositoryWide('node_modules')).toBe(false);
		expect(isRepositoryWide('./packages/collections/dist')).toBe(false);
		expect(isRepositoryWide('.tmp')).toBe(false);
	});

	it('treats the git directory itself as the repository', () => {
		expect(isRepositoryWide('.git')).toBe(true);
		expect(isRepositoryWide('./.git')).toBe(true);
	});
});

describe('deletionTargets', () => {
	it('reports the targets of a recursive deletion, whatever spells it', () => {
		expect(deletionTargets(invocationOf(['rm', '-rf', 'dist']))).toEqual([
			'dist',
		]);
		expect(deletionTargets(invocationOf(['rm', '-r', '-f', 'a', 'b']))).toEqual(
			['a', 'b'],
		);
		expect(
			deletionTargets(
				invocationOf(['Remove-Item', '-Recurse', '-Force', 'dist']),
			),
		).toEqual(['dist']);
		expect(
			deletionTargets(invocationOf(['rmdir', '/s', '/q', 'dist'])),
		).toEqual(['dist']);
	});

	it('keeps a POSIX path that starts the way a cmd switch does', () => {
		expect(deletionTargets(invocationOf(['rm', '-rf', '/usr']))).toEqual([
			'/usr',
		]);
	});

	it('reports nothing for a command that deletes no tree', () => {
		expect(deletionTargets(invocationOf(['rm', 'file.txt']))).toEqual([]);
		expect(deletionTargets(invocationOf(['git', 'status']))).toEqual([]);
		expect(deletionTargets(null)).toEqual([]);
	});
});
