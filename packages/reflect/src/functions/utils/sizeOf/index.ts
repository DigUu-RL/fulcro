import { unresolvedLayout, type WithLayout } from '@/functions/utils/layout';

/**
 * The size of a type in memory, in bytes, as the type declares it.
 *
 * ```ts
 * import { SignedInteger, Decimal } from '@fulcro/types';
 *
 * sizeOf<SignedInteger<32>>(); // 4
 * sizeOf<Decimal>(); // 16
 * sizeOf<BigInteger>(); // type error: no fixed layout
 * ```
 *
 * Resolved entirely at compile time: the bundled transformer replaces the call
 * with the number, so it costs what a literal costs. A type that declares no
 * layout — `string`, `bigint`, an object — fails the constraint and is a type
 * error, rather than an answer invented for it.
 *
 * The size is that of the value in a contiguous binary layout — the format the
 * type describes, such as the two bytes of a half precision float. It is not
 * what a JavaScript engine spends on a `number` or an object in its own heap,
 * which no type can know.
 *
 * @template T Type whose size is read; it must declare a layout.
 * @returns The size, in bytes.
 * @throws {Error} Always, when the transformer is not enabled or the type
 * argument is a generic parameter.
 */
export const sizeOf = <T extends WithLayout>(): number => {
	throw unresolvedLayout('sizeOf<T>()');
};
