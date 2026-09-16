---
'@fulcro/reflect': minor
---

Four new utilities: `pathOf`, `keysOf<T>()`, `typeOf<T>()` and `pathsOf<T>()`.

**`pathOf`** answers with the whole path where `nameOf` answers with the last
segment:

```ts
nameOf(() => user.profile.email); // 'email'
pathOf(() => user.profile.email); // 'profile.email'
pathOf(() => order.items[0].sku); // 'items[0].sku'
```

The root is dropped, because the path is relative to it. Resolved to a literal
with the transformer, parsed from the closure source without it.

**`keysOf<T>()`** lists the keys a type declares. Deliberately not
`Object.keys`: structural typing lets a value carry more than its type declares,
which is why `Object.keys` returns `string[]` rather than `(keyof T)[]`. This
never looks at a value.

**`typeOf<T>()`** is the generic counterpart of `typeOf(value)`. That describes
what a value is; this describes what a type says — name, kind, declaration site,
and the members with their types, optionality and readonly-ness. It also reports
the branches of a union and the element of an array. The two forms are told apart
by having an argument or not, so `typeOf(undefined)` keeps working.

`members` is what a separate `membersOf<T>()` would have returned; one question,
one place.

**`pathsOf<T>()`** lists every leaf a type can be walked to — `customer.email`,
`items[].sku` — with the type and optionality at each. Three rules keep it
useful: a primitive is a leaf, a known class is a leaf, and recursion stops at
the repeat. Without the first, a `string` property yields the whole of
`String.prototype`.

The generic form is `pathsOf`, plural, because it answers with a list where
`pathOf` answers with one.
