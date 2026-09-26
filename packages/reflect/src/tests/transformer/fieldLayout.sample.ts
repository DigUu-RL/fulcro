import { layoutOf, offsetOf } from '@fulcro/reflect';

/**
 * Fixture compiled by the `offsetOf` and `layoutOf` transformer suites.
 *
 * Imports the package by name, so the program resolves it the way a consumer's
 * does. The structs are declared through the protocol alone, as `@fulcro/types`
 * declares them — a layout listing each field's size and alignment, and no
 * offsets — so what is proven here is that the transformer places the fields
 * itself, from the order the checker lists them in.
 */

type Single = number & {
	readonly '~layout': { readonly size: 4; readonly alignment: 4 };
};

/** Declared smallest first, so that placement by alignment has to reorder it. */
interface Mixed {
	readonly '~layout': {
		readonly size: 16;
		readonly alignment: 8;
		readonly fields: {
			readonly flag: { readonly size: 1; readonly alignment: 1 };
			readonly weight: { readonly size: 8; readonly alignment: 8 };
			readonly count: { readonly size: 2; readonly alignment: 2 };
		};
	};
}

/** Three fields of one alignment, in the order they were written. */
interface Vector {
	readonly '~layout': {
		readonly size: 12;
		readonly alignment: 4;
		readonly fields: {
			readonly x: { readonly size: 4; readonly alignment: 4 };
			readonly y: { readonly size: 4; readonly alignment: 4 };
			readonly z: { readonly size: 4; readonly alignment: 4 };
		};
	};
}

/** The same three, written the other way round: the offsets follow. */
interface Reversed {
	readonly '~layout': {
		readonly size: 12;
		readonly alignment: 4;
		readonly fields: {
			readonly z: { readonly size: 4; readonly alignment: 4 };
			readonly y: { readonly size: 4; readonly alignment: 4 };
			readonly x: { readonly size: 4; readonly alignment: 4 };
		};
	};
}

/** Field names that cannot be written bare, or not safely. */
interface Quoted {
	readonly '~layout': {
		readonly size: 2;
		readonly alignment: 1;
		readonly fields: {
			readonly 'two words': { readonly size: 1; readonly alignment: 1 };
			readonly __proto__: { readonly size: 1; readonly alignment: 1 };
		};
	};
}

export const weightOffset = offsetOf<Mixed>('weight');
export const countOffset = offsetOf<Mixed>('count');
export const flagOffset = offsetOf<Mixed>('flag');
export const vectorY = offsetOf<Vector>('y');
export const reversedX = offsetOf<Reversed>('x');
export const reversedZ = offsetOf<Reversed>('z');

export const mixedLayout = layoutOf<Mixed>();
export const singleLayout = layoutOf<Single>();
export const quotedLayout = layoutOf<Quoted>();

declare const held: 'flag';

export const heldInVariable = (): number => offsetOf<Mixed>(held);

export const genericOffset = <T extends Mixed>(): number => offsetOf<T>('flag');

export const genericLayout = <T extends Single>(): unknown => layoutOf<T>();

// Same size, same alignment, and the fields placed differently: there is no
// single answer, and the checker would report the members the two share.
export const unionLayout = (): unknown => layoutOf<Vector | Reversed>();

export const unionOffset = (): number => offsetOf<Vector | Reversed>('x');

// A local function of the same name, shadowing the import: the transformer
// follows the symbol, not the spelling, and must leave this call alone.
export const notOurs = ((): number => {
	const offsetOf = <T>(field: string): number => field.length;

	return offsetOf<Mixed>('flag');
})();
