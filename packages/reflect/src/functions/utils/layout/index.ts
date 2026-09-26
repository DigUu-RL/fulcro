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
 * The error both utilities throw when a call reached runtime.
 *
 * @param call How the call was written, for the message.
 * @returns The error.
 */
export const unresolvedLayout = (call: string): Error =>
	createError('FULCRO4009', call);
