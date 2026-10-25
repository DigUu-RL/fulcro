/**
 * Reading JSON as what it is: a value of a shape nobody has checked yet.
 *
 * `JSON.parse` is typed as returning `any`, which lets a validator read a
 * property of an array or a number without anything noticing. These read it
 * as `unknown` and tell the shapes apart, so a file holding the wrong kind of
 * value is reported rather than half read.
 */

import fileSystem from 'node:fs';

/**
 * Tells whether a JSON value is an object, and not an array.
 *
 * @param value The value.
 * @returns `true` for an object.
 */
export const isRecord = (value: unknown): value is Record<string, unknown> => {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
};

/**
 * Tells whether a JSON value is an array.
 *
 * `Array.isArray` alone narrows to `any[]`; this keeps the elements unknown.
 *
 * @param value The value.
 * @returns `true` for an array.
 */
export const isList = (value: unknown): value is readonly unknown[] => {
	return Array.isArray(value);
};

/**
 * Reads a file expected to hold a JSON object.
 *
 * @param file Path of the file.
 * @returns The object, or the problem that kept it from being one: the error
 * reading or parsing it, or that it holds a value of another kind.
 */
export const readJsonObject = (
	file: string,
): { document: Record<string, unknown> | null; problem: string | null } => {
	let parsed: unknown;

	try {
		parsed = JSON.parse(fileSystem.readFileSync(file, 'utf8'));
	} catch (failure) {
		return { document: null, problem: String(failure) };
	}

	if (!isRecord(parsed)) return { document: null, problem: 'Does not hold a JSON object.' };

	return { document: parsed, problem: null };
};
