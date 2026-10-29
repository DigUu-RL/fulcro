import { expect } from 'vitest';

/**
 * What a call threw, to be asserted on with `toMatchObject`.
 *
 * That one compares nested objects in part, at every level, where `toThrow`
 * would need an asymmetric matcher nested inside another — and each of those
 * is typed `any`.
 *
 * @param call Call expected to throw.
 * @returns What it threw.
 */
export const thrownBy = (call: () => unknown): unknown => {
	try {
		call();
	} catch (error) {
		return error;
	}

	return expect.unreachable('expected the call to throw, and it returned');
};
