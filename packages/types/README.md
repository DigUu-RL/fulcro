# @fulcro/types

Numeric types with a declared range and layout: fixed-width integers, half,
single and double precision floats, an integer of any size, and a `Decimal` with
the semantics of IEEE 754 decimal128 — structs built from them, and matrices,
vectors, fractions, complex numbers and quaternions built over them. Nothing to
configure: every operation is a typed method.

```sh
npm install @fulcro/types
```

```ts
import { Decimal, SignedInteger, UnsignedInteger } from '@fulcro/types';

const Garrison = SignedInteger(32);

Garrison.add(Garrison.from(9_700), Garrison.from(300)); // 10000
Garrison.add(Garrison.maximum, Garrison.from(1)); // RangeError: FULCRO6031: … outside [-2147483648, 2147483647]
UnsignedInteger(8).wrap(-1); // 255, when modular arithmetic is what you mean

Decimal.from('0.1').add(Decimal.from('0.2')).toString(); // '0.3'
Decimal.from('19.99').multiply(Decimal.from(3)).toString(); // '59.97'
```

The Death Star's muster, an astromech's counter rolling over on purpose, and
Watto's bill for three podracer couplings:

```ts
import { Decimal, SignedInteger, UnsignedInteger } from '@fulcro/types';

const Garrison = SignedInteger(32);

const crew = Garrison.from(342_953);
const stormtroopers = Garrison.from(25_984);

console.log(Garrison.add(crew, stormtroopers)); // 368937

try {
	Garrison.add(Garrison.maximum, Garrison.from(1));
} catch (error) {
	console.log(error instanceof RangeError, (error as Error).message.startsWith('FULCRO6031')); // true true
}

const Counter = UnsignedInteger(8);

console.log(Counter.wrap(Counter.maximum + 1)); // 0 — the counter rolls over, because wrap says so

const coupling = Decimal.from('19.99');
const bill = coupling.multiply(Decimal.from(3));

console.log(bill.toString()); // '59.97'
console.log(Decimal.from('0.1').add(Decimal.from('0.2')).toString()); // '0.3' — not 0.30000000000000004
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

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

Starfighter.layout.size; // 12, and sizeOf<Starfighter>() at compile time
Starfighter.write(view, 0, Starfighter.from({ shields: 1, hull: 1, speed: 0.5 }));
```

Rogue Squadron's twelve snowspeeders, held as one buffer of bytes rather than
twelve objects:

```ts
import { SinglePrecisionFloat, struct, type Struct } from '@fulcro/types';

const Starfighter = struct('Starfighter', {
	shields: SinglePrecisionFloat,
	hull: SinglePrecisionFloat,
	speed: SinglePrecisionFloat,
});
type Starfighter = Struct<typeof Starfighter>;

const squadron = new DataView(new ArrayBuffer(Starfighter.layout.size * 12));

const fresh: Starfighter = Starfighter.from({ shields: 1, hull: 1, speed: 0.5 });
const afterTheAtAts = Starfighter.from({ shields: 0, hull: 0.25, speed: 0.5 });

for (let slot = 0; slot < 12; slot++) {
	Starfighter.write(squadron, Starfighter.layout.size * slot, fresh);
}

Starfighter.write(squadron, Starfighter.layout.size * 7, afterTheAtAts); // Rogue Eight

const rogueEight = Starfighter.read(squadron, Starfighter.layout.size * 7);

console.log(Starfighter.layout.size, squadron.byteLength); // 12 144
console.log(rogueEight.hull); // 0.25
console.log(Starfighter.equals(rogueEight, afterTheAtAts)); // true — compared by field
console.log(Object.isFrozen(rogueEight)); // true
```

## Mathematics

`Matrix`, `Vector`, `Fraction`, `ComplexNumber` and `Quaternion`, each built
over any type above and doing its arithmetic through that type's descriptor.
Dimensions are type parameters, and a product whose shapes do not meet does not
compile:

```ts
import { Matrix, SinglePrecisionFloat, Vector } from '@fulcro/types';

const Transform = Matrix(SinglePrecisionFloat, 3, 4);
const Position = Vector(SinglePrecisionFloat, 4, 1);

Transform.multiply(jump, falcon); // Matrix<SinglePrecisionFloat, 3, 1>
Transform.multiply(jump, jump);
// Cannot multiply Matrix<T, 3, 4> by Matrix<T, 3, 4>. Expected a matrix with 4 rows.
```

The Falcon's navicomputer moving the ship five units along the hyperspace lane:

```ts
import { Matrix, SinglePrecisionFloat, Vector } from '@fulcro/types';

// A translation five units along x, written as an affine transform.
const Transform = Matrix(SinglePrecisionFloat, 3, 4);
const Position = Vector(SinglePrecisionFloat, 4, 1);

const jump = Transform.from([
	[1, 0, 0, 5],
	[0, 1, 0, 0],
	[0, 0, 1, 0],
]);

const falcon = Position.from([1, 2, 3, 1]);

const arrived = Transform.multiply(jump, falcon);

console.log([...arrived]); // [6, 2, 3]
console.log([arrived.rows, arrived.columns]); // [3, 1]
```

---

**Full guide:** [docs/types.md](../../docs/types.md) — ranges, rounding, the
special values, the layout table, structs and the mathematics types.
🇧🇷 [Leia em português](../../docs/pt-BR/types.md).
