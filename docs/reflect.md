# Reflection

Eight utilities that answer questions TypeScript erases on its way to
JavaScript: what a name was, what a type says, what is a valid empty value, and
whether the thing in front of you really is what it claims.

```sh
npm install @fulcro/reflect
```

```ts
import {
	as,
	defaultOf,
	is,
	keysOf,
	nameOf,
	pathOf,
	pathsOf,
	typeOf,
} from '@fulcro/reflect';
```

One package: the compile time transformer ships inside it, as
`@fulcro/reflect/transformer`. It is not optional —
[see below](#the-transformer-is-not-optional) — but there is nothing else to
install, and no way to end up with half of it.

## The problem

TypeScript's types do not exist at runtime. Interfaces, type aliases, generic
arguments and the file a type was declared in all vanish when the compiler emits
JavaScript:

```ts
interface User {
	email: string;
}

// At runtime there is no `User`. There is nothing to ask.
```

So a plain function can only ever report what it can see in the _value_ in front
of it. These three go further, by doing their work **while the compiler is still
running**.

## `nameOf` — the name as written

```ts
const email = 'a@b.c';

nameOf(() => email); // 'email'
nameOf(() => user.profile.theme); // 'theme'    (last segment)
nameOf(() => user['email']); // 'email'
nameOf(() => user.save); // 'save'     (never calls it)
nameOf<UserContract>(); // 'UserContract'
nameOf(User); // 'User'
```

The accessor is **never invoked**, so it is safe on a getter with side effects
and costs nothing to evaluate.

### Where you actually use `nameOf`

Anywhere a string has to match a property name, and a typo would be silent:

```ts
// Sorting by a column name that a rename would break loudly.
const column = nameOf(() => user.createdAt);

// A form field bound to a model property.
register(nameOf(() => form.email));

// A validation message that follows a rename.
throw new Error(`${nameOf(() => order.total)} is required`);
```

Rename `createdAt` in your editor and the string follows. Write `'createdAt'` by
hand and it does not.

## `typeOf` — a `typeof` that answers properly

The native `typeof` has eight answers and collapses most of what a program needs
to tell apart:

```ts
typeof null; // 'object'      ← unhelpful
typeof [1, 2]; // 'object'      ← unhelpful
typeof NaN; // 'number'      ← unhelpful
typeof new Date(); // 'object'      ← unhelpful
```

```ts
typeOf(null).typeId; // 'null'
typeOf([1, 2]).typeId; // 'array'
typeOf(NaN).typeId; // 'nan'
typeOf(new Date()).typeId; // 'date'
typeOf(new Admin()); // { typeId: 'instance', name: 'Admin', … }
```

The result carries:

| Field                            | What it says                                         |
| -------------------------------- | ---------------------------------------------------- |
| `typeId`                         | The runtime shape, usable as a `switch` discriminant |
| `name`                           | `'Admin'`, `'Date'`, `'(anonymous)'`                 |
| `lineage`                        | The prototype chain: `['Admin', 'User', 'Object']`   |
| `primitive` `nullish` `iterable` | Flags worth having without another check             |
| `declared`                       | The **written** type — only with the transformer     |

`declared` is the one nothing else can give you:

```ts
typeOf(user).declared;
// { text: 'UserContract', name: 'UserContract', kind: 'interface',
//   site: { path: 'src/models/user.ts', line: 12, column: 18 } }
```

The type's name, how it was declared, and the file and line it came from.

### Where you actually use `typeOf`

```ts
// A logger that says what it got, not 'object'.
log(`expected a Date, got ${typeOf(value).name}`);

// Dispatch on shape without a chain of instanceof.
switch (typeOf(value).typeId) {
	case 'array':
		return value.length;
	case 'map':
	case 'set':
		return value.size;
	case 'string':
		return value.length;
}
```

`typeOf` never reads the contents of what it inspects and never evaluates an
accessor, so describing a million-element array costs the same as describing a
one-element one, and an expensive getter is not triggered by looking at the
object that carries it.

## `defaultOf` — the emptiest valid value of a type

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

**One rule covers every case: the result is always a valid `T`.** Required
properties are filled, optional ones are left out — absence already satisfies
them — a literal type yields its only inhabitant, and a union yields `null` or
`undefined` where it admits one.

Tuples are filled position by position, arrays come back empty, `Set` and `Date`
are instantiated rather than described, and a circular type is closed off instead
of nesting forever.

### Where you actually use `defaultOf`

```ts
// An empty form state that follows the model.
const [draft, setDraft] = useState(defaultOf<OrderForm>());

// A test fixture with only the field under test written out.
const order = { ...defaultOf<Order>(), total: 99 };

// Resetting to empty without a hand-maintained constant.
setFilters(defaultOf<Filters>());
```

Add a required field to `Order` and every one of those follows. A hand-written
`{ id: 0, items: [] }` does not, and the compiler will not tell you.

## `pathOf` — the whole path, not the last name

`nameOf` answers with the last segment. `pathOf` answers with all of them:

```ts
nameOf(() => user.profile.email); // 'email'
pathOf(() => user.profile.email); // 'profile.email'

pathOf(() => order.items[0].sku); // 'items[0].sku'
pathOf(() => order['customer'].email); // 'customer.email'
```

Which is what a form field name, a database column, a sort key or a translation
key actually needs — the name alone loses where the value lives.

**The root is dropped**, because the path is relative to it. The object being
described is the form, the row, the document, and repeating whatever the local
variable happened to be called would make the answer depend on that.

The accessor is never invoked, so this is safe on a getter with side effects.
With the transformer it becomes a literal before a minifier can rename
anything; without it the source of the closure is parsed at runtime, which
works and carries the same caveat `nameOf` does.

## Describing a type without a value

Three utilities answer questions about a **type**, with no value to inspect.
All three need the transformer, and refuse without it.

### `keysOf<T>()`

```ts
keysOf<Order>(); // ['id', 'customer', 'items', 'total']
```

For the lists a program keeps writing out by hand and forgetting to update: the
columns of a table, the fields of a form, the properties to copy.

**This is deliberately not `Object.keys`.** The keys of a value and the keys of
a type are different questions: structural typing lets an object carry more than
its type declares, which is exactly why `Object.keys` returns `string[]` rather
than `(keyof T)[]`. Typing that cast as the narrower thing would be a lie of the
same family as the language's own `as`. This one never looks at a value.

### `typeOf<T>()`

The counterpart of `typeOf(value)`. That one describes what a value **is**; this
describes what a type **says**:

```ts
typeOf<Order>();
// {
//   text: 'Order', name: 'Order', kind: 'interface',
//   site: { path: 'src/models/order.ts', line: 4, column: 1 },
//   members: [
//     { name: 'id',   type: 'number', optional: false, readonly: true },
//     { name: 'note', type: 'string', optional: true,  readonly: false },
//   ],
//   union: null,
//   element: null,
// }
```

`members` is what a separate `membersOf<T>()` would have returned — one
question, one place. `union` carries the branches when the type is one, and
`element` the element type when it is an array; both are `null` otherwise,
because an empty list would read as a shape with nothing in it.

The two forms are told apart by having an argument or not, so `typeOf(undefined)`
keeps describing the undefined value.

### `pathsOf<T>()`

Every leaf the type can be walked to:

```ts
pathsOf<Order>();
// [
//   { path: 'id',                    type: 'number', optional: false },
//   { path: 'customer.email',        type: 'string', optional: false },
//   { path: 'items[].sku',           type: 'string', optional: false },
//   { path: 'status', type: '"pending" | "paid"',    optional: false },
//   { path: 'placedAt',              type: 'Date',   optional: false },
// ]
```

For anything that enumerates a shape rather than reads one value: the columns a
report can sort by, the fields a form renders, the keys a translation file
needs.

**Three rules keep the answer useful**, and each exists because the version
without it produces nonsense.

A **primitive is a leaf.** Descending into one yields the whole of
`String.prototype` — `customer.email.trimLeft` is a real property path and
useless as a data path.

A **known class is a leaf.** `placedAt` reports `Date`, not the fifty methods a
date carries.

**Recursion stops** at the repeat, naming the type at the end of the path. A
type containing itself has infinitely many paths, and where the repeat begins is
more honest than an arbitrary depth of it.

A union of primitives is a leaf and reports the union. A union with an object in
it is reported without being descended: there is no single path to promise when
the shape depends on which branch a value took.

## `is` and `as` — checking a value against a type

TypeScript's `as` is an **assertion, not a check**. `payload as Order` compiles
whatever `payload` turns out to be, and the mistake surfaces later, somewhere
else, as a property of `undefined`.

These two do the check the language cannot: the transformer reads the type while
the compiler still has it and writes the test out — every property, nested
objects, every element of an array.

```ts
if (is<Order>(payload)) {
	payload.total; // narrowed, and actually verified
}

const order = as<Order>(await response.json());
```

`is` is a **type guard**, for when a failure should branch the program. `as`
returns the value — the same object, not a copy — and throws when it does not
match, for when a failure should stop it.

### The message names where it failed

```text
TypeError: as<Order>() refused a value: customer.email: expected string, got number
TypeError: as<Order>() refused a value: items[3].quantity: expected number, got undefined
```

Told only _"not an Order"_ about a record with forty fields, you would be no
better off than before the check existed. So the transformer emits a second
walker beside the fast check, purely to answer **where**. It runs only once the
check has already refused, so a value that passes never pays for it — and only
`as` gets one, since a branch needs yes or no.

Where a type is more than the walker can describe precisely — an intersection, a
tuple, a union of object shapes — it names the type expected at that path rather
than guessing at a field. Vague beats wrong: a path is a promise about where the
problem is, and inventing one sends someone to the wrong field.

### What can be checked

The same set the sequences check, since it is the same generator: primitives,
literals, unions, intersections, objects and interfaces nested to any depth,
optional properties, arrays, fixed-length tuples, classes, the built-in classes
by `instanceof`, and types that contain themselves. Extra properties are
accepted, because structural typing accepts them.

Refused, and loudly: index signatures and unresolved generics. For those, write
the test and pass it in:

```ts
is<Settings>(value, {
	name: 'Settings',
	matches: (v) => looksLikeSettings(v),
});
```

### Both need the transformer

Without it the call refuses rather than guessing. A check that answers `true`
for the wrong thing is worse than no check at all — it is false confidence at
exactly the boundary where the data is least trustworthy.

## The transformer is not optional

These utilities are named for what they read, and what they read is the _type_ —
which exists only while the compiler runs. Without the transformer the package
still loads and still answers, but it answers from the value instead:

|                            | Without                             | With the transformer                      |
| -------------------------- | ----------------------------------- | ----------------------------------------- |
| `nameOf(() => user.email)` | `'email'` — parsed from the closure | `'email'` — emitted as a literal          |
| `nameOf<UserContract>()`   | not available                       | `'UserContract'`                          |
| `typeOf(v).declared`       | `null`                              | the declared type and its source location |
| `defaultOf<T>()`           | **throws**                          | the built value, emitted inline           |

Two of those degrade **quietly**, which is worth knowing before you meet it: a
minifier renames local variables, so `nameOf(() => email)` can report a mangled
name in a bundled build, and `typeOf(…).declared` simply reads `null`. Only
`defaultOf` fails loudly — deliberately, because a default it cannot compute
would be a lie.

## Wiring the transformer in

Two paths, depending on how you build. Nothing extra to install either way — the
transformer came with the package.

### With `tsc`

`tsc` does not run third-party transformers on its own; `ts-patch` teaches it to.

```sh
npm install --save-dev ts-patch
```

```jsonc
// tsconfig.json
{
	"compilerOptions": {
		"plugins": [
			{ "transform": "@fulcro/reflect/transformer", "type": "program" },
		],
	},
}
```

```jsonc
// package.json — build with tspc rather than tsc
{ "scripts": { "build": "tspc -p tsconfig.json" } }
```

### With a bundler

```ts
// vite.config.ts
import { vite as fulcro } from '@fulcro/reflect/unplugin';

export default defineConfig({ plugins: [fulcro()] });
```

`rollup`, `webpack`, `rspack`, `esbuild` and `farm` are exported under their own
names and take the same options. The plugin declares `enforce: 'pre'`, which
matters — once esbuild or swc has erased the types, there is nothing left to
read.

### TypeScript 5 only, up to but not including 7

7.x is the native port, and its package no longer exposes the compiler API this
is built on. The peer range says so rather than letting an install succeed into
a transformer that cannot start. `@fulcro/reflect` itself is unaffected and runs
anywhere, in its fallback behaviour.

## Troubleshooting

**`defaultOf` throws.** The transformer did not run over that file. Building with
`tsc` rather than `tspc`, or a bundler plugin registered after the TypeScript
step, are the two usual causes.

**`typeOf(…).declared` is `null`, or `nameOf` reports a mangled name.** Same
cause. These two degrade quietly, so check them whenever the build setup changes.

**The paths from `typeOf` look wrong.** Set `projectRoot` explicitly; they are
made relative to it, and the default is the compiler's working directory.
