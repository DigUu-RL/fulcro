import { createError } from '@fulcro/errors';

/**
 * The value {@link defaultOf} builds for T: a T itself.
 *
 * Spelled as a conditional rather than as T so that the type the value is
 * going to is still where T is inferred from — const checklist:
 * PreflightChecklist = defaultOf() reads PreflightChecklist — while the
 * signature says what the call returns
 * in terms of what it was asked for.
 *
 * @template T Type whose default value is produced.
 */
export type Defaulted<T> = T extends unknown ? T : never;

/**
 * Produces the default value of a type: the emptiest value that still fully
 * inhabits it, built by filling the type in rather than by handing back a
 * placeholder such as `null`.
 *
 * ```ts
 * interface PreflightChecklist {
 * 	torpedoes: number;
 * 	pilot: { callSign: string; cleared: boolean };
 * 	astromechs: string[];
 * 	note?: string;
 * }
 *
 * defaultOf<PreflightChecklist>();
 * // { torpedoes: 0, pilot: { callSign: '', cleared: false }, astromechs: [] }
 *
 * defaultOf<string>(); // ''
 * defaultOf<number>(); // 0
 * defaultOf<'light side' | 'dark side'>(); // 'light side'
 * ```
 *
 * The rule behind every case is a single one: **the result is always a valid
 * `T`**. Required properties are filled, optional ones are left out, a literal
 * type yields its only inhabitant, and a union yields `null` or `undefined`
 * when it admits them, falling back to the default of its first member.
 *
 * Resolved entirely at compile time. A type has no existence at runtime, so
 * there is nothing for a plain function to inspect: the bundled transformer
 * replaces the call with the value it builds from the type, and the body below
 * only ever runs when the project compiles without it.
 *
 * @template T Type whose default value is produced.
 * @returns The default value of `T`.
 * @throws {Error} Always, when the transformer is not enabled.
 */
export const defaultOf = <T>(): Defaulted<T> => {
	throw createError('FULCRO4003', { operation: 'defaultOf' });
};
