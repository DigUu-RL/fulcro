/**
 * The power of two a positive, finite magnitude lies at or above, and below
 * the next one: `e` such that `2^e <= magnitude < 2^(e + 1)`.
 *
 * `Math.log2` is not exact next to a power of two, so its estimate is
 * corrected against the power itself, and is off by one at most.
 *
 * @param magnitude Positive, finite value.
 * @returns Its binary exponent.
 */
export const binaryExponentOf = (magnitude: number): number => {
	const estimate: number = Math.floor(Math.log2(magnitude));

	if (2 ** estimate > magnitude) return estimate - 1;
	if (2 ** (estimate + 1) <= magnitude) return estimate + 1;

	return estimate;
};
