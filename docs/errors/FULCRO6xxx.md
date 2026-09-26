# FULCRO6xxx — `@fulcro/types`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO6xxx.md)

The errors of the [numeric types and structs](../types.md). Back to
[all codes](../errors.md).

A numeric type refuses a value it cannot hold exactly, rather than rounding,
wrapping or truncating it on your behalf. Where silently fitting the value is
what you want, each type says so by name: `wrap()` on an integer, a rounding
mode on a `Decimal`.

The messages start with the operation that refused — `SignedInteger<8>.add`,
`Decimal.round`, `Vector3.from` — so the name of the type is always in front of
you.

## FULCRO6001

```text
RangeError: FULCRO6001: SignedInteger<32>.divide: division by zero.
```

`divide()` or `remainder()` of an integer type or of `BigInteger` was given a
divisor of zero. An integer has no infinity to answer with.

## FULCRO6002

```text
RangeError: FULCRO6002: SignedInteger<32>.from: expected an integer, received 1.5.
```

A conversion to an integer was handed a number with a fractional part, or one
that is not finite: `from()` or `wrap()` of an integer type,
`BigInteger.from()`, or `Decimal.toBigInt()` of a decimal that is not whole.

Round the value first, deciding how, and convert the result.

## FULCRO6003

```text
SyntaxError: FULCRO6003: BigInteger.from: expected decimal digits with an optional sign, received "0x10".
```

`BigInteger.from()` was given a string that is not decimal digits. Hexadecimal,
exponents, separators and surrounding spaces are all refused, so that nobody is
surprised by what a string meant.

## FULCRO6004

```text
TypeError: FULCRO6004: BigInteger.from: expected a number, a bigint or a string, received object.
```

`BigInteger.from()` was given a value of a kind it does not convert.

## FULCRO6005

```text
RangeError: FULCRO6005: SignedInteger<32>.power: expected an exponent of zero or more, received -1.
```

`power()` of an integer type or of `BigInteger` was given a negative exponent,
whose result is a fraction no integer can hold.

## FULCRO6006

```text
TypeError: FULCRO6006: SinglePrecisionFloat.from: expected a number, received string.
```

`from()` of `HalfPrecisionFloat`, `SinglePrecisionFloat` or
`DoublePrecisionFloat` was given something other than a number. A string is
refused rather than parsed, because parsing it and then rounding to the format
can land on the wrong neighbour.

## FULCRO6007

```text
RangeError: FULCRO6007: Decimal.round: expected a rounding mode of ceiling, floor, truncate, halfEven, halfAwayFromZero, received "nearest".
```

A `Decimal` operation was given a rounding mode that is not one of the five it
knows.

## FULCRO6008

```text
TypeError: FULCRO6008: struct Point: expected an object of methods, received null.
```

The third argument of `struct()` was given, and is not an object.

## FULCRO6009

```text
TypeError: FULCRO6009: struct Point: method 'x' has the name of a field; a value could not hold both.
```

A method of a `struct()` has the same name as one of its fields. Rename one of
them.

## FULCRO6010

```text
TypeError: FULCRO6010: struct Point: '0' cannot name a method; …
```

A method of a `struct()` is named like an array index, or `~layout`. An index
would be moved ahead of every other key by the language, and `~layout` is the
name the layout itself is declared under.

## FULCRO6011

```text
TypeError: FULCRO6011: struct Point: method 'length' must be a function, received number.
```

An entry of the methods object of a `struct()` is not a function.

## FULCRO6012

```text
TypeError: FULCRO6012: struct: expected a name, received undefined.
```

`struct()` was called without a name, or with an empty one. The name is what
every message about the struct starts with.

## FULCRO6013

```text
TypeError: FULCRO6013: struct Point: expected an object of fields, received undefined.
```

The second argument of `struct()` is not an object.

## FULCRO6014

```text
TypeError: FULCRO6014: struct Empty: expected at least one field.
```

`struct()` was given no fields. A struct with nothing in it has no layout to
declare.

## FULCRO6015

```text
TypeError: FULCRO6015: struct Point: '0' cannot name a field; …
```

A field of a `struct()` is named like an array index, or `~layout`. An index
would be reordered ahead of the other fields — and the order of the fields is
the layout.

## FULCRO6016

