import { unresolvedLayout, type WithLayout } from '@/functions/utils/layout';

/**
 * The alignment of a type in memory, in bytes, as the type declares it: the
 * multiple of which every address holding one must be.
 *
 * ```ts
 * import { UnsignedInteger, Decimal } from '@fulcro/types';
 *
 * alignOf<UnsignedInteger<16>>(); // 2
 * alignOf<Decimal>(); // 16
 * ```
 *
 * Resolved entirely at compile time, like {@link sizeOf}: the bundled
 * transformer replaces the call with the number, and a type that declares no
 * layout is a type error.
 *
 * @template T Type whose alignment is read; it must declare a layout.
 * @returns The alignment, in bytes.
 * @throws {Error} Always, when the transformer is not enabled or the type
 * argument is a generic parameter.
 */
export const alignOf = <T extends WithLayout>(): number => {
	throw unresolvedLayout('alignOf<T>()');
};
