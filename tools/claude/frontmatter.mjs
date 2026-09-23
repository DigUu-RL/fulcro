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
 * Where a quoted scalar's closing quote is, or `-1` when it has none.
 *
 * `''` inside a single-quoted scalar is an escaped quote and not the end of
 * it; `\"` is the same inside a double-quoted one.
 *
 * @param {string} text The trimmed scalar, opening quote included.
 * @returns {number} The index of the closing quote.
 */
const closingQuote = (text) => {
	const quote = text[0];

	for (let at = 1; at < text.length; at += 1) {
		if (quote === '"' && text[at] === '\\') {
			at += 1;
			continue;
		}

		if (text[at] !== quote) continue;
		if (quote === "'" && text[at + 1] === "'") {
			at += 1;
			continue;
		}

		return at;
	}

	return -1;
};

/**
 * Reads a scalar, reporting the shapes YAML reads differently than this does.
 *
 * The reporting is the point. Stripping the outer quotes with a regular
 * expression and moving on accepts a value no YAML parser will, and the block
 * is then lost whole — Claude Code falls back to the skill's directory name as
 * its description, which is a skill that never triggers and never says why.
 * Three shapes have done it here: shell escaping (`\'`) inside a single-quoted
 * value, where YAML wants `''`; a plain scalar carrying `: `, which is a
 * nested mapping; and a plain scalar carrying ` #`, which is a comment and
 * drops everything after it in silence.
 *
 * Only `true` and `false` are converted. Numbers stay strings: no key in the
 * frontmatter contract takes one, and a version-looking value silently
 * becoming a float is a worse failure than a string nobody compares.
 *
 * @param {string} text The raw scalar.
 * @param {string} key The key it belongs to, for the message.
 * @returns {{ value: string | boolean, problem: string | null }} The value.
 */
const scalar = (text, key) => {
	const trimmed = text.trim();

	if (trimmed === 'true') return { value: true, problem: null };
	if (trimmed === 'false') return { value: false, problem: null };

	if (trimmed.startsWith("'") || trimmed.startsWith('"')) {
		const quote = trimmed[0];
		const end = closingQuote(trimmed);

		if (end < 0) {
			return {
				value: unquoted(trimmed),
				problem: `\`${key}\` opens with ${quote} and never closes it, so YAML reads past the end of the block and discards every key in it.`,
			};
		}

		if (end !== trimmed.length - 1) {
			return {
				value: unquoted(trimmed),
				problem: `\`${key}\` closes its quote before the end of the value, and YAML then discards every key in the block. A ${quote} inside a ${quote}-quoted value is written ${quote}${quote}; \`\\${quote}\` is shell escaping and means nothing here.`,
			};
		}

		const inner = trimmed.slice(1, end);

		return {
			value: quote === "'" ? inner.replaceAll("''", "'") : inner,
			problem: null,
		};
	}

	if (trimmed.includes(': ')) {
		return {
			value: trimmed,
			problem: `\`${key}\` is unquoted and carries \`: \`, which YAML reads as a mapping inside a mapping rather than as text. Quote the value, or write the colon as a dash.`,
		};
	}

	if (/\s#/.test(trimmed)) {
		return {
			value: trimmed,
			problem: `\`${key}\` is unquoted and carries \` #\`, which starts a YAML comment: everything after it is dropped, and nothing says so.`,
		};
	}

	return { value: trimmed, problem: null };
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
			const read = scalar(raw, key);

			values[key] = read.value;

			if (read.problem !== null) problems.push(read.problem);
		}
	}

	return { present: true, values, order, problems, body };
};
