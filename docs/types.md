# Numeric types

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/types.md)

Numbers with a declared range and a declared layout: fixed-width integers, three
binary floating point formats, an integer of any size, and a decimal with the
semantics of IEEE 754 decimal128 — [structs](#structs), value types built from
them — and the [mathematics](#mathematics) built on all of them: matrices,
vectors, fractions, complex numbers and quaternions.

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
0.1 + 0.2; // 0.30000000000000004 — a bounty in credits, gone wrong
2 ** 53 + 1; // 9007199254740992 — a clone serial number, silently changed
const channel = 70_000; // nothing says a comm channel is 16 bits
```

The first is a decimal fraction stored in binary. The second is an integer
past the 53 bits a double holds exactly. The third is a range nobody wrote down,
so nothing checks it. This package names each of those numbers as what it is,
and checks it where it is made.

The same three numbers, each held by the type it actually is:

```ts
import { BigInteger, Decimal, UnsignedInteger } from '@fulcro/types';

// Credits are decimal by nature.
const bounty = Decimal.from('0.1').add(Decimal.from('0.2'));

console.log(bounty.toString()); // '0.3'

// A serial number past 2 ** 53 stays exact.
const serial = BigInteger.add(BigInteger.from(2n ** 53n), BigInteger.from(1n));

console.log(serial); // 9007199254740993n

// A comm channel is 16 bits, and says so where it is made.
const CommChannel = UnsignedInteger(16);

try {
	CommChannel.from(70_000);
} catch (error) {
	console.log((error as Error).message); // 'FULCRO6031: UnsignedInteger<16>.from: 70000 is outside [0, 65535].'
}
```

## Every type has a value of the same name

A type is erased on the way to JavaScript, so `SignedInteger<32>` alone cannot
check anything. Each type therefore comes with a **descriptor** of the same
name, which converts, recognises and computes:

```ts
const Int32 = SignedInteger(32);

const channel: UnsignedInteger<16> = UnsignedInteger(16).from(1138);
const total: SignedInteger<32> = Int32.add(Int32.from(1), Int32.from(2));
```

The descriptors have types of their own, for code that works over any numeric
type: an integer's descriptor is an `IntegerType<T>`, a float's a
`FloatType<T>` — a `BoundedNumericType<T, number>` that is also stored as bytes
— and `BigInteger`'s a `NumericType<T, TSource>`, `TSource` being what its
`from` accepts. `IntegerWidth` is the union of
widths, `8 | 16 | 32 | 64 | 128`.

```ts
import type { NumericType } from '@fulcro/types';

const sum = <T>(type: NumericType<T, unknown>, values: readonly T[], zero: T): T =>
	values.reduce((total, value) => type.add(total, value), zero);
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

One `sum` for any numeric type — the crews of a fleet in 32-bit integers, and
the shield readings of its fighters in single precision:

```ts
import { type NumericType, SignedInteger, SinglePrecisionFloat } from '@fulcro/types';

const sum = <T>(type: NumericType<T, unknown>, values: readonly T[], zero: T): T => {
	return values.reduce((total, value) => type.add(total, value), zero);
};

const Crew = SignedInteger(32);

const crews = [Crew.from(5_402), Crew.from(4), Crew.from(2)];
const shields = [SinglePrecisionFloat.from(0.5), SinglePrecisionFloat.from(0.25)];

console.log(sum(Crew, crews, Crew.from(0))); // 5408
console.log(sum(SinglePrecisionFloat, shields, SinglePrecisionFloat.from(0))); // 0.75
console.log(Crew.minimum, Crew.maximum); // -2147483648 2147483647
```

If you only want the types — to annotate an interface, say — import them with
`import type` and you take no code at all:

```ts
import type { SignedInteger } from '@fulcro/types';

interface Transmission {
	readonly length: SignedInteger<32>;
}
```

A comm relay's message header, typed with the package's types and taking none
of its code:

```ts
import type { SignedInteger, UnsignedInteger } from '@fulcro/types';

interface Transmission {
	readonly channel: UnsignedInteger<16>;
	readonly length: SignedInteger<32>;
	readonly body: string;
}

// The values arrive already checked, from wherever the relay made them.
const describe = (transmission: Transmission): string => {
	return `channel ${String(transmission.channel)}, ${String(transmission.length)} characters`;
};

console.log(typeof describe); // 'function' — and nothing of @fulcro/types was loaded to define it
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

Byte.from(256); // RangeError: FULCRO6031: UnsignedInteger<8>.from: 256 is outside [0, 255].
Byte.subtract(Byte.from(0), Byte.from(1)); // RangeError
Byte.from(1.5); // RangeError: FULCRO6002: UnsignedInteger<8>.from: expected an integer, received 1.5.
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

An X-wing's torpedo counter, which must refuse to go below empty, beside an
astromech's checksum register, which is meant to wrap:

```ts
import { SignedInteger, UnsignedInteger } from '@fulcro/types';

const Torpedoes = UnsignedInteger(8);

let loaded = Torpedoes.from(2);

loaded = Torpedoes.decrement(loaded);
loaded = Torpedoes.decrement(loaded);

try {
	Torpedoes.decrement(loaded); // Red Five fires a third time
} catch (error) {
	console.log((error as Error).message); // 'FULCRO6031: UnsignedInteger<8>.decrement: -1 is outside [0, 255].'
}

// R2-D2's data-port checksum: an 8-bit register that is supposed to roll over.
const Register = UnsignedInteger(8);

const checksum = [...new TextEncoder().encode('Help me, Obi-Wan Kenobi')].reduce(
	(register, byte) => Register.wrap(register + byte),
	Register.from(0),
);

console.log(checksum); // 172
console.log(SignedInteger(8).wrap(200)); // -56
```

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

A targeting computer that reports to the cockpit in single precision, exactly
as its float32 hardware would — and a sensor that saturates past what half
precision can hold:

```ts
import { HalfPrecisionFloat, SinglePrecisionFloat } from '@fulcro/types';

const rangeToTarget = SinglePrecisionFloat.from(0.1);
const correction = SinglePrecisionFloat.from(0.2);

console.log(SinglePrecisionFloat.add(rangeToTarget, correction)); // 0.30000001192092896
console.log(rangeToTarget + correction); // 0.30000000447034836 — a double nobody rounded

// A thermal sensor recording in half precision.
console.log(HalfPrecisionFloat.from(1_200)); // 1200
console.log(HalfPrecisionFloat.from(65_520)); // Infinity — hotter than the format can say
```

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
const bounty = Decimal.from('19.99');

bounty.multiply(Decimal.from(3)).toString(); // '59.97'
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

The Bounty Hunters' Guild settling a contract in credits: the reward split
three ways, the Guild's cut compounded, and every amount rounded for the
ledger:

```ts
import { Decimal } from '@fulcro/types';

const reward = Decimal.from('100000');
const hunters = Decimal.from(3);

const share = reward.divide(hunters);

console.log(share.toString()); // '33333.33333333333333333333333333333'
console.log(share.round(2).toString()); // '33333.33' — what each hunter is paid
console.log(reward.remainder(Decimal.from(7)).toString()); // '5' — exact, always

// The Guild takes 10 percent, compounded over a two-year contract.
const guildRate = Decimal.from('1.1').power(Decimal.from(2));

console.log(guildRate.toString()); // '1.21'
console.log(reward.multiply(guildRate).toString()); // '121000'

console.log(Decimal.from('2.345').round(2, 'halfAwayFromZero').toString()); // '2.35'
console.log(Decimal.from('12345678901234567890').toString()); // '12345678901234567890' — not a digit lost
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

A credit balance handed to code that slipped past the types:

```ts
import { Decimal } from '@fulcro/types';

const balance = Decimal.from('2000.50');

// Imagine this arrived through an `any` from a droid's untyped firmware.
const untyped = balance as unknown as number;

try {
	console.log(untyped + 1);
} catch (error) {
	console.log(error instanceof TypeError); // true — the conversion is refused at runtime too
}

console.log(`Balance: ${balance} credits`); // 'Balance: 2000.5 credits'
console.log(balance.add(Decimal.from(1)).toString()); // '2001.5'
```

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
Int32.add(a, a); // RangeError: FULCRO6031: SignedInteger<32>.add: 4000000000 is outside [-2147483648, 2147483647].

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

The Imperial census adding up two sectors' stormtroopers — the operator
overflows in silence, the method refuses:

```ts
import { Decimal, SignedInteger } from '@fulcro/types';

const Census = SignedInteger(32);

const outerRim = Census.from(2_000_000_000);
const coreWorlds = Census.from(2_000_000_000);

console.log(outerRim + coreWorlds); // 4000000000 — no longer a SignedInteger<32>, and nothing noticed

try {
	Census.add(outerRim, coreWorlds);
} catch (error) {
	console.log((error as Error).message);
	// 'FULCRO6031: SignedInteger<32>.add: 4000000000 is outside [-2147483648, 2147483647].'
}

console.log(Census.lessThan(coreWorlds, outerRim)); // false

const paid = Decimal.from('0.1').add(Decimal.from('0.2'));

console.log(paid === Decimal.from('0.3'), paid.equals(Decimal.from('0.3'))); // false true
```

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

The layout lives in the type, never in a value: a type-only import is enough
for `sizeOf`, and nothing of this package is loaded to answer it. See
[Reflection](./reflect.md#sizeoft-and-alignoft) for how the two meet. The
descriptor carries the same numbers at runtime too, as `layout`, for the code
that stores values as bytes.

The same sizes, read at compile time from the types and at runtime from the
descriptors, for a Guild ledger entry:

```ts
import { alignOf, sizeOf } from '@fulcro/reflect';
import { Decimal, SignedInteger } from '@fulcro/types';

console.log(sizeOf<SignedInteger<32>>(), SignedInteger(32).layout.size); // 4 4
console.log(alignOf<Decimal>(), Decimal.layout.alignment); // 16 16
```

### Stored as bytes

The descriptor of every type in that table reads and writes a value as bytes,
in a `DataView`, little-endian whatever the platform:

```ts
const Int32 = SignedInteger(32);
const view = new DataView(new ArrayBuffer(Int32.layout.size * 2));

Int32.write(view, Int32.layout.size, Int32.from(-2));
Int32.read(view, Int32.layout.size); // -2
```

The encoding is the one a struct field of the same type uses — two's
complement for the integers, IEEE 754 binary16, binary32 and binary64 for the
floats, decimal128 in its binary integer encoding for `Decimal` — so a value
written alone and the same value inside a struct are the same bytes. That is
what lets [`@fulcro/memory`](./memory.md) store a numeric type with no struct
around it.

The layout also names that encoding at runtime, as `layout.encoding`, in the
words the language uses for its typed arrays:

```ts
SignedInteger(32).layout; // { size: 4, alignment: 4, encoding: 'Int32' }
```

`'Int8'`, `'Uint8'`, `'Int16'`, `'Uint16'`, `'Int32'` and `'Uint32'` for the
integers up to 32 bits, `'BigInt64'` and `'BigUint64'` at 64, and `'Int128'`
and `'Uint128'` on the same pattern at 128; `'Float16'`, `'Float32'` and
`'Float64'` for the floats; `'Decimal128'` for `Decimal`. A struct's layout has
none — its bytes are its fields'. `@fulcro/memory` reads it to hold many values
in the typed array of the same name: see
[Held in a typed array](./memory.md#held-in-a-typed-array).

An offset the value does not fit at is refused before a byte is touched, with
[`FULCRO6018`](./errors/FULCRO6xxx.md#fulcro6018). `write` does not check the
value again: the compiler already refuses a plain `number` where a
`SignedInteger<32>` is expected, and a storage checks it with `is` before it
writes.

The descriptors are typed by contracts the package exports: `IntegerType<T>`
for the integers, `FloatType<T>` for the three floats, and `FixedLayoutType<T>`
— `layout`, `read` and `write` alone, which every type in the table has — for
code that stores any of them:

```ts
import type { FixedLayoutType } from '@fulcro/types';

const zeroed = <T>(type: FixedLayoutType<T>, count: number): DataView => {
	return new DataView(new ArrayBuffer(type.layout.size * count));
};

zeroed(SignedInteger(32), 8); // 32 bytes
zeroed(Decimal, 2); // 32 bytes
```

The Kamino cloning facility's batch record — serial numbers and growth rates
written to bytes and read back, through one function that works for any type
with a fixed layout:

```ts
import { Decimal, type FixedLayoutType, SignedInteger } from '@fulcro/types';

const zeroed = <T>(type: FixedLayoutType<T>, count: number): DataView => {
	return new DataView(new ArrayBuffer(type.layout.size * count));
};

const Serial = SignedInteger(32);
const serials = zeroed(Serial, 3);

Serial.write(serials, Serial.layout.size * 2, Serial.from(7567)); // Captain Rex's number

console.log(Serial.read(serials, Serial.layout.size * 2)); // 7567
console.log(Serial.read(serials, 0)); // 0 — every slot starts at zero
console.log(serials.byteLength, Serial.layout.encoding); // 12 'Int32'

const growthRates = zeroed(Decimal, 2);

Decimal.write(growthRates, Decimal.layout.size, Decimal.from('2.0'));

console.log(Decimal.read(growthRates, Decimal.layout.size).toString()); // '2' — clones age twice as fast
console.log(growthRates.byteLength, Decimal.layout.encoding); // 32 'Decimal128'
```

## Structs

A struct is a **value type** with a fixed layout, built from the types above
and from other structs. Like the numeric types, it has a value and a type of
the same name:

```ts
import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';

export const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
export type Starfighter = Struct<typeof Starfighter>;

const fresh: Starfighter = Starfighter.from({ shields: 1, hull: 1, speed: 0.5 });
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
`Starfighter.equals(a, b)` — never by `===`, which still compares the two
objects. Each field compares as its own type does: a `NaN` field makes a value
unequal to itself. A struct held inside other data — an array of fighters, a
map of squadrons — is compared the same way by handing its descriptor to
[`createEquals`](./functions.md#your-own-rules-createequals) as a rule.

Two status reports of Red Five, made separately and compared as the values
they are:

```ts
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

const fromR2: Starfighter = Starfighter.from({ shields: 0.6, hull: 1, speed: 0.5 });
const fromBase: Starfighter = Starfighter.from({ shields: 0.6, hull: 1, speed: 0.5 });

console.log(fromR2.shields); // 0.6000000238418579 — the nearest single precision value
console.log(fromR2 === fromBase); // false — two objects
console.log(Starfighter.equals(fromR2, fromBase)); // true — the same value
console.log(Object.isFrozen(fromR2)); // true

try {
	(fromR2 as { shields: number }).shields = 1;
} catch (error) {
	console.log(error instanceof TypeError); // true — a value cannot be patched in place
}
```

### Methods

A third argument gives every value of the struct its methods, with `this` as
the value:

```ts
export const Starfighter = struct(
	'Starfighter',
	{ shields: SinglePrecisionFloat, hull: SinglePrecisionFloat, speed: SinglePrecisionFloat },
	{
		integrity() {
			return (this.shields + this.hull) / 2;
		},
		hit(damage: number) {
			return Starfighter.from({
				shields: Math.max(0, this.shields - damage),
				hull: this.shields > damage ? this.hull : Math.max(0, this.hull - (damage - this.shields)),
				speed: this.speed,
			});
		},
	},
);
export type Starfighter = Struct<typeof Starfighter>; // includes integrity() and hit()

Starfighter.from({ shields: 0.5, hull: 1, speed: 0.5 }).integrity(); // 0.75
```

The methods sit on one prototype every value shares, not on each value. They
take no bytes and are not fields: the layout, `equals` and the bytes are what
the fields alone make them, and a value read from bytes has its methods like
one made by `from`. Write them as methods, not arrow functions, so that `this`
is the value.

A value is still frozen, so a method does not change it: it returns a new
value, as `hit` does. A method named like a field, like an array index or
`~layout`, or one that is not a function, is a `TypeError` when the struct is
declared.

For a struct with methods, `is` also checks that the value was made by the
struct: an object with the right fields and nothing else does not carry the
methods, so it is not one. A struct without methods recognises such an object,
as it always has.

A value that crosses a worker boundary or goes through JSON loses its methods:
the structured clone behind `postMessage` does not keep prototypes, so what
arrives is the fields alone. Rebuild it with `Starfighter.from(value)` on the
other side.

Red Five taking fire in the trench, each hit a new value, and a report that
crossed the comm link rebuilt into one:

```ts
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const Starfighter = struct(
	'Starfighter',
	{ shields: SinglePrecisionFloat, hull: SinglePrecisionFloat, speed: SinglePrecisionFloat },
	{
		integrity() {
			return (this.shields + this.hull) / 2;
		},
		hit(damage: number) {
			return Starfighter.from({
				shields: Math.max(0, this.shields - damage),
				hull: this.shields > damage ? this.hull : Math.max(0, this.hull - (damage - this.shields)),
				speed: this.speed,
			});
		},
	},
);
type Starfighter = Struct<typeof Starfighter>;

const redFive: Starfighter = Starfighter.from({ shields: 0.5, hull: 1, speed: 0.5 });
const afterTheTurbolasers = redFive.hit(0.75);

console.log(redFive.integrity()); // 0.75 — unchanged by the hit
console.log(afterTheTurbolasers.shields, afterTheTurbolasers.hull); // 0 0.75
console.log(afterTheTurbolasers.integrity()); // 0.375

// Sent to Yavin as JSON, it arrives as fields alone.
const received: unknown = JSON.parse(JSON.stringify(afterTheTurbolasers));

console.log(Starfighter.is(received)); // false — no methods, so not a Starfighter
console.log(Starfighter.from(received as Starfighter).integrity()); // 0.375 — rebuilt on this side
```

### Where the fields go

Fields are placed by alignment, largest first, and in declaration order among
equals. Every size is a multiple of its alignment, so no field needs padding in
front of it; only the end of the struct is padded, up to its alignment, so that
the next one in an array starts aligned.

```ts
const SensorReading = struct('SensorReading', {
	alert: UnsignedInteger(8), // offset 10
	distance: DoublePrecisionFloat, // offset 0
	contacts: UnsignedInteger(16), // offset 8
});

SensorReading.layout.size; // 16: eleven bytes, padded to an alignment of 8
sizeOf<Struct<typeof SensorReading>>(); // 16, at compile time
```

The fields are not kept in declaration order with padding between them. This
order is the one that makes the size computable by the type checker — which is
what lets `sizeOf` answer at compile time — and that wastes no byte inside the
struct.

`layout` gives the offset, size and alignment of every field at runtime. A
struct nested as a field is laid out inline, as one field of its own size.

The same answers exist at compile time, through
[`@fulcro/reflect`](./reflect.md#offsetoftfield-and-layoutoft), from the type
alone:

```ts
offsetOf<Struct<typeof SensorReading>>('alert'); // 10
layoutOf<Struct<typeof SensorReading>>(); // equal to SensorReading.layout
```

The type of a struct value lists each field's size and alignment on its
`'~layout'`, in declaration order, but not its offset — an offset depends on
that order, which a type does not promise. The transformer places the fields
by the rule above, and a test holds its answer to `layout`'s.

The readings of Echo Base's long-range sensor, laid out at runtime and at
compile time to the same answer:

```ts
import { layoutOf, offsetOf, sizeOf } from '@fulcro/reflect';
import { DoublePrecisionFloat, type Struct, struct, UnsignedInteger } from '@fulcro/types';

const SensorReading = struct('SensorReading', {
	alert: UnsignedInteger(8),
	distance: DoublePrecisionFloat,
	contacts: UnsignedInteger(16),
});
type SensorReading = Struct<typeof SensorReading>;

console.log(SensorReading.layout.fields.distance.offset); // 0
console.log(SensorReading.layout.fields.contacts.offset); // 8
console.log(SensorReading.layout.fields.alert.offset); // 10
console.log(SensorReading.layout.size); // 16

console.log(sizeOf<SensorReading>()); // 16 — from the type alone
console.log(offsetOf<SensorReading>('alert')); // 10
console.log(layoutOf<SensorReading>().size === SensorReading.layout.size); // true
```

The descriptor also keeps the type of each field, as `fields`, apart from
`layout`, which says only where the bytes are and stays the object
`layoutOf<T>()` reports. It is the object the struct was declared with, copied
and frozen, so `SensorReading.fields.distance === DoublePrecisionFloat`. What
reads one field on its own needs the type of that field: a
[storage held one field at a time](./memory.md#laid-out-one-field-at-a-time)
and the view of one field find it here.

```ts
import { DoublePrecisionFloat, struct, UnsignedInteger } from '@fulcro/types';

const SensorReading = struct('SensorReading', {
	alert: UnsignedInteger(8),
	distance: DoublePrecisionFloat,
	contacts: UnsignedInteger(16),
});

console.log(SensorReading.fields.distance === DoublePrecisionFloat); // true
console.log(Object.keys(SensorReading.fields)); // ['alert', 'distance', 'contacts'] — as declared
console.log(SensorReading.fields.alert.layout.size); // 1
```

### Bytes

A value can be written into a `DataView` and read back, which is how a struct
is held without an object per value — a buffer of a thousand fighters is twelve
thousand bytes:

```ts
const buffer = new ArrayBuffer(Starfighter.layout.size * 1000);
const view = new DataView(buffer);

Starfighter.write(view, Starfighter.layout.size * 7, fresh);
Starfighter.read(view, Starfighter.layout.size * 7); // { shields: 1, hull: 1, speed: 0.5 }
```

Every value is little-endian, whatever the platform. Integers are two's
complement, the floats are IEEE 754 binary16, binary32 and binary64, and
`Decimal` is IEEE 754 decimal128 in its binary integer encoding. Padding bytes
are left as they were. An offset the struct does not fit at is a `RangeError`,
raised before any byte is written.

`read` makes a new object each time: storing a value costs no object, holding
one still does.

The status of every fighter in a thousand-ship fleet, held as bytes rather than
as a thousand objects:

```ts
import { SinglePrecisionFloat, type Struct, struct } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

const fleet = new DataView(new ArrayBuffer(Starfighter.layout.size * 1_000));

Starfighter.write(
	fleet,
	Starfighter.layout.size * 7,
	Starfighter.from({ shields: 1, hull: 1, speed: 0.5 }),
);

const seventh = Starfighter.read(fleet, Starfighter.layout.size * 7);
const untouched = Starfighter.read(fleet, Starfighter.layout.size * 8);

console.log(fleet.byteLength); // 12000
console.log(seventh); // { shields: 1, hull: 1, speed: 0.5 }
console.log(untouched); // { shields: 0, hull: 0, speed: 0 } — zeroed until written

try {
	Starfighter.read(fleet, fleet.byteLength - 4);
} catch (error) {
	console.log(error instanceof RangeError); // true — refused before a byte is read
}
```

## Mathematics

```ts
import { ComplexNumber, Fraction, Matrix, Quaternion, Vector } from '@fulcro/types';
```

Five types built over the numeric ones, each declared the same way — a function
taking the type its components are made of — and each doing its arithmetic
through that type's own descriptor. A matrix of `SignedInteger(8)` throws where
an element would leave its range; one of `SinglePrecisionFloat` rounds each
product and sum as that type does; one of `Decimal` is exact where a double is
not:

```ts
const Credits = Matrix(Decimal, 1, 2);

Credits.add(Credits.from([[0.1, 0.2]]), Credits.from([[0.2, 0.1]])).map(String);
// ['0.3', '0.3']
```

The component type can be any numeric type of this package — `BigInteger`
and `Decimal` included — or a `Fraction`, a `ComplexNumber` or a `Quaternion`,
so a matrix of complex numbers is a matrix like any other. When the component
type declares a layout, so does the type built on it, its components end to
end; it can then be the field of a [struct](#structs), and
[`sizeOf`](./reflect.md#sizeoft-and-alignoft) reads it from the type.

Two cantinas' takings, in credits and in a ledger of decimals, added without a
fraction of a credit lost:

```ts
import { Decimal, Matrix } from '@fulcro/types';

// One row: the sabacc table and the bar.
const Takings = Matrix(Decimal, 1, 2);

const mosEisley = Takings.from([[0.1, 0.2]]);
const cantoBight = Takings.from([[0.2, 0.1]]);

console.log(Takings.add(mosEisley, cantoBight).map(String)); // ['0.3', '0.3']
console.log([0.1 + 0.2, 0.2 + 0.1]); // [0.30000000000000004, 0.30000000000000004] — what plain numbers make of it
```

### Matrices and vectors

```ts
const Transform = Matrix(SinglePrecisionFloat, 3, 4);
const Point = Vector(SinglePrecisionFloat, 4, 1);

const jump = Transform.from([
	[1, 0, 0, 5],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
]);
const falcon = Point.from([1, 2, 3, 1]);

Transform.multiply(jump, falcon); // [6, 2, 3] — a Matrix<SinglePrecisionFloat, 3, 1>
```

The dimensions are type parameters, never part of a name: there is no
`Matrix3x4` and no `Vector3D`. A vector is a matrix with one row or one column,
and `Vector<T, 4, 1>` is the same type as `Matrix<T, 4, 1>`, so a vector goes
wherever the matrix of its shape goes.

Shapes are checked by the compiler, with no plugin:

```ts
Transform.multiply(jump, jump);
// Cannot multiply Matrix<T, 3, 4> by Matrix<T, 3, 4>. Expected a matrix with 4 rows.

Transform.identity(); // error: only a square matrix has one
Vector(SinglePrecisionFloat, 2, 3); // error: a vector has one row or one column
```

The same checks run at runtime for a caller that got past the compiler — with
`as never`, say — and throw the same sentences
([FULCRO6037](./errors/FULCRO6xxx.md#fulcro6037) and its neighbours).

A value is a frozen array of its elements, row after row, so it indexes,
spreads and serialises as the numbers it holds; `rows` and `columns` sit on it
without being listed:

```ts
jump[3]; // 5 — row 0, column 3
[jump.rows, jump.columns]; // [3, 4]
JSON.stringify(falcon); // '[1,2,3,1]'
```

| Operation               | What it does                                       |
| ----------------------- | -------------------------------------------------- |
| `from(rows)`            | makes a matrix from its rows; a vector from a list |
| `is`, `equals`          | recognise and compare, element by element          |
| `add`, `subtract`       | element by element, same shape                     |
| `negate`, `scale`       | every element, or every element times a value      |
| `multiply(left, right)` | the matrix product, R × C by C × K into R × K      |
| `transpose(value)`      | rows and columns swapped                           |
| `identity()`            | a square matrix's identity, built once and shared  |
| `dot(left, right)`      | a vector's dot product, of the element type        |

A product of an R × C matrix by a C × K one asks the element type for exactly
R·C·K multiplications and R·(C−1)·K additions — no zero converted to start a
sum, nothing computed twice — and the performance suite counts them.

The Falcon's navicomputer moving the ship five units along the hyperspace lane,
and checking how directly two headings agree:

```ts
import { Matrix, SinglePrecisionFloat, Vector } from '@fulcro/types';

// A translation five units along x, written as an affine transform.
const Transform = Matrix(SinglePrecisionFloat, 3, 4);
const Position = Vector(SinglePrecisionFloat, 4, 1);
const Heading = Vector(SinglePrecisionFloat, 3, 1);

const jump = Transform.from([
	[1, 0, 0, 5],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
]);

const falcon = Position.from([1, 2, 3, 1]);

const arrived = Transform.multiply(jump, falcon);

console.log([...arrived]); // [6, 2, 3]
console.log([arrived.rows, arrived.columns]); // [3, 1]
console.log(jump[3], JSON.stringify(falcon)); // 5 '[1,2,3,1]'

const toKessel = Heading.from([1, 0, 0]);
const toTheMaw = Heading.from([0, 1, 0]);

console.log(Heading.dot(toKessel, toTheMaw)); // 0 — the two courses are at right angles
console.log([...Transform.transpose(jump)].length); // 12
```

### Fractions

```ts
const Spoils = Fraction(SignedInteger(32));
const third = Spoils.from({ numerator: 1, denominator: 3 });

Spoils.add(third, third); // { numerator: 2, denominator: 3 }
Spoils.from({ numerator: 6, denominator: -4 }); // { numerator: -3, denominator: 2 }
Spoils.lessThan(third, Spoils.from(0)); // false
```

An exact rational over an integer type: `SignedInteger(n)`,
`UnsignedInteger(n)` or `BigInteger`. Always in lowest terms with a positive
denominator, so two fractions are equal exactly when their parts are. A
fraction is a full numeric type — the same `add`, `divide`, `power`,
`lessThan` and the rest as the types above — so it can be the element of a
matrix too.

Every operation is exact; what can fail is the integer type underneath. Common
factors are cancelled before multiplying, so an intermediate stays as small as
the result allows, but one outside the integer's range still throws its
`RangeError`. Over `BigInteger` nothing overflows. `power` takes a whole
exponent, since a fractional power of a rational is rarely rational.

A smuggling crew splitting a haul of coaxium — exact shares, whatever the
denominators:

```ts
import { Fraction, SignedInteger } from '@fulcro/types';

const Share = Fraction(SignedInteger(32));

const han = Share.from({ numerator: 1, denominator: 2 });
const chewie = Share.from({ numerator: 1, denominator: 3 });
const lando = Share.subtract(Share.subtract(Share.from(1), han), chewie);

console.log(lando); // { numerator: 1, denominator: 6 }
console.log(Share.add(han, chewie)); // { numerator: 5, denominator: 6 }
console.log(Share.from({ numerator: 6, denominator: -4 })); // { numerator: -3, denominator: 2 }
console.log(Share.greaterThan(han, chewie)); // true — Han takes the larger share, as ever
```

### Complex numbers and quaternions

```ts
const Complex = ComplexNumber(DoublePrecisionFloat);
const i = Complex.from({ real: 0, imaginary: 1 });

Complex.multiply(i, i); // { real: -1, imaginary: 0 }
Complex.from(2); // { real: 2, imaginary: 0 }

const Rotation = Quaternion(DoublePrecisionFloat);
const qi = Rotation.from({ w: 0, x: 1, y: 0, z: 0 });
const qj = Rotation.from({ w: 0, x: 0, y: 1, z: 0 });

Rotation.multiply(qi, qj); // { w: 0, x: 0, y: 0, z: 1 } — k
Rotation.multiply(qj, qi); // { w: 0, x: 0, y: 0, z: -1 } — the order matters
```

The two share everything but their product: `add`, `subtract`, `negate`,
`scale`, `conjugate` — which negates every imaginary part — and `divide`, which
multiplies by the divisor's conjugate over its squared norm. There is no
`lessThan`: neither has an order that agrees with its arithmetic. Dividing by
zero does what the component type's division does — `NaN` for a float, an
error for an integer.

An X-wing rolling into the trench: two quarter turns about different axes,
applied in either order, and a deflector shield's phase as a complex number:

```ts
import { ComplexNumber, DoublePrecisionFloat, Quaternion } from '@fulcro/types';

const Rotation = Quaternion(DoublePrecisionFloat);

// The unit quaternions i and j: half turns about the x and y axes.
const roll = Rotation.from({ w: 0, x: 1, y: 0, z: 0 });
const pitch = Rotation.from({ w: 0, x: 0, y: 1, z: 0 });

console.log(Rotation.multiply(roll, pitch)); // { w: 0, x: 0, y: 0, z: 1 }
console.log(Rotation.multiply(pitch, roll)); // { w: 0, x: 0, y: 0, z: -1 } — the order of manoeuvres matters
console.log(Rotation.conjugate(roll)); // { w: 0, x: -1, y: -0, z: -0 }

const Phase = ComplexNumber(DoublePrecisionFloat);
const quarterTurn = Phase.from({ real: 0, imaginary: 1 });

console.log(Phase.multiply(quarterTurn, quarterTurn)); // { real: -1, imaginary: 0 } — two quarter turns invert the shield
console.log(Phase.from(2)); // { real: 2, imaginary: 0 }
```
