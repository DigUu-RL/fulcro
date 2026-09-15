# @diguu/reflect

`nameOf`, `typeOf` and `defaultOf` — three utilities that answer questions
TypeScript erases on its way to JavaScript. No dependencies.

```ts
import { defaultOf, nameOf, typeOf } from '@diguu/reflect';
```

Each works on its own and gets sharper when the project compiles through
[`@diguu/transformer`](../transformer); `defaultOf` requires it outright. What
changes with the transformer is spelled out per utility below, and summarised in
a table at the end.

Looking for `switchFor` or `tryCatch`? They moved to
[`@diguu/functions`](../functions). Neither has anything to do with the
compiler, and keeping them here blurred what this package is for.

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

## With and without the transformer

|                            | Without                             | With `@diguu/transformer`                                     |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `nameOf(() => user.email)` | `'email'` — parsed from the closure | `'email'` — emitted as a literal, minifier-proof              |
| `nameOf<UserContract>()`   | not available                       | `'UserContract'`                                              |
| `typeOf(value)`            | runtime shape; `declared` is `null` | runtime shape **+** the declared type and its source location |
| `defaultOf<T>()`           | throws                              | the built value, emitted inline                               |

Installing the transformer is a build-time concern only; this package stays a
plain runtime dependency either way. See
[`@diguu/transformer`](../transformer) for the setup.
