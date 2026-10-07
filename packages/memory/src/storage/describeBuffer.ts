/**
 * Describes what was handed in where a buffer was expected: the name of its
 * class when it is an object — `SharedArrayBuffer`, `Uint8Array` — and its
 * kind otherwise.
 *
 * Never the value itself, unlike a length: `16` in place of a buffer reads as
 * a size, which is the mistake being reported.
 *
 * @param value Value handed in.
 * @returns Its description.
 */
export const describeBuffer = (value: unknown): string => {
	if (value === null) return 'null';

	return typeof value === 'object'
		? Object.prototype.toString.call(value).slice('[object '.length, -1)
		: typeof value;
};
