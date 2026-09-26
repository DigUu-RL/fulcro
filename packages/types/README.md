# @fulcro/types

Numeric types with a declared range and layout: fixed-width integers, half,
single and double precision floats, an integer of any size, and a `Decimal` with
the semantics of IEEE 754 decimal128. Nothing to configure: every operation is
a typed method.

```sh
npm install @fulcro/types
```

```ts
import { Decimal, SignedInteger, UnsignedInteger } from '@fulcro/types';

const Int32 = SignedInteger(32);

Int32.add(Int32.from(2), Int32.from(3)); // 5
Int32.add(Int32.maximum, Int32.from(1)); // RangeError: FULCRO6031: … outside [-2147483648, 2147483647]
UnsignedInteger(8).wrap(-1); // 255, when modular arithmetic is what you mean

Decimal.from('0.1').add(Decimal.from('0.2')).toString(); // '0.3'
Decimal.from('19.99').multiply(Decimal.from(3)).toString(); // '59.97'
```

| Type                                         | What it is                                         |
| -------------------------------------------- | -------------------------------------------------- |
| `SignedInteger<N>`, `UnsignedInteger<N>`     | 8 to 128 bits, checked arithmetic, `wrap`          |
| `HalfPrecisionFloat`, `SinglePrecisionFloat` | binary16 and binary32, each operation rounded once |
| `DoublePrecisionFloat`                       | binary64, the `number` named as a choice           |
| `BigInteger`                                 | an integer of any size                             |
| `Decimal`                                    | 34 decimal digits, five rounding modes             |

Each type has a value of the same name that converts, recognises and computes,
and every type but `BigInteger` reports its `minimum` and `maximum`. If you only
need the types, `import type` them and no code is loaded.

The JavaScript operators are the language's own: `a + b` on two
`SignedInteger<32>` is a plain, unchecked `number`, and on a `Decimal` it
throws. Use the methods, which keep the type and its checks.

Every type but `BigInteger` declares a size and alignment, which
`sizeOf<T>()` and `alignOf<T>()` from `@fulcro/reflect` read at compile time.

## Structs

Value types with a fixed layout, built from the types above and from each
other — frozen, compared by field, and stored in a `DataView` without an object
per value:

```ts
import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';

const Vector3 = struct('Vector3', {
	x: SinglePrecisionFloat,
	y: SinglePrecisionFloat,
	z: SinglePrecisionFloat,
});
type Vector3 = Struct<typeof Vector3>;

Vector3.layout.size; // 12, and sizeOf<Vector3>() at compile time
Vector3.write(view, 0, Vector3.from({ x: 0, y: 1, z: 0 }));
```

---

**Full guide:** [docs/types.md](../../docs/types.md) — ranges, rounding, the
special values, the layout table and structs.
🇧🇷 [Leia em português](../../docs/pt-BR/types.md).
