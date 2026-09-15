# Control flow as values: `switchFor` and `tryCatch`

Two helpers that turn statements into expressions. No dependencies, no compiler
involvement, nothing to configure.

```sh
npm install @fulcro/functions
```

```ts
import { switchFor, tryCatch } from '@fulcro/functions';
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

## `tryCatch`

The outcome of an operation as a value, instead of as control flow:

```ts
const result = await tryCatch(() => fetch(url));

if (result.error !== null) return fallback;

use(result.data);
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

### Discriminate on `error`, never on `data`

```ts
if (result.error === null) {
	result.data; // T, not T | null
}
```

`0`, `''` and `null` are perfectly good results, and `if (result.data)` reports
every one of them as a failure. Checking `error` narrows the union properly and
has no such trap.

### `E` defaults to `unknown`, not `Error`

JavaScript lets any value be thrown. Typing the error as an `Error` would be a
claim the function cannot keep — `result.error.message` would read `undefined`
whenever something threw a string. So narrow at the use site, or name the type
when you own every throw site:

```ts
const result = await tryCatch<User, ApiError>(() => api.load(id));
```

A thrown `null` or `undefined` — legal, however pathological — is wrapped in an
`Error` carrying the original as its `cause`, because storing it as it came would
make the failure indistinguishable from a success.

### Where you actually use it

```ts
// Several independent things, where one failing should not stop the rest.
const [user, orders, settings] = await Promise.all([
	tryCatch(() => loadUser(id)),
	tryCatch(() => loadOrders(id)),
	tryCatch(() => loadSettings(id)),
]);

render({
	user: user.data,
	orders: orders.error === null ? orders.data : [],
});
```

```ts
// A boundary where a throw would be worse than a value.
const parsed = await tryCatch(async () => JSON.parse(body));

if (parsed.error !== null) return reply.status(400).send('bad json');
```

### Collecting failures across a batch

It composes with the other packages rather than needing a mode of its own:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
import { SequenceCollection } from '@fulcro/collections';

const outcomes = await AsyncSequenceCollection.from(ids)
	.selectAwait((id) => tryCatch(() => loadUser(id)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition(
	(outcome) => outcome.error === null,
);
```

Every element is attempted, nothing stops early, and you get both halves.

`tryCatch` always returns a promise, including for a fully synchronous
operation.

## Reference

|                                      |                                                                |
| ------------------------------------ | -------------------------------------------------------------- |
| `switchFor(value, cases)`            | Exhaustive. One branch per member, no fallback.                |
| `switchFor(value, cases, otherwise)` | Predicate form, returning `R`.                                 |
| `switchFor(value, cases)`            | Predicate form without a fallback, returning `R \| undefined`. |
| `tryCatch(callback)`                 | Catches synchronous and asynchronous failures.                 |
| `tryCatch(promise)`                  | Catches only the rejection.                                    |

Types: `SwitchCase`, `ExhaustiveCases`, `Result`, `Success`, `Failure`.
