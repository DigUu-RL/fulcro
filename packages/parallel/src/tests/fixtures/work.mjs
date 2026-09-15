/**
 * Task module the worker tests load.
 *
 * Written as plain JavaScript on disk rather than TypeScript, because a worker
 * imports it at runtime through the module loader — there is no build step
 * between the pool and this file, which is exactly the constraint the API is
 * shaped around.
 */

/**
 * Doubles a number, standing in for work worth a thread.
 *
 * @param {number} value Number to double.
 * @returns {number} Twice the number.
 */
export const double = (value) => value * 2;

/**
 * Sums the fields of a record, so the tests cover a structured payload rather
 * than only primitives.
 *
 * @param {{ id: number, amounts: number[] }} record Record to total.
 * @returns {{ id: number, total: number }} The record's identifier and total.
 */
export const totalOf = (record) => ({
	id: record.id,
	total: record.amounts.reduce((sum, amount) => sum + amount, 0),
});

/**
 * Burns CPU, which is the only kind of work threads help with.
 *
 * @param {number} rounds How much to burn.
 * @returns {number} A value the optimiser cannot discard.
 */
export const burn = (rounds) => {
	let total = 0;

	for (let round = 0; round < rounds; round++) total += Math.sqrt(round);

	return total;
};

/**
 * Always throws, for the failure assertions.
 *
 * @returns {never} Never returns.
 */
export const explode = () => {
	throw new Error('the task refused');
};
