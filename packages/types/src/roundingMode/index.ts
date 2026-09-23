/**
 * How a value that falls between two representable ones is resolved.
 *
 * The five rounding directions IEEE 754 defines, spelled out:
 *
 * | Mode                 | Resolves to                                     | IEEE 754                 |
 * | -------------------- | ----------------------------------------------- | ------------------------ |
 * | `'ceiling'`          | the neighbour towards +∞                        | roundTowardPositive      |
 * | `'floor'`            | the neighbour towards −∞                        | roundTowardNegative      |
 * | `'truncate'`         | the neighbour towards zero                      | roundTowardZero          |
 * | `'halfEven'`         | the nearest, and on a tie the even neighbour    | roundTiesToEven          |
 * | `'halfAwayFromZero'` | the nearest, and on a tie the one further out   | roundTiesToAway          |
 *
 * `'halfEven'` is the default wherever a mode is optional. It is the IEEE
 * default and the one that does not drift: rounding many ties the same way
 * biases a sum, and alternating them by parity does not.
 */
export type RoundingMode =
	'ceiling' | 'floor' | 'truncate' | 'halfEven' | 'halfAwayFromZero';

/** Every mode, for validating one that arrived from outside the type system. */
const ROUNDING_MODES: ReadonlySet<string> = new Set<RoundingMode>([
	'ceiling',
	'floor',
	'truncate',
	'halfEven',
	'halfAwayFromZero',
]);

/**
 * Refuses a mode that is not one of {@link RoundingMode}.
 *
 * A caller passing `'halfUp'` from untyped code would otherwise be rounded by
 * whichever branch happened to be the default, silently.
 *
 * @param operation Operation being performed, for the message.
 * @param mode Mode it was handed.
 * @returns The mode, typed.
 * @throws {RangeError} When the mode is not recognised.
 */
export const requireRoundingMode = (
	operation: string,
	mode: unknown,
): RoundingMode => {
	if (typeof mode === 'string' && ROUNDING_MODES.has(mode)) {
		return mode as RoundingMode;
	}

	throw new RangeError(
		`${operation}: expected a rounding mode of ${[...ROUNDING_MODES].join(', ')}, received ${JSON.stringify(mode) ?? String(mode)}.`,
	);
};
