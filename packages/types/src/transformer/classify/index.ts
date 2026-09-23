import typescript from 'typescript';

/**
 * Which of this package's numeric types a checker type is, if any.
 *
 * The rewrite of the operators must claim only this package's types. A
 * consumer's own `number` and `bigint` arithmetic is none of its business, and
 * a brand that merely looks like ours — a property with the same name in some
 * other library — is not ours either. So a type is recognised by where its
 * brand was **declared**: the `brand` module of this package, as source in this
 * repository and as `dist` in a consumer's `node_modules`.
 */

/** How the operators of one numeric type are written out. */
export type NumericKind =
	| {
			/** Called through a descriptor: `SignedInteger(32).add(a, b)`. */
			readonly family: 'descriptor';

			/** The descriptor, as an expression under the namespace import. */
			readonly descriptor: string;

			/** Whether the bit operators apply. */
			readonly integer: boolean;

			/** Name of the brand, which tells two kinds apart. */
			readonly name: string;
	  }
	| {
			/** Called as methods of the value: `a.add(b)`. */
			readonly family: 'decimal';

			readonly name: 'Decimal';
	  };

/** The module declaring the brand every primitive-backed type carries. */
const BRAND_MODULE = /\/types\/(?:dist|src)\/brand\/index\.(?:d\.)?ts$/;

/** The module declaring `Decimal`. */
const DECIMAL_MODULE = /\/types\/(?:dist|src)\/decimal\/index\.(?:d\.)?ts$/;

/** A brand of a fixed-width integer, and its parts. */
const INTEGER_BRAND = /^(Signed|Unsigned)Integer(8|16|32|64|128)$/;

/** Brands whose descriptor is a value of the same name. */
const NAMED_BRANDS: ReadonlySet<string> = new Set([
	'HalfPrecisionFloat',
	'SinglePrecisionFloat',
	'DoublePrecisionFloat',
	'BigInteger',
]);

/**
 * Tells whether a declaration was made in a module of this package.
 *
 * @param declaration Declaration of a symbol.
 * @param module Pattern of the module.
 * @returns `true` when it was.
 */
const declaredIn = (
	declaration: typescript.Declaration,
	module: RegExp,
): boolean =>
	module.test(declaration.getSourceFile().fileName.replace(/\\/g, '/'));

/**
 * The kind a brand stands for.
 *
 * @param brand Value of the brand property.
 * @returns The kind, or `null` for a brand this rewrite does not know.
 */
const kindOfBrand = (brand: string): NumericKind | null => {
	const integer: RegExpExecArray | null = INTEGER_BRAND.exec(brand);

	if (integer !== null) {
		return {
			family: 'descriptor',
			descriptor: `${integer[1]}Integer(${integer[2]})`,
			integer: true,
			name: brand,
		};
	}

	if (NAMED_BRANDS.has(brand)) {
		return {
			family: 'descriptor',
			descriptor: brand,
			integer: false,
			name: brand,
		};
	}

	return null;
};

/**
 * Classifies a type.
 *
 * A union is never one of ours, even a union of our types: `SignedInteger<8> |
 * SignedInteger<16>` has no one descriptor to call, and `Decimal | undefined`
 * has to be narrowed first, which the checker already insists on.
 *
 * @param type Type to classify.
 * @param checker Checker of the program.
 * @param location Node the type was read at.
 * @returns The kind, or `null` when the type is not one of this package's.
 */
export const classify = (
	type: typescript.Type,
	checker: typescript.TypeChecker,
	location: typescript.Node,
): NumericKind | null => {
	if (type.isUnion()) return null;

	const symbol: typescript.Symbol | undefined = type.getSymbol();

	if (
		symbol?.getName() === 'Decimal' &&
		(symbol.declarations ?? []).some((declaration) =>
			declaredIn(declaration, DECIMAL_MODULE),
		)
	) {
		return { family: 'decimal', name: 'Decimal' };
	}

	for (const property of checker.getPropertiesOfType(type)) {
		// The brand is keyed by a unique symbol, which the checker names
		// `__@brand@<id>`; the declaration settles whose it is.
		if (!String(property.escapedName).startsWith('__@')) continue;

		const ours: boolean = (property.declarations ?? []).some((declaration) =>
			declaredIn(declaration, BRAND_MODULE),
		);

		if (!ours) continue;

		const brand: typescript.Type = checker.getTypeOfSymbolAtLocation(
			property,
			location,
		);

		return brand.isStringLiteral() ? kindOfBrand(brand.value) : null;
	}

	return null;
};
