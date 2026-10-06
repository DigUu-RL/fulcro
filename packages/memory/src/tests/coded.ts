/**
 * The error a refusal is expected to throw, carrying the code its message
 * starts with and the details it was made from, which `toThrow` compares as
 * well.
 *
 * @param error The expected error, its message starting with its code.
 * @param details The details the error is expected to carry.
 * @returns The same error, carrying that code and those details.
 */
export const coded = <T extends Error>(
	error: T,
	details: Readonly<Record<string, unknown>>,
): T =>
	Object.assign(error, {
		code: error.message.slice(0, 'FULCRO0000'.length),
		details,
	});
