# Control flow as values: `switchFor`, `tryCatch`, `Result`, `Option` and `equals`

🇧🇷 Português (Brasil): [Leia esta documentação em português](./pt-BR/functions.md)

Helpers that turn statements into expressions, two types that turn failure and
absence into values, and a comparison of two values by what they hold. No
dependencies, no compiler involvement, nothing to configure.

```sh
npm install @fulcro/functions
```

```ts
import {
	createEquals,
	type EqualityRule,
	equals,
	failure,
	none,
	type Option,
	optionOf,
	type Result,
	some,
	success,
	switchFor,
	tryCatch,
} from '@fulcro/functions';
```

## `switchFor`

### The exhaustive form — enums and literal unions

Pass one branch per member, and **the compiler enforces that every member has
one**:

```ts
enum Status {
	Draft,
	Published,
	Archived,
}

const label = switchFor(status, {
	[Status.Draft]: () => 'draft',
	[Status.Published]: () => 'published',
	[Status.Archived]: () => 'archived',
});
```

Leave one out and it does not compile:

```text
error TS2345: Property '[Status.Archived]' is missing in type
'{ 0: () => string; 1: () => string; }' but required in type
'ExhaustiveCases<Status, string>'.
```

**That error is the entire point.** Add a member to the enum six months from now
and every `switchFor` over it stops compiling until the new case is handled —
which is the moment to decide what it should do, rather than finding out in
production. A native `switch` says nothing; it just falls through.

There is deliberately **no fallback** in this form. A fallback is precisely what
would absorb the new member in silence and take the guarantee away.

Each branch receives the single member it handles, already narrowed:

```ts
switchFor(status, {
	[Status.Draft]: (value) => {
		const draft: Status.Draft = value; // not Status
		return render(draft);
	},
	// …
});
```

Works with numeric enums, string enums, and unions of string or number literals:

```ts
const icon = switchFor(theme, {
	dark: () => '🌙',
	light: () => '☀️',
});
```

A member whose value is `0` dispatches like any other — the branch is found by
key, never by testing the value for truthiness.

### Running it for its effects

There is no separate void-returning function, and none is needed:

```ts
switchFor(status, {
	[Status.Draft]: () => saveDraft(),
	[Status.Published]: () => publish(),
	[Status.Archived]: () => archive(),
});
```

The exhaustiveness check applies here exactly as it does to a call whose result
is read.

### The predicate form — everything else

Where branches are conditions rather than values:

```ts
const size = switchFor(
	order,
	[
		{ when: (o) => o.total > 1000, then: () => 'large' },
		{ when: (o) => o.items.length === 0, then: () => 'empty' },
	],
	() => 'standard',
);
```

Branches are tested in order, the first match wins, and the rest are never
evaluated — neither their conditions nor their bodies.

`otherwise` is optional, and leaving it out shows up in the type rather than
being hidden:

```ts
const a = switchFor(n, cases); // string | undefined
const b = switchFor(n, cases, () => 'fallback'); // string
```

This form **cannot** be exhaustive. A condition is an arbitrary function, and the
compiler cannot reason about which values it accepts — which is why it takes a
fallback and the exhaustive form does not.

### Why bother

Because the alternative is a nested ternary or a mutable `let`:

```ts
// What it replaces.
let label: string;

switch (status) {
	case Status.Draft:
		label = 'draft';
		break;
	// …forget a case and nothing complains
}
```

A native `switch` is a statement, so it cannot initialise a `const`, cannot be
the body of an arrow function, and cannot sit inside an object literal or a JSX
attribute. `switchFor` can.

## `Result`

The outcome of an operation, as a value: either a **success** carrying the
value it produced, or a **failure** carrying the error it failed with.

```ts
const parsed: Result<number, string> = Number.isNaN(n) ? failure('not a number') : success(n);
```

|           | `value` | `error`          |
| --------- | ------- | ---------------- |
| `Success` | `T`     | `null`           |
| `Failure` | `null`  | `NonNullable<E>` |

### Handle both variants with `handle`

