/**
 * A promise rejecting with exactly the value given, whatever it is: what work
 * written elsewhere may hand over, and what these suites prove is kept as it
 * came.
 *
 * Thrown from the executor rather than passed to `reject`, so the value is
 * one received rather than one this suite chose to make into a rejection.
 *
 * @param value What the promise rejects with.
 * @returns The rejected promise.
 */
export const rejectedWith = (value: unknown): Promise<never> => {
	return new Promise<never>(() => {
		throw value;
	});
};
