/**
 * Reading a command line well enough to guard it.
 *
 * A guard written as a substring search gets both halves of the job wrong. It
 * refuses `echo "git push"`, which runs nothing, and it waves through
 * `cd packages && git push`, which pushes — because the line does not start
 * with the words it was looking for. Claude Code's own permission patterns
 * match on a prefix and have the same blind spot, which is why the hooks exist
 * alongside them rather than instead of them.
 *
 * So a line is split into the commands it actually runs, and each one is
 * compared token by token.
 */

import path from 'node:path';

/**
 * Characters that end one command and begin another.
 *
 * `(`, `)`, `{` and `}` are in here as well. They are not separators in any
 * shell, but every construct they open — a subshell, a substitution, a
 * PowerShell script block — holds commands of its own, and splitting on them
 * is what brings `$(git push)` and `... | ForEach-Object { npm publish }` into
 * view as commands rather than as arguments.
 */
const SEPARATORS = new Set([';', '|', '&', '\n', '\r', '(', ')', '{', '}']);

/**
 * Tokens that stand in front of a command without changing which one it is.
 *
 * A backslash is never an escape here. Every path on the machine this runs on
 * is full of them, and reading `C:\Users` as an escaped `U` would lose the
 * target of a deletion — the one token the guards care most about.
 */
const PREFIXES = new Set([
	'sudo',
	'command',
	'env',
	'exec',
	'npx',
	'pnpx',
	'bunx',
	'time',
	'timeout',
	'start-process',
]);

/**
 * Names that mean a directory tree is being deleted, whatever the shell.
 */
const REMOVERS = new Set([
	'rm',
	'rmdir',
	'remove-item',
	'ri',
	'rd',
	'erase',
	'del',
]);

/**
 * Targets that are a whole machine, a whole home or a whole checkout.
 *
 * `path.resolve` settles the rest; these are the ones no resolution can make
 * sense of, either because the shell expands them or because the answer
 * depends on which machine is asking.
 */
const ROOTS = new Set([
	'*',
	'./*',
	'../*',
	'~',
	'~/',
	'~/*',
	'$HOME',
	'$HOME/',
	'$env:USERPROFILE',
	'%USERPROFILE%',
	'%HOMEPATH%',
	'$PWD',
	'%CD%',
]);

/**
 * Splits a command line into the commands it runs.
 *
 * Quoted text stays in one token and is never read as a separator, so a
 * command named inside a string is an argument and nothing more.
 *
 * @param {string} line The whole command line.
 * @returns {string[][]} One array of tokens per command, empty ones dropped.
 */
export const commandsOf = (line) => {
	const commands = [];

	let tokens = [];
	let token = '';
	let quote = null;

	const endToken = () => {
		if (token !== '') {
			tokens.push(token);
			token = '';
		}
	};

	const endCommand = () => {
		endToken();

		if (tokens.length > 0) {
			commands.push(tokens);
			tokens = [];
		}
	};

	for (const character of line) {
		if (quote !== null) {
			if (character === quote) {
				quote = null;
			} else {
				token += character;
			}

			continue;
		}

		if (character === '"' || character === "'") {
			quote = character;
			continue;
		}

		if (SEPARATORS.has(character)) {
			endCommand();
			continue;
		}

		if (/\s/.test(character)) {
			endToken();
			continue;
		}

		token += character;
	}

	endCommand();

	return commands;
};

/**
 * The name a command was invoked by, without its directory or its extension.
 *
 * `C:\Program Files\GitHub CLI\gh.exe` and `/usr/bin/git` answer the same as
 * `gh` and `git` do.
 *
 * @param {string} token The token holding the executable.
 * @returns {string} The bare name, lowercased.
 */
export const nameOf = (token) => {
	const leaf = token.split(/[\\/]/).pop() ?? '';

	return leaf.replace(/\.(exe|cmd|bat|ps1)$/i, '').toLowerCase();
};

/**
 * The command a token list invokes, past anything standing in front of it.
 *
 * `timeout 300 npm publish` invokes `npm`, and so does `NODE_ENV=x npm
 * publish`. A runner that only reads the first token calls them `timeout` and
 * an assignment, and neither is what runs.
 *
 * @param {string[]} tokens The tokens of one command.
 * @returns {{ name: string, arguments: string[] } | null} The invocation, or
 *   `null` when the tokens name no command at all.
 */
