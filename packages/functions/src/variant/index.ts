/**
 * Every prototype {@link variantPrototype} built.
 *
 * `createEquals` compares an object of any class by identity, since a class
 * may keep its state where no comparison can read it. A variant keeps all of
 * its data in its own fields, so it is compared by them instead — and this is
 * how it is told from any other object with a prototype of its own.
 */
const VARIANT_PROTOTYPES = new WeakSet<object>();

/**
 * Tells whether a prototype is the one a variant of this package shares.
 *
 * @param prototype Prototype to inspect.
 * @returns `true` for the prototype of `Success`, `Failure`, `Some` or `None`.
 */
export const isVariantPrototype = (prototype: object): boolean => {
	return VARIANT_PROTOTYPES.has(prototype);
};

/**
 * Builds the prototype one variant of a value type shares — `Success`,
 * `Failure`, `Some` or `None` — with its methods on it.
 *
 * The methods sit on a prototype rather than on every value so that creating a
 * value costs one object and nothing more, whatever the number of methods. They
 * are non-enumerable, as a class's would be, so that `for…in`, a spread and a
 * deep equality see the data of the value and nothing else.
 *
 * @param methods The methods of the variant.
 * @returns A frozen prototype carrying them.
 */
export const variantPrototype = <TMethods extends object>(methods: TMethods): TMethods => {
	const prototype: object = {};

	VARIANT_PROTOTYPES.add(prototype);

	for (const key of Reflect.ownKeys(methods)) {
		Object.defineProperty(prototype, key, {
			value: (methods as Record<PropertyKey, unknown>)[key],
			enumerable: false,
			writable: false,
			configurable: false,
		});
	}

	return Object.freeze(prototype) as TMethods;
};

/**
 * Creates a frozen value of one variant.
 *
 * `TValue` is inferred from where the value goes — `Success<T>`, `Some<T>` —
 * never from the fields, which are only checked against it: a field the
 * value's type does not declare is refused here rather than carried along
 * unseen. The prototype's
 * methods are what the conversion vouches for: they return `boolean`, where
 * the value's type narrows with `this is`.
 *
 * @template TValue Type of the value created.
 * @param prototype The variant's prototype, from {@link variantPrototype}.
 * @param fields The value's own data.
 * @returns The value, frozen, inheriting the variant's methods.
 */
export const createVariant = <TValue>(
	prototype: object,
	fields: Partial<NoInfer<TValue>>,
): TValue => {
	return Object.freeze(Object.assign(Object.create(prototype) as object, fields)) as TValue;
};
