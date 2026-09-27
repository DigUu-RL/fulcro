import { layoutOf, offsetOf } from '@fulcro/reflect';

/**
 * Fixture that must not compile.
 *
 * Every call here asks for something that is not there — a field the struct
 * does not have, a member that is not a field, the fields of a type that has
 * none, the layout of a type that declares none — and each one has to be a
 * type error at the call site, not a number the transformer invented and not a
 * throw deferred to runtime. The suite reads the diagnostics; the package's
 * tsconfig excludes this file so its typecheck stays clean.
 */

type Single = number & {
	readonly '~layout': { readonly size: 4; readonly alignment: 4 };
};

interface Point {
	readonly '~layout': {
		readonly size: 8;
		readonly alignment: 4;
		readonly fields: {
			readonly x: { readonly size: 4; readonly alignment: 4 };
			readonly y: { readonly size: 4; readonly alignment: 4 };
		};
	};
	readonly x: number;
	readonly y: number;
	length(): number;
}

export const missingField = offsetOf<Point>('z');
export const methodField = offsetOf<Point>('length');
export const layoutField = offsetOf<Point>('~layout');
export const numericField = offsetOf<Single>('x');
export const stringLayout = layoutOf<string>();
