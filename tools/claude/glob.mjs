/**
 * The subset of glob syntax the `.claude` tree scopes things with.
 *
 * A `paths` entry in a rule or a skill decides whether that file is loaded for
 * the file being edited, and the decision is made by Claude Code rather than
 * here. What this module is for is the other half: proving that a glob someone
 * wrote matches the files they meant. A glob that matches nothing scopes its
 * rule to nothing, and reads exactly like one that works.
 *
 * So the subset is stated rather than inferred — `**` across segments, `*` and
 * `?` within one, and nothing else. A brace expansion or a character class
 * would be guessed at here and read literally there, and a checker that
 * silently agreed with itself is worth nothing.
 */

/**
 * The characters that mean something to a regular expression and not to a
 * glob.
 */
const SPECIAL = /[.+^${}()|[\]\\]/g;

/** @type {Map<string, RegExp>} */
const compiled = new Map();

/**
 * Compiles one glob into the expression that decides it.
 *
 * @param {string} glob The glob, with forward slashes.
 * @returns {RegExp} An expression anchored at both ends.
 */
export const expressionOf = (glob) => {
	const remembered = compiled.get(glob);

	if (remembered !== undefined) return remembered;

	let pattern = '';

	for (let index = 0; index < glob.length; index += 1) {
		const character = glob[index];

		if (character === '?') {
			pattern += '[^/]';
			continue;
		}

		if (character !== '*') {
			pattern += character.replace(SPECIAL, '\\$&');
			continue;
		}

		if (glob[index + 1] !== '*') {
			pattern += '[^/]*';
			continue;
		}

		index += 1;

		// `**/` spans whole segments and matches none of them as readily as
		// ten, so `packages/**/*.ts` covers a file sitting directly in
		// `packages`. A trailing `**` is everything below, separator included.
		if (glob[index + 1] === '/') {
			index += 1;
			pattern += '(?:[^/]*/)*';
			continue;
		}

		pattern += '.*';
	}

	const expression = new RegExp(`^${pattern}$`);

	compiled.set(glob, expression);

	return expression;
};

/**
 * Whether a path is matched by a glob.
 *
 * @param {string} glob The glob, with forward slashes.
 * @param {string} target A path relative to the repository root, with forward
 *   slashes.
 * @returns {boolean} Whether it matches.
 */
export const matches = (glob, target) => expressionOf(glob).test(target);

/**
 * Whether a path is matched by any of these globs.
 *
 * @param {string[]} globs The globs.
 * @param {string} target The path.
 * @returns {boolean} Whether one of them matches.
 */
export const matchedBy = (globs, target) =>
	globs.some((glob) => matches(glob, target));
