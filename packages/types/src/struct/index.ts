import type { Layout } from '@/layout';
import type { Add, LargestAlignment, RoundUp } from '@/struct/arithmetic';
import { codecOf, type FieldCodec, registerStructCodec } from '@/struct/codec';

/**
 * What a field of a struct may be declared with: the descriptor of a type that
 * declares a fixed layout — a numeric type of this package other than
 * `BigInteger`, or another struct.
 */
interface FieldDescriptor {
	is(value: unknown): value is Layout<number, number>;
}

/** The fields of a struct, by name, in declaration order. */
type StructFields = { readonly [field: string]: FieldDescriptor };

/** The type of the values a descriptor recognises. */
type ValueOf<TDescriptor> = TDescriptor extends {
	is(value: unknown): value is infer T;
}
	? T
	: never;

/** What a descriptor's `from` accepts. */
type SourceOf<TDescriptor> = TDescriptor extends {
	from(value: infer TSource): unknown;
}
	? TSource
	: never;

/** The layout a field's type declares. */
type FieldLayout<TDescriptor> =
	ValueOf<TDescriptor> extends Layout<infer TSize, infer TAlignment>
		? { readonly size: TSize; readonly alignment: TAlignment }
		: never;

/** A union, as a tuple in no particular order — enough to sum over it. */
type UnionToTuple<TUnion, TTuple extends unknown[] = []> = [TUnion] extends [
	never,
]
	? TTuple
	: UnionToTuple<Exclude<TUnion, LastOf<TUnion>>, [LastOf<TUnion>, ...TTuple]>;

/** One member of a union, picked by how TypeScript orders overloads. */
type LastOf<TUnion> = (
	TUnion extends unknown ? (member: () => TUnion) => void : never
) extends (member: infer TIntersection) => void
	? TIntersection extends () => infer TMember
		? TMember
		: never
	: never;

/** The sizes of some fields, added up. */
type SumOfSizes<
	TFields extends StructFields,
	TKeys extends unknown[],
	TSum extends number = 0,
> = TKeys extends [infer TKey extends keyof TFields, ...infer TRest]
	? SumOfSizes<TFields, TRest, Add<TSum, FieldLayout<TFields[TKey]>['size']>>
	: TSum;

/** Alignment of a struct: the largest alignment of its fields. */
type StructAlignment<TFields extends StructFields> = LargestAlignment<
	{
		[TKey in keyof TFields]: FieldLayout<TFields[TKey]>['alignment'];
	}[keyof TFields]
>;

/**
 * Size of a struct: its fields, which pack without padding once ordered by
 * alignment, rounded up to its alignment. Independent of the order the fields
 * were declared in, which is why it can be computed here at all — a type does
 * not promise an order for its keys.
 */
type StructSize<TFields extends StructFields> = RoundUp<
	SumOfSizes<TFields, UnionToTuple<keyof TFields>>,
	StructAlignment<TFields>
>;

/** A value of a struct. */
type StructValue<TFields extends StructFields> = {
	readonly [TKey in keyof TFields]: ValueOf<TFields[TKey]>;
} & Layout<StructSize<TFields>, StructAlignment<TFields>>;

/** What a struct's `from` accepts: each field in what its own `from` accepts. */
type StructSource<TFields extends StructFields> = {
	readonly [TKey in keyof TFields]: SourceOf<TFields[TKey]>;
};

/**
 * The descriptor of a struct: its layout, and how its values are made,
 * recognised, compared and stored.
 *
 * @template TFields Descriptors of the fields, by name.
 */
export interface StructType<TFields extends StructFields> {
	/** Name of the struct, as it reads in an error message. */
	readonly name: string;

	/**
	 * Where each field sits and how much room the struct takes.
	 *
	 * Fields are placed by alignment, largest first, and in declaration order
	 * among equals — so no field needs padding before it, and only the end of
	 * the struct is padded, up to its alignment, so that the next one in an
	 * array starts aligned. `size` and `alignment` are the numbers
	 * `sizeOf<T>()` and `alignOf<T>()` report.
	 */
	readonly layout: {
		readonly size: StructSize<TFields>;
		readonly alignment: StructAlignment<TFields>;
		readonly fields: {
			readonly [TKey in keyof TFields]: {
				readonly offset: number;
				readonly size: FieldLayout<TFields[TKey]>['size'];
				readonly alignment: FieldLayout<TFields[TKey]>['alignment'];
			};
		};
	};

	/**
	 * Makes a value, converting each field with its own type's `from`.
	 *
	 * @param source One entry per field, and nothing else.
	 * @returns The value, frozen.
	 * @throws {TypeError} When a field is missing or not a field of the struct.
	 * @throws {RangeError} When a field's own conversion refuses its value; the
	 * message names the field, and `cause` is the original error.
	 */
	from(source: StructSource<TFields>): StructValue<TFields>;

