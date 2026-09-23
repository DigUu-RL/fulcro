/**
 * Text produced by rewriting a source file, with the map back to the original.
 *
 * A rewrite that happens before type checking changes the text the checker,
 * the emitter and the editor all read, and every one of them reports positions
 * in it. For those positions to mean anything to the person who wrote the
 * original, the rewrite keeps a record of where each piece of its output came
 * from — the same idea as a source map, kept as offsets rather than lines,
 * because the language service speaks in offsets.
 *
 * The output is made of two kinds of piece. A **copy** is original text moved
 * verbatim, and maps offset for offset. A **region** is the output of one
 * rewritten node; any position inside it that is not also inside a copy — the
 * synthesized `T.add(` around two operands — maps to the start of the node it
 * replaced, which is where an error about it belongs.
 */

/** Original text copied verbatim into the output. */
interface Copy {
	/** Offset of the copy in the original text. */
	readonly originalStart: number;

	/** Offset of the copy in the output. */
	readonly generatedStart: number;

	/** Length of the copy, the same in both. */
	readonly length: number;
}

/** The output of one rewritten node. */
interface Region {
	/** Span the node covered in the original text. */
	readonly originalStart: number;
	readonly originalEnd: number;

	/** Span its replacement covers in the output. */
	readonly generatedStart: number;
	readonly generatedEnd: number;
}

/** A rewritten text and the two directions of its position map. */
export interface RewrittenText {
	/** The rewritten text. */
	readonly text: string;

	/**
	 * Maps an offset in the rewritten text to the original.
	 *
	 * @param generated Offset in {@link RewrittenText.text}.
	 * @returns The offset in the original text it came from.
	 */
	readonly toOriginal: (generated: number) => number;

	/**
	 * Maps an offset in the original text to the rewritten one.
	 *
	 * @param original Offset in the original text.
	 * @returns The offset in {@link RewrittenText.text} it went to.
	 */
	readonly toGenerated: (original: number) => number;
}

/** Accumulates the output of a rewrite and its map. */
export interface TextBuilder {
	/** Copies a span of the original text verbatim. */
	readonly copy: (start: number, end: number) => void;

	/** Writes synthesized text, which maps to the enclosing region. */
	readonly write: (text: string) => void;

	/** Opens the region of a rewritten node; returns the handle to close it. */
	readonly open: (originalStart: number, originalEnd: number) => () => void;

	/** Whether any region was opened, which is whether anything was rewritten. */
	readonly rewrote: () => boolean;

	/** Finishes the text. */
	readonly build: () => RewrittenText;
}

/**
 * Finds the last entry whose start is at or before an offset.
 *
 * @param entries Entries sorted by the key.
 * @param key The start of an entry.
 * @param offset Offset looked up.
 * @returns The index, or -1.
 */
const floorIndex = <T>(
	entries: readonly T[],
	key: (entry: T) => number,
	offset: number,
): number => {
	let low = 0;
	let high: number = entries.length - 1;
	let found = -1;

	while (low <= high) {
		const middle: number = (low + high) >> 1;

		if (key(entries[middle]) <= offset) {
			found = middle;
			low = middle + 1;
		} else {
			high = middle - 1;
		}
	}

	return found;
};

/**
 * Starts the output of a rewrite over an original text.
 *
 * @param original The text being rewritten.
 * @returns The builder.
 */
export const createTextBuilder = (original: string): TextBuilder => {
	const pieces: string[] = [];
	const copies: Copy[] = [];
	const regions: Region[] = [];

	let position = 0;

	const copy = (start: number, end: number): void => {
		if (end <= start) return;

		copies.push({
			originalStart: start,
			generatedStart: position,
			length: end - start,
		});
		pieces.push(original.slice(start, end));
		position += end - start;
	};

	const write = (text: string): void => {
		pieces.push(text);
		position += text.length;
	};

	const open = (originalStart: number, originalEnd: number): (() => void) => {
		const generatedStart: number = position;

		return () => {
			regions.push({
				originalStart,
				originalEnd,
				generatedStart,
				generatedEnd: position,
			});
		};
	};

	const build = (): RewrittenText => {
		const text: string = pieces.join('');

		// A region closes after the regions nested in it, so sorting by start —
		// and, at equal starts, the wider first — puts the innermost last among
		// those containing any given offset.
		const byGenerated: Region[] = [...regions].sort(
			(left, right) =>
				left.generatedStart - right.generatedStart ||
				right.generatedEnd - left.generatedEnd,
		);
		const byOriginal: Region[] = [...regions].sort(
			(left, right) =>
				left.originalStart - right.originalStart ||
				right.originalEnd - left.originalEnd,
		);

		const innermost = (
			sorted: readonly Region[],
			start: (region: Region) => number,
			end: (region: Region) => number,
			offset: number,
		): Region | undefined => {
			let best: Region | undefined;

			for (const region of sorted) {
				if (start(region) > offset) break;
				if (offset < end(region)) best = region;
			}

			return best;
		};

		const toOriginal = (generated: number): number => {
			const index: number = floorIndex(
				copies,
				(entry) => entry.generatedStart,
				generated,
			);
			const candidate: Copy | undefined = copies[index];

			if (
				candidate !== undefined &&
				generated < candidate.generatedStart + candidate.length
			) {
				return candidate.originalStart + (generated - candidate.generatedStart);
			}

			const region: Region | undefined = innermost(
				byGenerated,
				(entry) => entry.generatedStart,
				(entry) => entry.generatedEnd,
				generated,
			);

			if (region !== undefined) return region.originalStart;

			// Past the last copy, or inside text written outside any region:
			// the end of the copy before it is the nearest original position.
			return candidate === undefined
				? 0
				: candidate.originalStart + candidate.length;
		};

		const toGenerated = (originalOffset: number): number => {
			// Copies are in output order, so the first one holding the offset is
			// the earliest in the output — which is the one that counts when a
			// node was written twice, as the target of a compound assignment is.
			//
			// A copy that contains the offset wins over one that merely ends at
			// it: the start of an operand is also the end of the copy before its
			// operator, and answering with that copy's end would land on the
			// synthesized text in front of the operand rather than on the operand.
			// Only when nothing contains it — the position just after the last
			// word of a file — does a copy ending there count.
			const holder: Copy | undefined =
				copies.find(
					(entry) =>
						entry.originalStart <= originalOffset &&
						originalOffset < entry.originalStart + entry.length,
				) ??
				copies.find(
					(entry) =>
						entry.originalStart <= originalOffset &&
						originalOffset === entry.originalStart + entry.length,
				);

			if (holder !== undefined) {
				return holder.generatedStart + (originalOffset - holder.originalStart);
			}

			const region: Region | undefined = innermost(
				byOriginal,
				(entry) => entry.originalStart,
				(entry) => entry.originalEnd,
				originalOffset,
			);

			return region === undefined ? originalOffset : region.generatedStart;
		};

		return { text, toOriginal, toGenerated };
	};

	return {
		copy,
		write,
		open,
		rewrote: () => regions.length > 0,
		build,
	};
};

/**
 * Chains two rewrites of the same file, the second applied to the output of the
 * first, into one map from the last text back to the original.
 *
 * @param first The earlier rewrite.
 * @param second The later one, over the earlier one's text.
 * @returns The combined rewrite.
 */
export const composeRewrites = (
	first: RewrittenText,
	second: RewrittenText,
): RewrittenText => ({
	text: second.text,
	toOriginal: (generated) => first.toOriginal(second.toOriginal(generated)),
	toGenerated: (original) => second.toGenerated(first.toGenerated(original)),
});
