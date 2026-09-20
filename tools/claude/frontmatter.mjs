/**
 * The frontmatter block of a Markdown file, read without a YAML parser.
 *
 * A dependency would be the obvious answer, and it is the wrong one here: this
 * runs in CI before anything is installed beyond the workspace itself, and the
 * subset a `SKILL.md` is allowed to use is small enough to state exactly —
 * scalars, quoted scalars, inline lists and block lists. Anything outside that
 * subset is reported rather than guessed at, which is the point. A key this
 * reader cannot understand is a key Claude Code may read differently, and a
 * validator that silently agreed with itself would be worth nothing.
 */

/**
 * A value as written in the block.
 *
 * @typedef {string | string[] | boolean} Value
 */

/**
 * The outcome of reading one file.
 *
 * `values` is empty when the block is absent or malformed; `problems` says
 * which, in the words the caller reports.
 *
 * @typedef {{
 *   present: boolean,
 *   values: Record<string, Value>,
 *   order: string[],
 *   problems: string[],
 * }} Frontmatter
 */

/**
 * Strips one layer of matching quotes.
 *
 * @param {string} text The raw scalar.
 * @returns {string} The scalar without its quotes.
 */
const unquoted = (text) => {
	const quoted = /^(['"])([\s\S]*)\1$/.exec(text);

	return quoted === null ? text : quoted[2];
};

/**
 * Reads a scalar, turning the two literals YAML treats specially.
 *
 * Only `true` and `false` are converted. Numbers stay strings: no key in the
 * frontmatter contract takes one, and a version-looking value silently
 * becoming a float is a worse failure than a string nobody compares.
 *
 * @param {string} text The raw scalar.
 * @returns {string | boolean} The value.
 */
const scalar = (text) => {
	const trimmed = text.trim();

	if (trimmed === 'true') return true;
	if (trimmed === 'false') return false;

	return unquoted(trimmed);
};

/**
 * Reads an inline list, `[one, two]`.
 *
 * @param {string} text The raw value, brackets included.
 * @returns {string[]} The entries.
 */
const inlineList = (text) =>
	text
		.slice(1, -1)
		.split(',')
		.map((entry) => unquoted(entry.trim()))
		.filter((entry) => entry !== '');

/**
 * Splits a file into its frontmatter lines and the body below.
 *
 * @param {string} content The whole file.
 * @returns {{ lines: string[] | null, body: string }} The block and the body.
 */
const split = (content) => {
	const lines = content.split(/\r?\n/);

	if (lines[0]?.trim() !== '---') return { lines: null, body: content };

	const end = lines.indexOf('---', 1);

	if (end < 0) return { lines: null, body: content };

	return {
		lines: lines.slice(1, end),
		body: lines.slice(end + 1).join('\n'),
	};
};

/**
 * Reads the frontmatter of a Markdown file.
 *
 * @param {string} content The whole file.
 * @returns {Frontmatter & { body: string }} The block, and what follows it.
 */
export const frontmatterOf = (content) => {
	const { lines, body } = split(content);

	if (lines === null) {
		return { present: false, values: {}, order: [], problems: [], body };
	}

	/** @type {Record<string, Value>} */
	const values = {};
	/** @type {string[]} */
	const order = [];
	/** @type {string[]} */
	const problems = [];

	let current = null;

	for (const line of lines) {
		if (line.trim() === '' || line.trim().startsWith('#')) continue;

		const entry = /^[-*]\s+(.*)$/.exec(line.trim());

		if (entry !== null) {
			if (current === null || !Array.isArray(values[current])) {
				problems.push(`A list entry with no key above it: \`${line.trim()}\`.`);
				continue;
			}

			/** @type {string[]} */ (values[current]).push(unquoted(entry[1].trim()));
			continue;
		}

		const pair = /^([A-Za-z][\w-]*)\s*:\s*([\s\S]*)$/.exec(line);

		if (pair === null) {
			problems.push(
				`A line that is neither a key nor a list entry: \`${line}\`.`,
			);
			continue;
		}

		const [, key, raw] = pair;

		if (key in values) {
			problems.push(`\`${key}\` is set twice; the second value wins silently.`);
		}

		order.push(key);
		current = key;

		if (raw.trim() === '') {
			values[key] = [];
		} else if (raw.trim().startsWith('[') && raw.trim().endsWith(']')) {
			values[key] = inlineList(raw.trim());
		} else {
			values[key] = scalar(raw);
		}
	}

	return { present: true, values, order, problems, body };
};
