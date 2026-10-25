---
'@fulcro/reflect': major
'@fulcro/collections': major
'@fulcro/transform-core': major
---

The utilities whose type argument the transformer reads now say, in what they return, what that type argument is for:

- `sizeOf<T>()` returns `TypeLayout<T>['size']` and `alignOf<T>()` returns `TypeLayout<T>['alignment']`: the number literal the layout of `T` declares, the same one `layoutOf<T>()` reports, instead of `number`. `let size = sizeOf<Point>(); size += 4` stops compiling, since `size` is typed as that literal; a variable that accumulates sizes is annotated `: number`.
- `nameOf<T>()` returns `TypeName<T>`, a `string` carrying the type it names. It is still assignable to `string`, and a plain string can still be assigned to it.
- `typeOf<T>()` returns `TypeMetadata<T>`, and `pathsOf<T>()` takes and returns `readonly TypePath<T>[]`. Both default their parameter to `unknown`, so `TypeMetadata` and `TypePath` written without one keep their meaning, and the metadata or paths of one type no longer pass for another's.
- `defaultOf<T>()` returns `Defaulted<T>`, which is `T`: `const order: Order = defaultOf()` still infers `Order`.
- `TypeTest<R>`, in `@fulcro/reflect`, `@fulcro/collections` and `@fulcro/transform-core` alike, carries the type it vouches for. The three stay structurally identical. A `TypeTest<Account>` is no longer accepted where a `TypeTest<User>` is asked for. It never vouched for one, and the transformer's own tests are unaffected.

`TypeName` and `Defaulted` are new exports of `@fulcro/reflect`. The runtime is unchanged, and so is everything the transformers emit.
