---
'@fulcro/collections': minor
'@fulcro/transform-core': minor
---

`ofType<T>()` and `cast<T>()` can be written as types — including interfaces.

`@fulcro/collections` ships its own compile time transformer, at
`@fulcro/collections/transformer` and `@fulcro/collections/unplugin`. A
primitive becomes the `typeof` name, a class becomes its constructor, and an
interface — which has neither — is **written out as the checks its properties
imply**, nested to any depth.

That makes `cast<T>()` a validator for untrusted data derived from the type
itself:

```ts
const orders = SequenceCollection.from(await response.json())
	.cast<Order>()
	.toArray();
```

Covered: primitives, literals, unions, intersections, objects and interfaces,
optional properties, arrays (every element), fixed-length tuples, classes, and
the built-in classes by `instanceof`. Extra properties are accepted, as
structural typing accepts them.

Refused, deliberately: recursive types, index signatures, unresolved generics,
and classes imported with `import type`. A check that answers yes to the wrong
thing is worse than no check, so anything that cannot be written out completely
is left for the runtime to reject out loud.

The plugin is optional — every operator works without it, and only the
no-argument forms need it.

`@fulcro/transform-core` gained a `callForm` on its rewriters, which is what
lets one claim `something.method()` rather than an imported function.
