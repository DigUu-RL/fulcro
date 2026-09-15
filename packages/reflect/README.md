# @fulcro/reflect

`nameOf`, `typeOf` and `defaultOf` — three utilities that answer questions
TypeScript erases on its way to JavaScript.

```sh
npm install @fulcro/reflect
```

One package. The compile time transformer ships **inside** it, as
`@fulcro/reflect/transformer`, so there is nothing else to install and no way to
end up with the utilities but not the thing that resolves them.

It used to be a second package, installed as a peer dependency, and that went
wrong in both of the ways it could. npm installs peers and Yarn does not, so a
project could get the utilities alone — quietly, because these degrade rather
than crash. And `@fulcro/reflect@0.3` with `@fulcro/transformer@0.2` was an
installable, broken combination. What a call means and what it compiles to are
now released together, because they are the same package.

**The transformer is not optional, and it is not a menu.** These
utilities are named for what they read, and what they read is the
type — which exists only while the compiler is running. Without the transformer
the package still loads and still answers, but it answers from the value in
front of it: `typeOf` reports a runtime shape with `declared` reading `null`,
`nameOf` falls back to parsing the closure and is at the mercy of a minifier,
and `defaultOf` throws, because a default it cannot compute would be a lie.

That is a fallback, not a mode to choose. The transformer is a **build time**
concern and lives behind its own entry point, so a bundle that only imports
these functions at runtime never pulls the compiler machinery in — but it is
always there to be wired up.

```ts
import { defaultOf, nameOf, typeOf } from '@fulcro/reflect';
```

What each utility gains from the transformer is spelled out below, and
summarised in a table at the end. Wiring it into a build takes one entry in a
tsconfig:

```json
{
	"plugins": [{ "transform": "@fulcro/reflect/transformer", "type": "program" }]
}
```

or one plugin in a bundler, from `@fulcro/reflect/unplugin`. See
[docs/reflect.md](../../docs/reflect.md) for the full setup.

Looking for `switchFor` or `tryCatch`? They moved to
[`@fulcro/functions`](../functions). Neither has anything to do with the
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

|                            | Without                             | With the transformer                                          |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------- |
| `nameOf(() => user.email)` | `'email'` — parsed from the closure | `'email'` — emitted as a literal, minifier-proof              |
| `nameOf<UserContract>()`   | not available                       | `'UserContract'`                                              |
| `typeOf(value)`            | runtime shape; `declared` is `null` | runtime shape **+** the declared type and its source location |
| `defaultOf<T>()`           | throws                              | the built value, emitted inline                               |

Wiring the transformer is a build time concern only; this package stays a plain
runtime dependency either way, and nothing extra is installed to get it.

---

**Full guide:** [docs/reflect.md](../../docs/reflect.md) — scenarios, worked
examples and the failure modes worth knowing before you meet them.
