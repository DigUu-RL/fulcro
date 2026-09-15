# @fulcro/reflect

Utilities for the things TypeScript erases, plus a couple of runtime helpers
that pair with them. No dependencies.

```ts
import {
	defaultOf,
	nameOf,
	switchFor,
	tryCatch,
	typeOf,
} from '@fulcro/reflect';
```

The package holds two kinds of thing, and it is worth knowing which is which.

**`nameOf`, `typeOf` and `defaultOf` are type aware.** Each works on its own and
gets sharper when the project compiles through
[`@fulcro/transformer`](../transformer); `defaultOf` requires it outright. What
changes with the transformer is spelled out per utility below, and summarised in
a table at the end.

**`switchFor` and `tryCatch` are plain runtime helpers.** No compiler
involvement, nothing to configure, identical behaviour with or without the
transformer.

## `nameOf`

Reads a name as it was written in the source.

```ts
const email = 'a@b.c';

nameOf(() => email); // 'email'
nameOf(() => user.profile.theme); // 'theme'  (last segment of a path)
nameOf(() => user['email']); // 'email'
nameOf(() => user.save); // 'save'   (never calls it)
nameOf(User); // 'User'
nameOf(42); // 'Number'
```

The accessor is never invoked — the name is read out of the source of the
closure, so `nameOf(() => user.save)` costs nothing and is safe on a getter with
side effects.

**Two limits, both from the language rather than this implementation:**

- Interfaces and type aliases have no runtime existence, so the runtime form
  cannot name them. With the transformer, `nameOf<UserContract>()` can.
- A minifier renames local variables, so `nameOf(() => email)` may report a
  mangled name in a bundled build. Property names, method names and the form
  taking a class normally survive. With the transformer the name is resolved
  before minification ever runs, so this stops being a concern.

## `typeOf`

A replacement for the native `typeof`, which answers with eight strings and
collapses most of what a program needs to tell apart.

```ts
typeof null; // 'object'
typeOf(null).typeId; // 'null'

typeof [1, 2]; // 'object'
typeOf([1, 2]).typeId; // 'array'

typeof NaN; // 'number'
typeOf(NaN).typeId; // 'nan'

typeOf(new Admin()); // { typeId: 'instance', name: 'Admin', … }
```

The result carries `typeId` (a discriminant usable in a `switch`), `name`,
`lineage` (the prototype chain, e.g. `['Admin', 'User', 'Object']`), and the
flags `primitive`, `nullish` and `iterable`.

`lineage` is as close as runtime inspection gets to "where does this type come
from". It is a chain of constructors, never a module path — the compiler keeps
no record of where a class was declared.

**With the transformer**, a `declared` field is filled in with the _written_
type: its rendered text, its name, how it was declared (`interface`, `enum`,
`union`, …) and the file, line and column it came from. Without the transformer
`declared` reads `null` and everything else keeps working.

```ts
typeOf(user).declared;
// { text: 'UserContract', name: 'UserContract', kind: 'interface',
//   site: { path: 'src/models/user.ts', line: 12, column: 18 } }
```

## `defaultOf`

Produces the emptiest value that still fully inhabits a type.

```ts
interface Order {
	id: number;
	customer: { name: string; active: boolean };
	items: string[];
	note?: string;
}

defaultOf<Order>();
// { id: 0, customer: { name: '', active: false }, items: [] }

defaultOf<string>(); // ''
defaultOf<'dark' | 'light'>(); // 'dark'
```

One rule covers every case: **the result is always a valid `T`**. Required
properties are filled, optional ones are left out (absence already satisfies
them), a literal type yields its only inhabitant, and a union yields `null` or
`undefined` when it admits one, falling back to the default of its first member.
Tuples are filled position by position, arrays come back empty, `Set` and `Date`
are instantiated rather than described, and a circular type is closed off
instead of nesting forever.

**`defaultOf` requires the transformer.** A type has no runtime existence, so
there is genuinely nothing for a plain function to inspect. Without the
transformer the call throws, deliberately — a default it cannot compute would be
a lie, and failing loudly at the call site beats handing back a wrong value.

## `switchFor`

Choosing between branches by condition, as an expression rather than as a
statement.

```ts
const label = switchFor(
	order,
	[
		{ when: (o) => o.total > 1000, then: () => 'large' },
		{ when: (o) => o.items.length === 0, then: () => 'empty' },
	],
	() => 'standard',
);
```

A native `switch` compares one value against constants and runs statements, so
it cannot initialise a `const` or fill a property — which is how chains of
nested ternaries get written. This takes a predicate per branch and evaluates to
a result instead.

Branches are tested in order, the first match wins, and the rest are never
evaluated — neither their conditions nor their bodies. `otherwise` is required
rather than optional, which is what guarantees a result: an unmatched value
returns its fallback instead of `undefined`, so `R` never has to be widened to
admit a gap that would only show up at runtime.

One limit: `when` is a plain predicate, so it picks the branch without narrowing
the value inside `then`. A branch needing the narrowed type has to assert it.
Narrowing per branch would mean inferring the cases as a tuple of individually
typed guards — a considerably heavier API than this one.

## `tryCatch`

The outcome of an operation as a value, instead of as control flow.

```ts
const result = await tryCatch(() => fetch(url));

if (result.error !== null) return fallback;

use(result.data);
```

**Prefer the callback form.** Passing a promise that already exists cannot catch
anything the expression throws on its way to producing it — in
`tryCatch(risky())`, `risky` runs first, and a synchronous throw inside it
escapes before `tryCatch` is ever called. The callback form moves that call
inside the `try`, which is the only way to cover both the synchronous and the
asynchronous failure of one operation. The promise form is still accepted, and
reads better when the promise is already in hand.

**Discriminate on `error`, never on `data`.** `0`, `''` and `null` are perfectly
good results, and `if (result.data)` reports every one of them as a failure.
Checking `result.error === null` narrows the union properly:

```ts
if (result.error === null) {
	result.data; // T, not T | null
}
```

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

## With and without the transformer

|                            | Without                             | With `@fulcro/transformer`                                    |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `nameOf(() => user.email)` | `'email'` — parsed from the closure | `'email'` — emitted as a literal, minifier-proof              |
| `nameOf<UserContract>()`   | not available                       | `'UserContract'`                                              |
| `typeOf(value)`            | runtime shape; `declared` is `null` | runtime shape **+** the declared type and its source location |
| `defaultOf<T>()`           | throws                              | the built value, emitted inline                               |

Installing the transformer is a build-time concern only; this package stays a
plain runtime dependency either way. See
[`@fulcro/transformer`](../transformer) for the setup.