```ts
const message = parsed.handle({
	success: (value) => `got ${value}`,
	failure: (error) => `failed: ${error}`,
});
```

Both branches are required, and **leaving one out does not compile**:

```text
Property 'failure' is missing in type '{ success: (value: number) => string; }'
but required in type 'ResultCases<number, string, unknown>'.
```

Only the branch for the variant at hand runs. Naming a third branch does not
compile either.

### Or narrow first

```ts
if (parsed.isSuccess()) {
	parsed.value; // number, not number | null
}

if (parsed.isFailure()) {
	parsed.error; // string
}
```

`error === null` narrows the same way, and it is the check to reach for on a
result that has been copied — through `structuredClone`, across a worker, or
through JSON. A copy keeps the data of a result, but not the methods it
inherits.

### Discriminate on the variant, never on `value`

`0`, `''` and `null` are perfectly good values, and `if (result.value)` reports
every one of them as a failure. `isSuccess()`, `isFailure()` and
`error === null` have no such trap.

A failure's error is never `null` or `undefined` — `failure(null)` does not
compile — because a failure whose error is `null` would read as a success.

## `tryCatch`

Runs an operation and returns its outcome as a [`Result`](#result), instead of
throwing:

```ts
const result = await tryCatch(() => fetch(url));

if (result.isFailure()) return fallback;

use(result.value);
```

### Prefer the callback form

```ts
await tryCatch(() => risky()); // ✓ catches everything
await tryCatch(risky()); // ✗ misses a synchronous throw
```

In the second form, `risky` runs **before** `tryCatch` does, so anything it
throws on its way to producing a promise escapes entirely. The callback form
moves that call inside the `try`, which is the only way to cover both the
synchronous and the asynchronous failure of one operation.

The promise form is still accepted, and reads better when the promise is already
in hand.

### `E` defaults to `unknown`, not `Error`

JavaScript lets any value be thrown. Typing the error as an `Error` would be a
claim the function cannot keep — `result.error.message` would read `undefined`
whenever something threw a string. So narrow at the use site, or name the type
when you own every throw site:

```ts
const result = await tryCatch<User, ApiError>(() => api.load(id));
```

A thrown `null` or `undefined` — legal, however pathological — is wrapped in an
`Error` carrying the original as its `cause`
([`FULCRO2001`](./errors/FULCRO2xxx.md#fulcro2001)), because storing it as it
came would make the failure indistinguishable from a success.

### Where you actually use it

```ts
// Several independent things, where one failing should not stop the rest.
const [user, orders, settings] = await Promise.all([
	tryCatch(() => loadUser(id)),
	tryCatch(() => loadOrders(id)),
	tryCatch(() => loadSettings(id)),
]);

render({
	user: user.value,
	orders: orders.handle({ success: (list) => list, failure: () => [] }),
});
```

```ts
// A boundary where a throw would be worse than a value.
const parsed = await tryCatch(async () => JSON.parse(body));

if (parsed.isFailure()) return reply.status(400).send('bad json');
```

### Collecting failures across a batch

It composes with the other packages rather than needing a mode of its own:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
import { SequenceCollection } from '@fulcro/collections';
import { tryCatch } from '@fulcro/functions';

const outcomes = await AsyncSequenceCollection.from(ids)
	.selectAwait((id) => tryCatch(() => loadUser(id)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition((outcome) =>
	outcome.isSuccess(),
);
```

Every element is attempted, nothing stops early, and you get both halves.

`tryCatch` always returns a promise, including for a fully synchronous
operation.

## `Option`

A value that may be absent, as a value of its own rather than as `null`:
either **some** value, or **none**.

```ts
const port: Option<number> = some(8080);
const nothing: Option<number> = none();
```

Most options come from a value that may be `null` or `undefined`, and
`optionOf` turns one into the other:

```ts
const user: Option<User> = optionOf(users.get(id));
```

Only `null` and `undefined` are absent. `0`, `''` and `false` are present —
each is a value somebody meant.

### Handle a present and an absent value with `handle`

```ts
const greeting = user.handle({
	some: (found) => `Hello, ${found.name}`,
	none: () => 'Hello, stranger',
});
```

As with `Result`, both branches are required and leaving one out does not
compile. Only the branch for the variant at hand runs.

### Or narrow to the present value

```ts
if (user.isSome()) {
	user.value; // User, not User | null
}
```

### `some(null)` is not `none()`

`some(null)` is a present value that happens to be `null`, and it has exactly
the same data as `none()`. Only the variant tells them apart, so `isSome()` and
`isNone()` are the check — `value` is not. `some` keeps whatever it is given;
reading `null` as absent is `optionOf`'s job.

## `equals`

Tells whether two values hold the same thing — two objects with the same keys
and equal values, two arrays with equal elements — where `===` only tells
whether they are the same object.

```ts
equals({ id: 1, tags: ['a'] }, { id: 1, tags: ['a'] }); // true
equals([1, 2, 3], [1, 3, 2]); // false
```

`right` takes its type from `left`, so two values that could never be equal do
not compile: `equals(1, 'one')` is refused.

### What is compared by contents, and what by identity

A value always equals itself. Two distinct values are compared by what they
hold when they are of a kind defined by its contents, and are unequal
otherwise:

| Values                                                                     | Equal when                                                              |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Primitives                                                                 | They are the same value; `NaN` equals `NaN`, `0` equals `-0`            |
| Objects of different prototypes                                            | Never                                                                   |
| Plain objects, with or without a prototype                                 | They have the same own enumerable keys, in any order, with equal values |
| Arrays                                                                     | They are as long, with equal elements; a hole reads as `undefined`      |
| `Result` and `Option`                                                      | They are the same variant, with equal fields                            |
| `Date`                                                                     | They hold the same time                                                 |
| `Map`                                                                      | They hold the same keys, with equal values                              |
| `Set`                                                                      | They hold the same elements                                             |
| `ArrayBuffer`, `DataView`                                                  | Their bytes are equal                                                   |
| Typed arrays                                                               | They are of one kind, with equal elements                               |
| Anything else: an instance of a class, an `Error`, a `RegExp`, a `Promise` | Never — it is defined by which object it is                             |

Primitives compare as a `Set` finds them, so `equals` always says a value equals
itself — `NaN` included. That is a different question from the one
`NumericType.equals` of `@fulcro/types` answers, where `NaN` equals nothing:
that one is arithmetic, and this one is what a key, a cache or a list without
duplicates needs.

`some(null)` and `none()` hold exactly the same data, and are not equal: the
variant is compared before the fields. A `failure` holding an `Error` equals
another only when both hold the same error, since an error is an instance of a
class.

**An instance of a class equals only itself.** A class may keep its state where
no comparison can read it — `Decimal` keeps its digits in private fields — so
comparing its own keys would find none and call any two instances equal. To
compare one by what it holds, give it a rule; see below.

**A key of a `Map` and an element of a `Set` are found by identity**, as the map
and the set find them, never by contents. That is what keeps comparing two maps
linear: matching every key against every other would cost a comparison per
pair.

Two structures that refer to themselves — a ring, a tree whose node holds its
parent — are equal when nothing else in them differs, and are compared once
round.

### Values of `@fulcro/types`

A struct, a matrix, a fraction, a complex number: each is a value type, and
`equals` reads it as the plain object or array it is. That is right for many of
them and not for all — a matrix of two rows and three columns holds the same
six elements as one of three rows and two, and its shape is not one of its
keys. The descriptor knows the type; hand it to [`createEquals`](#your-own-rules-createequals)
as a rule:

```ts
const sameShape = createEquals([Wide, Tall]); // Matrix(DoublePrecisionFloat, 2, 3) and (…, 3, 2)

equals(wide, tall); // true: the same six numbers
sameShape(wide, tall); // false: each is recognised by its own descriptor
```

A struct passed as a rule is never equal to a plain object that merely has its
fields, and each of its fields compares as its own type does.

### Your own rules: `createEquals`

`createEquals` makes a variant of `equals` that compares some kinds of value by
rules of your own. A rule recognises its values with `is` and compares two of
them with `equals`:

```ts
const byId: EqualityRule<User> = {
	is: (value): value is User => value instanceof User,
	equals: (left, right) => left.id === right.id,
};

const sameUsers = createEquals([byId]);

sameUsers([alice], [aliceRenamed]); // true: the arrays as `equals` compares them, the users by id
```

The descriptor of every type of `@fulcro/types` already is a rule, since each
has `is` and `equals`. `Decimal` compares through its values, so its rule is
written out:

```ts
const byValue: EqualityRule<Decimal> = {
	is: Decimal.is,
	equals: (left, right) => left.equals(right),
};
```

Two values are compared in this order:

1. A value always equals itself, whatever a rule would say.
2. The first rule that recognises either value decides: with its `equals` when
   it recognises both, and as unequal when it recognises only one. The rules
   after it are not asked.
3. Otherwise, as `equals` compares them.

So a rule can also take over a kind `equals` already compares — dates by the
day, strings without regard to case.

A rule whose values hold others compares them with the third argument, the
variant it belongs to. It keeps track of what is already being compared, so a
structure that refers to itself is still compared once round:

```ts
const byLabel: EqualityRule<Tree> = {
	is: (value): value is Tree => value instanceof Tree,
	equals: (left, right, nested) => {
		return left.label === right.label && nested(left.children, right.children);
	},
};
```

The rules and their members are read once, when the variant is made: changing
the list afterwards changes nothing. A rule may be an instance of a class; its
members are called on it. A rule that throws makes the comparison throw.

`createEquals` refuses what is not an array of rules
([`FULCRO2002`](./errors/FULCRO2xxx.md#fulcro2002)), and a rule whose `is` or
`equals` is not a function ([`FULCRO2003`](./errors/FULCRO2xxx.md#fulcro2003)).

### What a comparison costs

Each value is read once on each side, and the comparison stops at the first
difference: two arrays of a hundred thousand elements that differ at the
eleventh are read eleven elements deep. Nothing of a value compared with itself
is read at all. A map or a set is compared with one lookup per entry. A rule is
asked about a pair at most once per value, and the rules after the one that
recognised it are not asked.

## What a value costs

A `Result` or an `Option` is one frozen object carrying its data and nothing
else — `value` and `error`, or `value` alone. The methods are inherited from a
prototype each variant shares, so they cost nothing per value and stay out of a
spread, a `for…in` and a deep equality. `none()` always returns the same
object, so absence allocates nothing at all.

## Reference

|                                       |                                                                |
| ------------------------------------- | -------------------------------------------------------------- |
| `switchFor(value, cases)`             | Exhaustive. One branch per member, no fallback.                |
| `switchFor(value, cases, otherwise)`  | Predicate form, returning `R`.                                 |
| `switchFor(value, cases)`             | Predicate form without a fallback, returning `R \| undefined`. |
| `success(value)`                      | A `Result` that succeeded.                                     |
| `failure(error)`                      | A `Result` that failed. `error` is never nullish.              |
| `result.handle({ success, failure })` | Runs the branch of the variant. Both are required.             |
| `result.isSuccess()`, `isFailure()`   | Narrow the result.                                             |
| `tryCatch(callback)`                  | Catches synchronous and asynchronous failures.                 |
| `tryCatch(promise)`                   | Catches only the rejection.                                    |
| `some(value)`                         | An `Option` holding a value, whatever it is.                   |
| `none()`                              | The absent `Option`. Always the same object.                   |
| `optionOf(value)`                     | `none()` for `null` or `undefined`, `some(value)` otherwise.   |
| `option.handle({ some, none })`       | Runs the branch of the variant. Both are required.             |
| `option.isSome()`, `isNone()`         | Narrow the option.                                             |
| `equals(left, right)`                 | Compares by contents; any other object by identity.            |
| `createEquals(rules)`                 | A variant of `equals` that asks the rules first.               |

Types: `SwitchCase`, `ExhaustiveCases`, `Result`, `Success`, `Failure`,
`ResultCases`, `Option`, `Some`, `None`, `OptionCases`, `Equals`,
`EqualityRule`.