	/**
	 * Tells whether a value is one of this struct's: frozen, with exactly its
	 * fields, each of its type.
	 *
	 * @param value Value to inspect.
	 * @returns `true` when it is.
	 */
	is(value: unknown): value is StructValue<TFields>;

	/**
	 * Compares two values field by field, each as its own type compares — so a
	 * `NaN` field makes a value unequal to itself, as it does in C#.
	 *
	 * @param left First value.
	 * @param right Second value.
	 * @returns `true` when every field is equal.
	 */
	equals(left: StructValue<TFields>, right: StructValue<TFields>): boolean;

	/**
	 * Reads a value from bytes, in the layout of {@link StructType.layout},
	 * little-endian.
	 *
	 * @param view Bytes to read from.
	 * @param offset Where the value starts.
	 * @returns The value, frozen.
	 * @throws {RangeError} When the struct does not fit in the view at that
	 * offset.
	 */
	read(view: DataView, offset: number): StructValue<TFields>;

	/**
	 * Writes a value into bytes, in the layout of {@link StructType.layout},
	 * little-endian. Padding bytes are left as they were.
	 *
	 * @param view Bytes to write into.
	 * @param offset Where the value starts.
	 * @param value Value to write.
	 * @throws {RangeError} When the struct does not fit in the view at that
	 * offset.
	 */
	write(view: DataView, offset: number, value: StructValue<TFields>): void;
}

/**
 * The type of the values of a struct, named from its descriptor.
 *
 * ```ts
 * export const Vector3 = struct('Vector3', { x: SinglePrecisionFloat, … });
 * export type Vector3 = Struct<typeof Vector3>;
 * ```
 *
 * @template TDescriptor Type of the descriptor `struct` returned.
 */
export type Struct<TDescriptor extends StructType<StructFields>> =
	TDescriptor extends StructType<infer TFields> ? StructValue<TFields> : never;

/** A field, resolved: where it sits and how it is stored. */
interface PlacedField {
	readonly key: string;
	readonly descriptor: {
		from(value: unknown): unknown;
		is(value: unknown): boolean;
	};
	readonly codec: FieldCodec;
	readonly offset: number;
}

/**
 * Keys an object lists before every other, in numeric order, whatever order
 * they were written in. A field named like one would silently move, so it is
 * refused.
 */
const ARRAY_INDEX = /^(?:0|[1-9]\d*)$/;

/**
 * Describes a value for an error message.
 *
 * @param value Value being reported.
 * @returns Its kind.
 */
const describeKind = (value: unknown): string =>
	value === null ? 'null' : typeof value;

/**
 * Re-throws the error a field's own conversion raised, naming the field.
 *
 * @param name Name of the struct.
 * @param key Field being converted.
 * @param error What the conversion threw.
 * @returns Never.
 */
const rethrowForField = (name: string, key: string, error: unknown): never => {
	const message = (original: Error): string =>
		`${name}.from: field '${key}': ${original.message}`;

	if (error instanceof RangeError) {
		throw new RangeError(message(error), { cause: error });
	}

	if (error instanceof TypeError) {
		throw new TypeError(message(error), { cause: error });
	}

	if (error instanceof SyntaxError) {
		throw new SyntaxError(message(error), { cause: error });
	}

	throw error;
};

/**
 * Declares a struct: a value type with a fixed layout.
 *
 * ```ts
 * export const Vector3 = struct('Vector3', {
 * 	x: SinglePrecisionFloat,
 * 	y: SinglePrecisionFloat,
 * 	z: SinglePrecisionFloat,
 * });
 * export type Vector3 = Struct<typeof Vector3>;
 *
 * const up: Vector3 = Vector3.from({ x: 0, y: 1, z: 0 });
 *
 * Vector3.layout.size; // 12
 * Vector3.write(new DataView(buffer), 0, up);
 * ```
 *
 * A value has no identity: it is frozen, two values with the same fields are
 * equal by {@link StructType.equals}, and it can be written into bytes and
 * read back as the same value. It is still a JavaScript object while it is
 * held as one; the layout is what it occupies when it is stored.
 *
 * @param name Name of the struct, for error messages.
 * @param fields Descriptor of each field, by name.
 * @returns The descriptor of the struct.
 * @throws {TypeError} When there is no field, a field's type has no fixed
 * layout, or a field is named like an array index or `~layout`.
 */
