# Reflection: `nameOf`, `typeOf`, `defaultOf`

Three utilities that answer questions TypeScript erases on its way to
JavaScript.

```sh
npm install @fulcro/reflect
```

```ts
import { defaultOf, nameOf, typeOf } from '@fulcro/reflect';
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
