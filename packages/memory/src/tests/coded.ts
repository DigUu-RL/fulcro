/**
 * The error a refusal is expected to throw, carrying the code its message
 * starts with, which `toThrow` compares as well.
 *
 * @param error The expected error, its message starting with its code.
 * @returns The same error, carrying that code.
 */
export const coded = <T extends Error>(error: T): T =>
	Object.assign(error, { code: error.message.slice(0, 'FULCRO0000'.length) });