```text
TypeError: FULCRO6016: struct Account: field 'balance' has no fixed layout. …
```

A field of a `struct()` was declared with a type that has no fixed size:
`BigInteger`, or something that is not a numeric type at all. Declare it with a
fixed-width numeric type, or with another struct.

## FULCRO6017

```text
TypeError: FULCRO6017: Vector3.write: expected a DataView, received object.
```

`read()` or `write()` of a struct was given something other than a `DataView`.
Wrap the buffer: `new DataView(buffer)`.

## FULCRO6018

```text
RangeError: FULCRO6018: Vector3.write: 12 bytes at offset 4 do not fit in a view of 12 bytes.
```

`read()` or `write()` of a struct was given an offset that is negative, not a
whole number, or too close to the end for the struct's `layout.size` bytes. The
view is left untouched.

## FULCRO6019

```text
TypeError: FULCRO6019: Vector3.from: expected an object, received null.
```

`from()` of a struct was given something other than an object.

## FULCRO6020

```text
TypeError: FULCRO6020: Vector3.from: 'w' is not a field; the fields are x, y, z.
```

`from()` of a struct was given a property the struct does not declare. It is
refused rather than dropped, so that a misspelt field is not silently lost.

## FULCRO6021

```text
TypeError: FULCRO6021: Vector3.from: missing field 'z'.
```

`from()` of a struct was not given one of its fields. Every field is required;
there is no default to fill in.

## FULCRO6022

```text
RangeError: FULCRO6022: Decimal.toFixed: expected an integer from 0 to 100, received -1.
```

`toFixed()`, `toPrecision()` or `toExponential()` of a `Decimal` was given a
number of digits outside the range the matching `Number` method accepts.

## FULCRO6023

```text
SyntaxError: FULCRO6023: Decimal.from: expected a decimal literal, received "1.2.3".
```

`Decimal.from()` was given a string that is not a decimal number.

## FULCRO6024

```text
TypeError: FULCRO6024: Decimal.from: expected a Decimal, a string, a number or a bigint, received object.
```

`Decimal.from()` was given a value of a kind it does not convert.

## FULCRO6025

```text
RangeError: FULCRO6025: Decimal.power: expected an integer exponent, received 0.5.
```

`power()` of a `Decimal` was given an exponent that is not a whole number, or is
not finite.

## FULCRO6026

```text
RangeError: FULCRO6026: Decimal.round: expected an integer number of places, received 1.5.
```

`round(places)` of a `Decimal` was given a number of places that is not a safe
whole number.

## FULCRO6027

```text
TypeError: FULCRO6027: Decimal cannot be converted to a primitive implicitly: …
```

A `Decimal` was used with an operator — `+`, `<`, a template literal's
arithmetic — which would first turn it into a binary floating point number and
lose the digits it exists to keep.

Use its methods: `add()`, `compare()`, `toString()`.

## FULCRO6028

```text
TypeError: FULCRO6028: SignedInteger<32>.from: expected a number or a bigint, received string.
```

`from()` or `wrap()` of an integer type was given something other than a
`number` or a `bigint`.

## FULCRO6029

```text
RangeError: FULCRO6029: SignedInteger<32>.shiftLeft: expected a count from 0 to 31, received 32.
```

A shift of an integer type was given a count outside the width of the type.

## FULCRO6030

```text
RangeError: FULCRO6030: SignedInteger: expected a width of 8, 16, 32, 64, 128 bits, received 12.
```

`SignedInteger(width)` or `UnsignedInteger(width)` was asked for a width it
does not provide. The message lists the widths that exist.

## FULCRO6031

```text
RangeError: FULCRO6031: SignedInteger<8>.add: 200 is outside [-128, 127].
```

An integer operation produced — or was handed — a value outside the range of
the type: `from()`, `add()`, `subtract()`, `multiply()`, `divide()`,
`remainder()`, `negate()`, `increment()`, `decrement()` or `power()`.

Use `wrap()` where the two's complement wrap-around is what you mean, or a
wider type where it is not.

## FULCRO6032

```text
RangeError: FULCRO6032: SignedInteger<64>.power: 3n ** 200n is outside [-9223372036854775808, 9223372036854775807].
```

`power()` of a 64- or 128-bit integer type would produce a result outside its
range. It is refused before the result is computed, which for a large exponent
would itself be expensive.
