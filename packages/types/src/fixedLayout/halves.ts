/**
 * The two 128-bit formats of this package — the widest integers and
 * `Decimal`'s decimal128 — go through `DataView` as two 64-bit halves, low half
 * first, since it has no accessor that wide.
 */

/** Bits of one half. */
const HALF_WIDTH = 64n;

/**
 * Reads 128 bits as an unsigned integer.
 *
 * @param view Bytes to read from.
 * @param offset Where the bits start, already checked.
 * @returns The bits, from 0 to 2^128 - 1.
 */
export const readHalves = (view: DataView, offset: number): bigint => {
	return (view.getBigUint64(offset + 8, true) << HALF_WIDTH) | view.getBigUint64(offset, true);
};

/**
 * Writes 128 bits. A negative value is written in two's complement.
 *
 * @param view Bytes to write into.
 * @param offset Where the bits start, already checked.
 * @param bits The bits.
 */
export const writeHalves = (view: DataView, offset: number, bits: bigint): void => {
	view.setBigUint64(offset, BigInt.asUintN(64, bits), true);
	view.setBigUint64(offset + 8, BigInt.asUintN(64, bits >> HALF_WIDTH), true);
};
