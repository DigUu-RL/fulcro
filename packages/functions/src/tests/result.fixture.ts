/**
 * Fixture compiled by the `Result` suite.
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
import {
	type Failure,
	failure,
	type Result,
	type Success,
	success,
	tryCatch,
} from '@fulcro/functions';

declare const result: Result<number, Error>;

/** Handles both variants. Must compile. */
export const handled: string = result.handle({
	success: (value) => value.toFixed(),
	failure: (error) => error.message,
});

/** Narrows by method. Must compile. */
export const narrowedByMethod = (): number | string =>
	result.isSuccess() ? result.value : result.error.message;

/** Narrows by the failure method. Must compile. */
export const narrowedByFailure = (): Error | number =>
	result.isFailure() ? result.error : result.value;

/** Narrows by the data, as a copy without methods still can. Must compile. */
export const narrowedByData = (): number | Error =>
	result.error === null ? result.value : result.error;

/** Each constructor fits a result of the wider type. Must compile. */
export const fromSuccess: Result<number, Error> = success(1);
export const fromFailure: Result<number, Error> = failure(new Error('x'));
export const fromStringFailure: Result<number> = failure('x');
export const variants: [Success<number>, Failure<number, string>] = [
	success(1),
	failure('x'),
];

/** Keeps the produced type through tryCatch. Must compile. */
export const caught = async (): Promise<Result<number>> =>
	tryCatch(async () => 1);

/** Short names, so each refused call fits on the line its marker is on. */
declare const f: () => number;
const r = result;

export const noFailure = r.handle({ success: f }); // refused
export const noSuccess = r.handle({ failure: f }); // refused
export const extra = r.handle({ success: f, failure: f, other: f }); // refused
export const nullFailure = failure(null); // refused
export const oldName = success(1).data; // refused
