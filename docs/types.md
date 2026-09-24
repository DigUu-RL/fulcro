# Numeric types

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/types.md)

Numbers with a declared range and a declared layout: fixed-width integers, three
binary floating point formats, an integer of any size, and a decimal with the
semantics of IEEE 754 decimal128 — and [structs](#structs), value types built
from them.

```sh
npm install @fulcro/types
```

```ts
import {
	BigInteger,
	Decimal,
	DoublePrecisionFloat,
	HalfPrecisionFloat,
	SignedInteger,
	SinglePrecisionFloat,
	UnsignedInteger,
} from '@fulcro/types';
```

The types and their descriptors need nothing else — no compiler plugin, no
configuration. Every operation is a method, typed in every editor and every
build; the JavaScript operators are the language's own, as
[Operators](#operators) explains.

## The problem

JavaScript has one number, a 64-bit binary float, and it is the wrong one for
most of the numbers a program actually holds:

```ts
0.1 + 0.2; // 0.30000000000000004 — a price, gone wrong
2 ** 53 + 1; // 9007199254740992 — an identifier, silently changed
const port = 70_000; // nothing says a port is 16 bits
```

The first is a decimal fraction stored in binary. The second is an integer
past the 53 bits a double holds exactly. The third is a range nobody wrote down,
so nothing checks it. This package names each of those numbers as what it is,
and checks it where it is made.

## Every type has a value of the same name

A type is erased on the way to JavaScript, so `SignedInteger<32>` alone cannot
check anything. Each type therefore comes with a **descriptor** of the same
name, which converts, recognises and computes:

```ts
const Int32 = SignedInteger(32);

const port: UnsignedInteger<16> = UnsignedInteger(16).from(8080);
const total: SignedInteger<32> = Int32.add(Int32.from(1), Int32.from(2));
```

The descriptors have types of their own, for code that works over any numeric
type: an integer's descriptor is an `IntegerType<T>`, a float's a
`BoundedNumericType<T, number>`, and `BigInteger`'s a `NumericType<T, TSource>`
— `TSource` being what its `from` accepts. `IntegerWidth` is the union of
widths, `8 | 16 | 32 | 64 | 128`.

```ts
import type { NumericType } from '@fulcro/types';

const sum = <T>(
	type: NumericType<T, unknown>,
	values: readonly T[],
	zero: T,
): T => values.reduce((total, value) => type.add(total, value), zero);
```

Every type with a range reports it as `minimum` and `maximum`: the smallest and
the largest **finite** value. `minimum` is the most negative value, not the
smallest positive one that `Number.MIN_VALUE` means:

| Type                             | `minimum`           | `maximum`          |
| -------------------------------- | ------------------- | ------------------ |
| `SignedInteger<N>`               | −2^(N−1)            | 2^(N−1) − 1        |
| `UnsignedInteger<N>`             | 0                   | 2^N − 1            |
| `HalfPrecisionFloat`             | −65,504             | 65,504             |
| `SinglePrecisionFloat`           | ≈ −3.4 × 10³⁸       | ≈ 3.4 × 10³⁸       |
| `DoublePrecisionFloat`           | −`Number.MAX_VALUE` | `Number.MAX_VALUE` |
| `Decimal` (`Decimal.minimum`, …) | −9.99…9 × 10⁶¹⁴⁴    | 9.99…9 × 10⁶¹⁴⁴    |

`BigInteger` has neither: its values are as large as memory allows.

If you only want the types — to annotate an interface, say — import them with
`import type` and you take no code at all:

```ts
import type { SignedInteger } from '@fulcro/types';

interface Packet {
	readonly length: SignedInteger<32>;
}
```

## Fixed-width integers

`SignedInteger<N>` and `UnsignedInteger<N>`, for `N` of 8, 16, 32, 64 or 128
bits. The width is a parameter, not part of the name: there is no
`SignedInteger32`, and no `i32`.

| Width | Signed range     | Unsigned range | Carried by |
| ----- | ---------------- | -------------- | ---------- |
| 8     | −128 … 127       | 0 … 255        | `number`   |
| 16    | −32,768 … 32,767 | 0 … 65,535     | `number`   |
| 32    | −2³¹ … 2³¹ − 1   | 0 … 2³² − 1    | `number`   |
| 64    | −2⁶³ … 2⁶³ − 1   | 0 … 2⁶⁴ − 1    | `bigint`   |
| 128   | −2¹²⁷ … 2¹²⁷ − 1 | 0 … 2¹²⁸ − 1   | `bigint`   |

Up to 32 bits a `number` holds every value exactly and costs nothing. From 64
it cannot, so the value is a `bigint` — and the type says so, rather than you
finding out from a lost digit.

### Checked, unless you ask to wrap

Every operation checks its result, and a result out of range throws:

```ts
const Byte = UnsignedInteger(8);

Byte.from(256); // RangeError: UnsignedInteger<8>.from: 256 is outside [0, 255].
Byte.subtract(Byte.from(0), Byte.from(1)); // RangeError
Byte.from(1.5); // RangeError: expected an integer, received 1.5.
```

When modular arithmetic is what you mean — hashing, checksums, emulating a
register — say so with `wrap`, which reduces any integer modulo 2^N and never
throws:

```ts
SignedInteger(8).wrap(200); // -56
UnsignedInteger(8).wrap(-1); // 255
SignedInteger(32).wrap(2 ** 31); // -2147483648
```

Each descriptor has `from`, `wrap`, `is`, `minimum`, `maximum`, `width` and
`signed`, the arithmetic `add`, `subtract`, `multiply`, `divide`, `remainder`,
`power`, `negate`, `increment` and `decrement`, the comparisons `equals`,
`lessThan`, `lessThanOrEqual`, `greaterThan` and `greaterThanOrEqual`, and the
bit operations `bitwiseAnd`, `bitwiseOr`, `bitwiseXor`, `bitwiseNot`,
`shiftLeft`, `shiftRight` and `shiftRightLogical`.

- Division truncates towards zero; the remainder takes the sign of the
  dividend, as `%` does. Dividing by zero, and dividing a signed minimum by −1,
  throw.
- `power` takes an exponent of the same type; a negative one throws, as does a
  result out of range.
- A shift count must be from 0 to the width − 1, or it throws. Bits shifted out
  are discarded — a shift is a bit operation, never an overflow. `>>` copies the
  sign bit in on a signed type; `shiftRightLogical` (`>>>`) brings zeros in,
  over the type's own width: `-1 >>> 28` is `15` in 32 bits.

A `SignedInteger<8>` is not a `SignedInteger<32>`, even though every value of
one fits the other: widening goes through `from`, where it can be seen.

## Floats

| Type                   | Format            | Significant bits | Finite up to  |
| ---------------------- | ----------------- | ---------------- | ------------- |
| `HalfPrecisionFloat`   | IEEE 754 binary16 | 11               | 65,504        |
| `SinglePrecisionFloat` | IEEE 754 binary32 | 24               | ≈ 3.4 × 10³⁸  |
| `DoublePrecisionFloat` | IEEE 754 binary64 | 53               | ≈ 1.8 × 10³⁰⁸ |

Each is carried by a `number` holding a value the format can represent exactly,
so it reads, compares and prints like any other number. `from` rounds to the
nearest such value, ties to even:

```ts
SinglePrecisionFloat.from(0.1); // 0.10000000149011612
HalfPrecisionFloat.from(0.1); // 0.0999755859375
HalfPrecisionFloat.from(65520); // Infinity
```

The arithmetic rounds each result once, back into the format. That is not an
approximation: when the wider format has at least 2p + 2 bits of precision,
computing in double and rounding once is exactly the correctly rounded result,
and a double has enough for both narrower formats.

```ts
const a = SinglePrecisionFloat.from(0.1);
const b = SinglePrecisionFloat.from(0.2);

SinglePrecisionFloat.add(a, b); // 0.30000001192092896, as float32 hardware gives
```

Written with the operator, `a + b` is a double nobody rounded:
`0.30000000447034836`.

`power` is `Math.pow` rounded once into the format. Unlike the four operations
above, it is faithful rather than guaranteed nearest, because `Math.pow` itself
is not correctly rounded.

`from` takes a `number` only. A `bigint` is refused rather than converted,
because turning it into a double first and then into the format rounds twice,
and the second rounding can land on the wrong neighbour.

## `BigInteger`

An integer of any size, carried by a `bigint` — which is already exact at every
magnitude — and branded like every other type here, so a `BigInteger` is a
`bigint` that went through `BigInteger.from`, and an unchecked `bigint` cannot
be passed where one is expected.

The descriptor adds a decimal-only `from` — `BigInteger.from('0x10')` is
refused, not read as 16 — division that says which operation divided by zero,
and a `power` that refuses a negative exponent.

It is the one type here with no fixed layout: its size is the size of its value.

## `Decimal`

A decimal floating point number, for money and for anything else that is
decimal by nature:

```ts
const price = Decimal.from('19.99');

price.multiply(Decimal.from(3)).toString(); // '59.97'
Decimal.from('0.1').add(Decimal.from('0.2')).equals(Decimal.from('0.3')); // true
```

Its semantics are those of IEEE 754 **decimal128**, as the TC39 Decimal proposal
specifies them: 34 significant digits, exponents from −6143 to 6144, and the
special values `NaN`, `Infinity`, `-Infinity` and `-0`. Code written against it
reads the same against a native decimal, should the platform ever ship one.

### Making one

```ts
Decimal.from('-12.50'); // from a literal; trailing zeros are not kept
Decimal.from(0.1); // from a number: exactly 0.1, not the binary value near it
Decimal.from(12345678901234567890n); // from a bigint, exactly
```

A string is a decimal literal: an optional sign, digits with at most one point,
an optional exponent, or `NaN` / `Infinity`. Surrounding whitespace and
hexadecimal are refused with a `SyntaxError`. Past 34 significant digits the
value is rounded half to even.

### Every operation rounds once

`add`, `subtract`, `multiply` and `divide` compute the exact result and round it
to 34 digits, half to even unless you pass a mode:

```ts
Decimal.from(1).divide(Decimal.from(3)).toString();
// '0.3333333333333333333333333333333333'

Decimal.from(2).divide(Decimal.from(3), 'truncate').toString();
// '0.6666666666666666666666666666666666'
```

`remainder` is always exact and takes the sign of the dividend.
`power(exponent, mode)` takes an integer exponent of any sign and is correctly
rounded whenever the exact power has up to 200,000 digits — which covers every
base not within a hair of one; past that it carries 50 guard digits. A
fractional exponent throws. Anything to the power zero is one, `NaN` included,
as IEEE 754's `pown` has it:

```ts
Decimal.from('1.1').power(Decimal.from(2)).toString(); // '1.21'
Decimal.from(2).power(Decimal.from(-2)).toString(); // '0.25'
```

`round(places, mode)` rounds to a number of places after the point — negative
for tens, hundreds and so on:

```ts
Decimal.from('2.345').round(2).toString(); // '2.34'
Decimal.from('2.345').round(2, 'halfAwayFromZero').toString(); // '2.35'
Decimal.from('1250').round(-2).toString(); // '1200'
```

### Rounding modes

| Mode                 | Resolves a value between two neighbours to   |
| -------------------- | -------------------------------------------- |
| `'halfEven'`         | the nearest; a tie to the even one — default |
| `'halfAwayFromZero'` | the nearest; a tie to the one further out    |
| `'truncate'`         | the one towards zero                         |
| `'floor'`            | the one towards −∞                           |
| `'ceiling'`          | the one towards +∞                           |

Half to even is the default because it does not drift: rounding every tie the
same way biases a sum, and alternating them by parity does not. The five are
exported as the type `RoundingMode`, and a mode that is not one of them throws a
`RangeError` rather than falling back to a default.

### Operators are refused

```ts
const one = Decimal.from(1);

one + one; // compile error: Operator '+' cannot be applied to types 'Decimal' and 'Decimal'.
`${one}`; // '1' — a template literal is fine
```

An implicit conversion to `number` would lose exactly the digits the type
exists to keep, so it is refused twice: TypeScript rejects the operator at
compile time, and where the types are bypassed — untyped JavaScript, an `any`
— the conversion throws a `TypeError` at runtime. Write `one.add(one)`.

### Special values

Division by zero follows IEEE 754 rather than throwing: a non-zero value over
zero is an infinity, and zero over zero is `NaN`. A result too large for the
format becomes an infinity, or — in a directed mode — stops at the largest
finite value. `NaN` compares as ordered against nothing: `compare` returns
`undefined`, and every comparison method returns `false`. `0` and `-0` are
equal; `isNegative()` tells them apart.

### Getting it out

| Method                                  | Gives                                                           |
| --------------------------------------- | --------------------------------------------------------------- |
| `toString()`                            | the shortest text; exponential outside 10⁻⁶ … 10²¹, as `Number` |
| `toFixed(fractionDigits?, mode?)`       | a fixed number of places, plain notation                        |
| `toPrecision(precision, mode?)`         | a number of significant digits                                  |
| `toExponential(fractionDigits?, mode?)` | exponential notation                                            |
| `toLocaleString(locales?, options?)`    | `Intl.NumberFormat` on the decimal text, with no digit lost     |
| `toJSON()`                              | the text, so `JSON.stringify` writes a string rather than `{}`  |
| `toNumber()`                            | the nearest `number`                                            |
| `toBigInt()`                            | the exact integer; throws on a fraction                         |

## Operators

The JavaScript operators are the language's own, and no type here changes that:
TypeScript has no operator overloading, so `a + b` can only mean what it means
for the primitive underneath. On the types carried by a `number` or a `bigint`
it computes plain, unchecked arithmetic — `a + a` on two `SignedInteger<32>` is
`4000000000`, a `number` — and nothing at runtime can refuse it. On a `Decimal`
it is a type error, and a `TypeError` at runtime.

Every operator has a method that keeps the type and its checks, on the
descriptor for the primitive-backed types and on the value for a `Decimal`:

```ts
const Int32 = SignedInteger(32);
const a = Int32.from(2_000_000_000);

Int32.subtract(a, Int32.from(1)); // SignedInteger<32>
Int32.add(a, a); // RangeError: SignedInteger<32>.add: 4000000000 is outside [-2147483648, 2147483647].

Decimal.from('19.99').multiply(Decimal.from(3)); // Decimal: 59.97
Decimal.from('0.1').add(Decimal.from('0.2')).equals(Decimal.from('0.3')); // true
```

| Instead of                | Write                                                | On                                 |
| ------------------------- | ---------------------------------------------------- | ---------------------------------- |
| `+ - * / % **`, unary `-` | `add`, `subtract`, `multiply`, … `power`, `negate`   | every type                         |
| `++ --`                   | `increment`, `decrement` (`add` one, on a `Decimal`) | every type                         |
| `< <= > >=`               | `lessThan`, `lessThanOrEqual`, …                     | every type                         |
| `=== !==`                 | `equals`, by value                                   | every type                         |
| `& \| ^ ~ << >> >>>`      | `bitwiseAnd`, … `shiftRightLogical`                  | `SignedInteger`, `UnsignedInteger` |

On a `Decimal`, `===` compares the two objects, not their values: compare with
`equals`.

## Layout

Every type except `BigInteger` declares its size and alignment in bytes, for the
memory model that later features build on. `@fulcro/reflect` reads them at
compile time:

```ts
import { alignOf, sizeOf } from '@fulcro/reflect';
import type { Decimal, SignedInteger } from '@fulcro/types';

sizeOf<SignedInteger<32>>(); // 4
alignOf<Decimal>(); // 16
```

| Type                            | Size, alignment |
| ------------------------------- | --------------- |
| 8, 16, 32, 64, 128-bit integers | 1, 2, 4, 8, 16  |
| `HalfPrecisionFloat`            | 2               |
| `SinglePrecisionFloat`          | 4               |
| `DoublePrecisionFloat`          | 8               |
| `Decimal`                       | 16              |

The layout lives in the type and never in a value: a type-only import is
enough for `sizeOf`, and nothing of this package is loaded to answer it. See
[Reflection](./reflect.md#sizeoft-and-alignoft) for how the two meet.

## Structs

A struct is a **value type** with a fixed layout, built from the types above
and from other structs. Like the numeric types, it has a value and a type of
the same name:

```ts
import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';

export const Vector3 = struct('Vector3', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
	z: SinglePrecisionFloat,
});
export type Vector3 = Struct<typeof Vector3>;

const up: Vector3 = Vector3.from({ x: 0, y: 1, z: 0 });
```

`from` converts each field with its own type's `from`, so `0.1` becomes the
nearest single precision value and `256` in an 8-bit field is a `RangeError`
naming the field. A field declared with `BigInteger`, which has no fixed size,
does not compile.

The descriptor's own type is `StructType<TFields>`, for code that works over
any struct, the way `NumericType` is for the numeric types.

### Values, identities and references

| Kind               | What it is                                          | Here                                  |
| ------------------ | --------------------------------------------------- | ------------------------------------- |
| **Value type**     | Defined by its contents; no identity; fixed layout  | the numeric types, and every `struct` |
| **Identity type**  | Defined by which object it is, whatever it contains | ordinary objects and classes          |
| **Reference type** | Points at a value held somewhere else               | `Pointer<T>` and `View<T>`, later     |

So a struct value is frozen, and two of them are compared by their fields —
`Vector3.equals(a, b)` — never by `===`, which still compares the two objects.
Each field compares as its own type does: a `NaN` field makes a value unequal
to itself.

### Methods

A third argument gives every value of the struct its methods, with `this` as
the value:

```ts
export const Vector3 = struct(
	'Vector3',
	{ x: SinglePrecisionFloat, y: SinglePrecisionFloat, z: SinglePrecisionFloat },
	{
		length() {
			return Math.hypot(this.x, this.y, this.z);
		},
		scale(factor: number) {
			return Vector3.from({
				x: this.x * factor,
				y: this.y * factor,
				z: this.z * factor,
			});
		},
	},
);
export type Vector3 = Struct<typeof Vector3>; // includes length() and scale()

Vector3.from({ x: 3, y: 4, z: 0 }).length(); // 5
```

The methods sit on one prototype every value shares, not on each value. They
take no bytes and are not fields: the layout, `equals` and the bytes are what
the fields alone make them, and a value read from bytes has its methods like
one made by `from`. Write them as methods, not arrow functions, so that `this`
is the value.

A value is still frozen, so a method does not change it: it returns a new
value, as `scale` does. A method named like a field, like an array index or
`~layout`, or one that is not a function, is a `TypeError` when the struct is
declared.

For a struct with methods, `is` also checks that the value was made by the
struct: an object with the right fields and nothing else does not carry the
methods, so it is not one. A struct without methods recognises such an object,
as it always has.

A value that crosses a worker boundary or goes through JSON loses its methods:
the structured clone behind `postMessage` does not keep prototypes, so what
arrives is the fields alone. Rebuild it with `Vector3.from(value)` on the other
side.

### Where the fields go

Fields are placed by alignment, largest first, and in declaration order among
equals. Every size is a multiple of its alignment, so no field needs padding in
front of it; only the end of the struct is padded, up to its alignment, so that
the next one in an array starts aligned.

```ts
const Sample = struct('Sample', {
	flag: UnsignedInteger(8), // offset 10
	weight: DoublePrecisionFloat, // offset 0
	count: UnsignedInteger(16), // offset 8
});

Sample.layout.size; // 16: eleven bytes, padded to an alignment of 8
sizeOf<Struct<typeof Sample>>(); // 16, at compile time
```

The fields are not kept in declaration order with padding between them. This
order is the one that makes the size computable by the type checker — which is
what lets `sizeOf` answer at compile time — and that wastes no byte inside the
struct.

`layout` gives the offset, size and alignment of every field at runtime. A
struct nested as a field is laid out inline, as one field of its own size.

### Bytes

A value can be written into a `DataView` and read back, which is how a struct
is held without an object per value — a buffer of a thousand vectors is twelve
thousand bytes:

```ts
const buffer = new ArrayBuffer(Vector3.layout.size * 1000);
const view = new DataView(buffer);

Vector3.write(view, Vector3.layout.size * 7, up);
Vector3.read(view, Vector3.layout.size * 7); // { x: 0, y: 1, z: 0 }
```

Every value is little-endian, whatever the platform. Integers are two's
complement, the floats are IEEE 754 binary16, binary32 and binary64, and
`Decimal` is IEEE 754 decimal128 in its binary integer encoding. Padding bytes
are left as they were. An offset the struct does not fit at is a `RangeError`,
raised before any byte is written.

`read` makes a new object each time: storing a value costs no object, holding
one still does.
