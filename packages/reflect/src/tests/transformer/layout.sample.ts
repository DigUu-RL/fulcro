import { alignOf, sizeOf } from '@fulcro/reflect';

/**
 * Fixture compiled by the `sizeOf` and `alignOf` transformer suites.
 *
 * Imports the package by name, so the program resolves it the way a consumer's
 * does. Every binding below is asserted on by its emitted text.
 */

type Half = number & {
	readonly '~layout': { readonly size: 2; readonly alignment: 2 };
};

class Declared {
	declare readonly '~layout': { readonly size: 12; readonly alignment: 4 };
}

type Mixed = Half | Declared;

export const halfSize = sizeOf<Half>();
export const declaredSize = sizeOf<Declared>();
export const halfAlignment = alignOf<Half>();
export const declaredAlignment = alignOf<Declared>();

export const mixedSize = (): number => sizeOf<Mixed>();

export const genericSize = <T extends Half>(): number => sizeOf<T>();

// A local function of the same name, shadowing the import: the transformer
// follows the symbol, not the spelling, and must leave this call alone.
export const notOurs = ((): number => {
	const sizeOf = <T>(): number => 99;

	return sizeOf<Half>();
})();