export const invocationOf = (tokens) => {
	let index = 0;

	while (index < tokens.length) {
		const token = tokens[index];
		const skippable =
			PREFIXES.has(nameOf(token)) ||
			token.startsWith('-') ||
			/^\d+$/.test(token) ||
			token.includes('=');

		if (!skippable) {
			return { name: nameOf(token), arguments: tokens.slice(index + 1) };
		}

		index += 1;
	}

	return null;
};

/**
 * Whether an invocation is the command a pattern describes.
 *
 * The first word is the command; the rest have to appear among its arguments,
 * in order, so that `git push origin dev` and `git push --force origin dev`
 * both answer to `['git', 'push']` while `git log` answers to neither.
 *
 * @param {{ name: string, arguments: string[] } | null} invocation The command.
 * @param {string[]} pattern The command name, then the words that follow it.
 * @returns {boolean} Whether the invocation matches.
 */
export const runs = (invocation, pattern) => {
	const [name, ...words] = pattern;

	if (invocation === null || invocation.name !== name) return false;

	let from = 0;

	for (const word of words) {
		const at = invocation.arguments.indexOf(word, from);

		if (at < 0) return false;

		from = at + 1;
	}

	return true;
};

/**
 * Whether a flag was passed, spelled out or bundled with its neighbours.
 *
 * `rm -r -f`, `rm -rf` and `rm -fd` all pass `-f`. Only an all-lowercase run
 * of letters is read as a bundle, which keeps PowerShell's `-Recurse` from
 * being mistaken for six short flags.
 *
 * @param {{ name: string, arguments: string[] } | null} invocation The command.
 * @param {string} long The flag as written in full, `--force` or `-Recurse`.
 * @param {string} [short] The single letter it bundles as, if it has one.
 * @returns {boolean} Whether the flag is present.
 */
export const hasFlag = (invocation, long, short) => {
	if (invocation === null) return false;

	return invocation.arguments.some((argument) => {
		if (argument.toLowerCase() === long.toLowerCase()) return true;
		if (short === undefined || !/^-[a-z]+$/.test(argument)) return false;

		return argument.slice(1).includes(short);
	});
};

/**
 * Whether a target names a tree that a checkout, a home or a machine lives in.
 *
 * The test is containment rather than a list of spellings: anything resolving
 * to the working directory or to a directory above it takes the repository
 * with it, which is what `.`, `..` and an absolute path to the checkout all
 * have in common. `dist` and `node_modules` resolve below it and are ordinary.
 *
 * @param {string} target A non-flag argument of a deletion.
 * @returns {boolean} Whether deleting it would take the checkout or more.
 */
export const isRepositoryWide = (target) => {
	if (ROOTS.has(target)) return true;

	// A drive root, a filesystem root, or a single segment directly below one.
	// These are matched as text because the answer must not depend on the
	// platform the check runs on: `C:\` is a root whether or not the machine
	// reading this line has drives.
	if (/^[\\/]+$/.test(target)) return true;
	if (/^[a-zA-Z]:[\\/]*$/.test(target)) return true;
	if (/^[\\/][^\\/]+[\\/]?$/.test(target)) return true;

	// Anything the shell would expand first cannot be resolved here, and a
	// guess either way would be wrong.
	if (/[$%*?]/.test(target)) return false;

	const resolved = path.resolve(target);
	const here = process.cwd();

	if (resolved === here || here.startsWith(resolved + path.sep)) return true;

	return path.basename(resolved) === '.git';
};

/**
 * Whether an invocation deletes a tree, and the targets it would delete.
 *
 * @param {{ name: string, arguments: string[] } | null} invocation The command.
 * @returns {string[]} The targets, empty when this is not a recursive deletion.
 */
export const deletionTargets = (invocation) => {
	if (invocation === null || !REMOVERS.has(invocation.name)) return [];

	const recursive =
		hasFlag(invocation, '-r', 'r') ||
		hasFlag(invocation, '-recurse') ||
		hasFlag(invocation, '--recursive') ||
		hasFlag(invocation, '/s');

	if (!recursive) return [];

	// `cmd.exe` writes its switches with a forward slash, which is also how a
	// POSIX path to the root of the filesystem starts. Only the commands that
	// take switches that way have them read that way, so `rm -rf /usr` keeps
	// its target while `del /s` loses its switch.
	const switched = ['del', 'erase', 'rd', 'rmdir'].includes(invocation.name);

	return invocation.arguments.filter((argument) => {
		if (argument.startsWith('-')) return false;

		return !(switched && argument.startsWith('/'));
	});
};
