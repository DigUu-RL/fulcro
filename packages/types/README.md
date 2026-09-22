# @fulcro/types

Numeric types with a declared range and layout: fixed-width integers, half,
single and double precision floats, an integer of any size, and a `Decimal` with
the semantics of IEEE 754 decimal128. No dependencies, no compiler plugin.

```sh
npm install @fulcro/types
```

```ts
import { Decimal, SignedInteger, UnsignedInteger } from '@fulcro/types';

const Int32 = SignedInteger(32);

Int32.add(Int32.from(2), Int32.from(3)); // 5
Int32.add(Int32.maximum, Int32.from(1)); // RangeError: outside [-2147483648, 2147483647]
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

Each type has a value of the same name that converts, recognises and computes.
If you only need the types, `import type` them and no code is loaded.

Every type but `BigInteger` declares a size and alignment, which
`sizeOf<T>()` and `alignOf<T>()` from `@fulcro/reflect` read at compile time.

---

**Full guide:** [docs/types.md](../../docs/types.md) — ranges, rounding, the
special values and the layout table.
🇧🇷 [Leia em português](../../docs/pt-BR/types.md).
