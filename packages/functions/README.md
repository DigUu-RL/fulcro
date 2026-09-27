# @fulcro/functions

Runtime helpers that turn control flow into values, and two types that turn
failure and absence into values. No dependencies, no compiler involvement,
nothing to configure.

```ts
import {
	failure,
	none,
	optionOf,
	some,
	success,
	switchFor,
	tryCatch,
} from '@fulcro/functions';
```

## `switchFor`

Choosing between branches, as an expression rather than as a statement. It comes
in two forms, and which one to reach for depends on whether the value is drawn
from a closed set.

### Exhaustive form — enums and literal unions

Pass one branch per member, and the compiler enforces that every member has one.

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

Leave a member out and it does not compile:

```text
error TS2345: Property '[Status.Archived]' is missing in type
'{ 0: () => string; 1: () => string; }' but required in type
'ExhaustiveCases<Status, string>'.
```

**That error is the whole point.** When a member is added to the enum later,
every `switchFor` over it stops compiling until the new case is handled — which
is the moment to decide what it should do, rather than finding the gap in
production. A native `switch` says nothing in that situation; it just falls
through.

There is deliberately **no fallback parameter** in this form. A fallback is
precisely what would absorb the new member in silence and take the guarantee
away.

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

Works with numeric enums, string enums, and unions of string or number
literals. A member whose value is `0` is dispatched like any other — the branch
is found by key, never by testing the value for truthiness.

### Running it for its effects

There is no separate void-returning function, and none is needed. Where the
branches return nothing, `R` is inferred as `void` and the call stands on its
own as a statement:

```ts
switchFor(status, {
	[Status.Draft]: () => saveDraft(),
	[Status.Published]: () => publish(),
	[Status.Archived]: () => archive(),
});
```

The exhaustiveness check applies there exactly as it does to a call whose result
is read — leave a member out and this fails to compile too.

### Predicate form — everything else

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

`otherwise` is optional, and leaving it out shows up in the type instead of
being hidden:

```ts
const a = switchFor(n, cases); // R | undefined
const b = switchFor(n, cases, () => fallback); // R
```

Without a fallback, an unmatched value evaluates to `undefined` and the compiler
makes you account for it. With one, the `undefined` is gone, because nothing can
produce it any more.

This form **cannot** be exhaustive. A condition is an arbitrary function, and
the compiler cannot reason about which values it accepts — which is why it takes
a fallback and the exhaustive form does not. It also decides a branch without
narrowing the value inside `then`.

## `Result`

The outcome of an operation, as a value: a success carrying `value`, or a
failure carrying `error`. Build one with `success(value)` or `failure(error)`,
or let `tryCatch` build it for you.

```ts
const message = result.handle({
	success: (value) => `got ${value}`,
	failure: (error) => `failed: ${String(error)}`,
});
```

**`handle` is exhaustive.** Both branches are required, and leaving one out does
not compile. Only the branch for the variant at hand runs.

**Or narrow first**, with `isSuccess()` or `isFailure()`:

```ts
if (result.isSuccess()) {
	result.value; // T, not T | null
}
```

`error === null` narrows the same way, and survives a copy — through
`structuredClone`, a worker or JSON — that keeps the data of a result but not
its methods. **Never discriminate on `value`:** `0`, `''` and `null` are
perfectly good values, and `if (result.value)` reports every one of them as a
failure.

A failure's error is never `null` or `undefined`; `failure(null)` does not
compile, since the failure would then read as a success.

## `tryCatch`

Runs an operation and returns its outcome as a `Result`, instead of throwing.

```ts
const result = await tryCatch(() => fetch(url));

if (result.isFailure()) return fallback;

use(result.value);
```

**Prefer the callback form.** Passing a promise that already exists cannot catch
anything the expression throws on its way to producing it — in
`tryCatch(risky())`, `risky` runs first, and a synchronous throw inside it
escapes before `tryCatch` is ever called. The callback form moves that call
inside the `try`, which is the only way to cover both the synchronous and the
asynchronous failure of one operation. The promise form is still accepted, and
reads better when the promise is already in hand.

**`E` defaults to `unknown`, not to `Error`.** JavaScript lets any value be
thrown, so typing the error as an `Error` would be a claim this function cannot
keep — `result.error.message` would read `undefined` whenever something threw a
string. Narrow it at the use site, or pass the type explicitly when you own
every throw site:

```ts
const result = await tryCatch<User, ApiError>(() => api.load(id));
```

A thrown `null` or `undefined` — legal, however pathological — is wrapped in an
`Error` carrying the original value as its `cause`, because storing it as it
came would make the failure indistinguishable from a success.

`tryCatch` always returns a promise, including for a fully synchronous
operation.

## `Option`

A value that may be absent, as a value of its own rather than as `null`.

```ts
const user: Option<User> = optionOf(users.get(id));

const greeting = user.handle({
	some: (found) => `Hello, ${found.name}`,
	none: () => 'Hello, stranger',
});
```

`optionOf` reads `null` and `undefined` as absent, and everything else — `0`,
`''` and `false` included — as present. `some(value)` keeps whatever it is
given, and `none()` is always the same frozen object. Narrow with `isSome()` or
`isNone()`: `some(null)` and `none()` hold the same data, and only the variant
tells them apart.

---

**Full guide:** [docs/functions.md](../../docs/functions.md) — scenarios, worked
examples and the failure modes worth knowing before you meet them.
