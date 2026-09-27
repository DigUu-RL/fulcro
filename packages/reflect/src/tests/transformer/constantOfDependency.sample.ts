/**
 * What `constantOf.sample.ts` imports: a constant and a function declared in
 * another file of the program, so the suite proves that the transformer follows
 * a name across an import and gives it a binding that cannot meet a name of the
 * importing file.
 */

/** Read by an imported constant; the importing file has a `BASE` of its own. */
const BASE = 3;

/** A constant another file reads through an import. */
export const OFFSET: number = BASE + 1;

/**
 * A function another file calls through an import.
 *
 * @param value Number cubed.
 * @returns Its cube.
 */
export function cube(value: number): number {
	return value * value * value;
}
