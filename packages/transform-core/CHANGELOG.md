# @fulcro/transform-core

## 0.7.0

No changes in this release.

## 0.6.0

No changes in this release.

## 0.5.0

No changes in this release.

## 0.4.0

### Minor Changes

- e11c9a5: `ofType<T>()` and `cast<T>()` can be written as types — including interfaces.

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

## 0.3.0

### Minor Changes

- 597a05c: Each library now ships its own compile time transformer.

  `@fulcro/reflect` exposes `@fulcro/reflect/transformer` and
  `@fulcro/reflect/unplugin`. Installing the package is enough; there is no second
  thing to install and no way to end up with the utilities but not the transformer
  that resolves them.

  **Breaking, and released as a minor**, which the pre-1.0 convention allows.
  Point the `plugins` entry of your tsconfig at `@fulcro/reflect/transformer`
  instead of `@fulcro/transformer`, and import bundler adapters from
  `@fulcro/reflect/unplugin`. The transformer itself is unchanged — same options,
  same emitted code.

  **This release also repairs 0.2.1.** That version declares a peer dependency on
  `@fulcro/transformer`, which no longer exists on the registry, so
  `npm install @fulcro/reflect` fails outright with a 404 rather than merely
  warning. There is no peer here to go missing.

  `@fulcro/transformer` is gone. It was a peer dependency, which npm installs and
  Yarn does not, so a project could get the utilities with nothing to resolve them
  and no error to say so; and it versioned separately, so `reflect@0.3` with
  `transformer@0.2` was an installable, broken pair.

  `@fulcro/transform-core` is new, and holds the machinery that belongs to no
  library in particular. You never install it directly.
