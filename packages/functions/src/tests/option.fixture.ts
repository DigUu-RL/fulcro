/**
 * Fixture compiled by the `Option` suite.
 *
 * Never imported at runtime. Every line ending in the refusal marker must be
 * refused by the compiler, and nothing else may be: the suite reads the markers
 * and asserts the report lands on exactly those lines. Excluded from the
 * tsconfig of this package, so `npm run typecheck` does not trip over errors
 * that are the point.
 *
 * Imported by package name, so the compilers check it against the declarations
 * the package publishes — what a consumer compiles against.
 */
import { none, type Option, optionOf, some } from '@fulcro/functions';

declare const option: Option<string>;
declare const nullable: string | null | undefined;

/** Handles both variants. Must compile. */
export const handled: number = option.handle({
	some: (value) => value.length,
	none: () => 0,
});

/** Narrows by method. Must compile. */
export const narrowedBySome = (): string | null =>
	option.isSome() ? option.value : null;

/** Narrows by the absent method. Must compile. */
export const narrowedByNone = (): null | string =>
	option.isNone() ? option.value : option.value.toUpperCase();

/** Each constructor fits an option of the wider type. Must compile. */
export const present: Option<string> = some('a');
export const absent: Option<string> = none();
export const converted: Option<string> = optionOf(nullable);
export const inferred: Option<number> = optionOf(3);

/** Short names, so each refused call fits on the line its marker is on. */
declare const f: () => number;
declare const mixed: string | number;
const o = option;

export const noNone = o.handle({ some: f }); // refused
export const noSome = o.handle({ none: f }); // refused
export const extra = o.handle({ some: f, none: f, other: f }); // refused
export const unnarrowed: string = o.value; // refused
export const widened: Option<string> = optionOf(mixed); // refused