export const struct = <TFields extends StructFields>(
	name: string,
	fields: TFields,
): StructType<TFields> => {
	if (typeof name !== 'string' || name === '') {
		throw new TypeError(
			`struct: expected a name, received ${describeKind(name)}.`,
		);
	}

	if (typeof fields !== 'object' || fields === null) {
		throw new TypeError(
			`struct ${name}: expected an object of fields, received ${describeKind(fields)}.`,
		);
	}

	const keys: string[] = Object.keys(fields);

	if (keys.length === 0) {
		throw new TypeError(`struct ${name}: expected at least one field.`);
	}

	const declared = keys.map((key) => {
		if (ARRAY_INDEX.test(key) || key === '~layout') {
			throw new TypeError(
				`struct ${name}: '${key}' cannot name a field; an array index would be reordered, and '~layout' is the layout itself.`,
			);
		}

		const codec: FieldCodec | undefined = codecOf(fields[key]);

		if (codec === undefined) {
			throw new TypeError(
				`struct ${name}: field '${key}' has no fixed layout. Declare it with a numeric type of @fulcro/types other than BigInteger, or with another struct.`,
			);
		}

		return { key, descriptor: fields[key], codec };
	});

	// Largest alignment first, so that every field lands aligned without padding
	// before it: each size is a multiple of its own alignment. `sort` is stable,
	// which keeps declaration order among equals.
	const offsets = new Map<string, number>();
	let end = 0;

	for (const field of [...declared].sort(
		(left, right) => right.codec.alignment - left.codec.alignment,
	)) {
		offsets.set(field.key, end);
		end += field.codec.size;
	}

	const alignment: number = Math.max(
		...declared.map((field) => field.codec.alignment),
	);
	const size: number = Math.ceil(end / alignment) * alignment;

	const plan: readonly PlacedField[] = declared.map((field) => ({
		...field,
		descriptor: field.descriptor as unknown as PlacedField['descriptor'],
		offset: offsets.get(field.key) as number,
	}));

	const layout = Object.freeze({
		size,
		alignment,
		fields: Object.freeze(
			Object.fromEntries(
				plan.map((field) => [
					field.key,
					Object.freeze({
						offset: field.offset,
						size: field.codec.size,
						alignment: field.codec.alignment,
					}),
				]),
			),
		),
	});

	/**
	 * Refuses a view and an offset the struct does not fit in, before a byte is
	 * touched — so a failed write leaves the view as it was.
	 *
	 * @param operation Operation being performed.
	 * @param view View handed in.
	 * @param offset Offset handed in.
	 */
	const requireRoom = (
		operation: string,
		view: DataView,
		offset: number,
	): void => {
		if (!(view instanceof DataView)) {
			throw new TypeError(
				`${name}.${operation}: expected a DataView, received ${describeKind(view)}.`,
			);
		}

		if (
			!Number.isInteger(offset) ||
			offset < 0 ||
			offset + size > view.byteLength
		) {
			throw new RangeError(
				`${name}.${operation}: ${size} bytes at offset ${offset} do not fit in a view of ${view.byteLength} bytes.`,
			);
		}
	};

	const readFields = (view: DataView, offset: number): unknown => {
		const value: Record<string, unknown> = {};

		for (const field of plan) {
			value[field.key] = field.codec.read(view, offset + field.offset);
		}

		return Object.freeze(value);
	};

	const writeFields = (
		view: DataView,
		offset: number,
		value: unknown,
	): void => {
		for (const field of plan) {
			field.codec.write(
				view,
				offset + field.offset,
				(value as Record<string, unknown>)[field.key],
			);
		}
	};

	const equals = (left: unknown, right: unknown): boolean =>
		plan.every((field) =>
			field.codec.equals(
				(left as Record<string, unknown>)[field.key],
				(right as Record<string, unknown>)[field.key],
			),
		);

	const descriptor: StructType<TFields> = {
		name,
		layout: layout as StructType<TFields>['layout'],

		from: (source) => {
			if (typeof source !== 'object' || source === null) {
				throw new TypeError(
					`${name}.from: expected an object, received ${describeKind(source)}.`,
				);
			}

			for (const key of Object.keys(source)) {
				if (!Object.hasOwn(fields, key)) {
					throw new TypeError(
						`${name}.from: '${key}' is not a field; the fields are ${keys.join(', ')}.`,
					);
				}
			}

			const value: Record<string, unknown> = {};

			for (const field of plan) {
				if (!Object.hasOwn(source, field.key)) {
					throw new TypeError(`${name}.from: missing field '${field.key}'.`);
				}

				try {
					value[field.key] = field.descriptor.from(
						(source as Record<string, unknown>)[field.key],
					);
				} catch (error) {
					rethrowForField(name, field.key, error);
				}
			}

			return Object.freeze(value) as StructValue<TFields>;
		},

		is: (value): value is StructValue<TFields> =>
			typeof value === 'object' &&
			value !== null &&
			Object.isFrozen(value) &&
			Object.keys(value).length === plan.length &&
			plan.every(
				(field) =>
					Object.hasOwn(value, field.key) &&
					field.descriptor.is((value as Record<string, unknown>)[field.key]),
			),

		equals,

		read: (view, offset) => {
			requireRoom('read', view, offset);

			return readFields(view, offset) as StructValue<TFields>;
		},

		write: (view, offset, value) => {
			requireRoom('write', view, offset);
			writeFields(view, offset, value);
		},
	};

	registerStructCodec(descriptor, {
		size,
		alignment,
		read: readFields,
		write: writeFields,
		equals,
	});

	return descriptor;
};
