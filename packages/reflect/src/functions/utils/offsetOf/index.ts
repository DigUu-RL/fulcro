import { type FieldOf, unresolvedLayout, type WithFieldLayout } from '@/src/functions/utils/layout';

/**
 * Where a field of a struct sits, in bytes from the start of the struct.
 *
 * ```ts
 * import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';
 *
 * const Starfighter = struct('Starfighter', {
 * 	shields: SinglePrecisionFloat,
 * 	hull: SinglePrecisionFloat,
 * 	speed: SinglePrecisionFloat,
 * });
 * type Starfighter = Struct<typeof Starfighter>;
 *
 * offsetOf<Starfighter>('hull'); // 4
 * offsetOf<Starfighter>('hyperdrive'); // type error: not a field
 * ```
 *
 * Resolved entirely at compile time: the bundled transformer replaces the call
 * with the number, which is the offset the struct's descriptor reports as
 * `layout.fields.y.offset`. Fields are placed by alignment, largest first, and
 * in declaration order among equals; the transformer reads that order from the
 * type, so a struct imported from a built package answers as one declared next
 * door does.
 *
 * @template T Struct whose field is located; its layout must list its fields.
 * @param field Name of the field, written as a string literal.
 * @returns The offset, in bytes.
 * @throws {Error} Always, when the transformer is not enabled, the type
 * argument is a generic parameter, or the field is not a string literal.
 */
export const offsetOf = <T extends WithFieldLayout>(field: FieldOf<T>): number => {
	throw unresolvedLayout(`offsetOf<T>(${JSON.stringify(field)})`);
};
