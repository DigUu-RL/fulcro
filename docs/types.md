# Numeric types

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/types.md)

Numbers with a declared range and a declared layout: fixed-width integers, three
binary floating point formats, an integer of any size, and a decimal with the
semantics of IEEE 754 decimal128.

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

No dependencies, and no compiler plugin needed.

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
type: an integer's descriptor is an `IntegerType<T>`, every other one a
`NumericType<T, TSource>` — `TSource` being what its `from` accepts — and
`IntegerWidth` is the union of widths, `8 | 16 | 32 | 64 | 128`.

```ts
import type { NumericType } from '@fulcro/types';

const sum = <T>(
	type: NumericType<T, unknown>,
	values: readonly T[],
	zero: T,
): T => values.reduce((total, value) => type.add(total, value), zero);
```

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

Every operation checks its result, the way a C# `checked` context does:

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

Each descriptor has `from`, `wrap`, `is`, `add`, `subtract`, `multiply`,
`divide`, `remainder`, and `minimum`, `maximum`, `width` and `signed`. Division
truncates towards zero; the remainder takes the sign of the dividend, as `%`
does. Dividing by zero, and dividing a signed minimum by −1, throw.

### Why the operators are not enough

A branded integer is still a `number` or a `bigint`, so the operators work on it
— and their result is a plain `number` again, unchecked:

```ts
const a = Int32.from(2_000_000_000);

a + a; // 4000000000: a number, and no longer a 32-bit integer
Int32.add(a, a); // RangeError — which is the point
```

Use the descriptor's arithmetic wherever the range matters. A
`SignedInteger<8>` is also not a `SignedInteger<32>`, even though every value of
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
a + b; // 0.30000000447034836, a double nobody rounded
```

`from` takes a `number` only. A `bigint` is refused rather than converted,
because turning it into a double first and then into the format rounds twice,
and the second rounding can land on the wrong neighbour.

## `BigInteger`

An integer of any size. It is `bigint` under the name of the concept, since
`bigint` is already exact at every magnitude. The descriptor adds a decimal-only
`from` — `BigInteger.from('0x10')` is refused, not read as 16 — and division
that says which operation divided by zero.

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

`remainder` is always exact and takes the sign of the dividend. `round(places,
mode)` rounds to a number of places after the point — negative for tens,
hundreds and so on:

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
— the conversion throws a `TypeError` at runtime. Use `add`, `compare`,
`equals`, `lessThan`, `greaterThan` and the rest.

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
