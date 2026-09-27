import { createError } from '@fulcro/errors';

/**
 * A type that declares its memory layout.
 *
 * The constraint of `sizeOf` and `alignOf`, and the whole of the protocol they
 * read: a type carrying a `'~layout'` property whose `size` and `alignment` are
 * number literals. `@fulcro/types` declares it on every numeric type with a
 * fixed layout; nothing here imports that package, and nothing there imports
 * this one — the shape is the agreement.
 *
 * The property is declared on the type and never present on a value, so the
 * answer only exists at compile time.
 */
export interface WithLayout {
	readonly '~layout': {
		readonly size: number;
		readonly alignment: number;
	};
}

/**
 * A type whose layout also lists its fields: a struct.
 *
 * The constraint of `offsetOf`. `@fulcro/types` declares `fields` on the layout
 * of every struct value, each with its size and alignment, and without its
 * offset — the offset follows from the order the fields were declared in, which
 * the transformer reads from the type, as the compiler keeps it.
 */
export interface WithFieldLayout {
	readonly '~layout': {
		readonly size: number;
		readonly alignment: number;
		readonly fields: {
			readonly [field: string]: {
				readonly size: number;
				readonly alignment: number;
			};
		};
	};
}

/**
 * The names of the fields a type's layout lists.
 *
 * @template T Type whose layout lists fields.
 */
export type FieldOf<T extends WithFieldLayout> = keyof T['~layout']['fields'] &
	string;

/**
 * The layout of a type, as `layoutOf<T>()` reports it: its size and alignment
 * and, for a struct, where each field sits and how much room it takes — the
 * same object a struct's descriptor carries as `layout`.
 *
 * A type whose layout lists no fields, such as a numeric type, has none.
 *
 * @template T Type whose layout is described.
 */
export type TypeLayout<T extends WithLayout> = {
	readonly size: T['~layout']['size'];
	readonly alignment: T['~layout']['alignment'];
	readonly fields: T['~layout'] extends {
		readonly fields: infer TFields extends WithFieldLayout['~layout']['fields'];
	}
		? {
				readonly [TKey in keyof TFields]: {
					readonly offset: number;
					readonly size: TFields[TKey]['size'];
					readonly alignment: TFields[TKey]['alignment'];
				};
			}
		: Record<never, never>;
};

/**
 * The error every layout utility throws when a call reached runtime.
 *
 * @param call How the call was written, for the message.
 * @returns The error.
 */
export const unresolvedLayout = (call: string): Error =>
	createError('FULCRO4009', call);
