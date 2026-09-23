# @fulcro/types

Numeric types with a declared range and layout: fixed-width integers, half,
single and double precision floats, an integer of any size, and a `Decimal` with
the semantics of IEEE 754 decimal128 — with the JavaScript operators working on
every one of them once the plugin is wired up.

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

Each type has a value of the same name that converts, recognises and computes,
and every type but `BigInteger` reports its `minimum` and `maximum`. If you only
need the types, `import type` them and no code is loaded.

## Operators

With the plugin, the operators mean what the type means — checked on an
integer, rounded on a float, decimal128 on a `Decimal` — and the result keeps
its type. Both operands have to be the same type, or it is a type error at the
line:

```ts
const total = price * Decimal.from(3); // Decimal
count++; // SignedInteger<32>.increment, checked
a + 1; // type error: 'number' is not 'SignedInteger<32>'
```

| Tool       | Wire in                                                                                  |
| ---------- | ---------------------------------------------------------------------------------------- |
| `tsc`      | `{ "transform": "@fulcro/types/transformer", "transformProgram": true }`, via `ts-patch` |
| A bundler  | `vite` (or `rollup`, `webpack`, `esbuild`, …) from `@fulcro/types/unplugin`              |
| The editor | `{ "name": "@fulcro/types/language-service" }` in the tsconfig `plugins`                 |

Without it, the operators are the language's own: unchecked on the
`number`-backed types, refused on a `Decimal`.

Every type but `BigInteger` declares a size and alignment, which
`sizeOf<T>()` and `alignOf<T>()` from `@fulcro/reflect` read at compile time.

---

**Full guide:** [docs/types.md](../../docs/types.md) — ranges, rounding, the
operators, the special values and the layout table.
🇧🇷 [Leia em português](../../docs/pt-BR/types.md).
