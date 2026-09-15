---
'@fulcro/collections': minor
'@fulcro/transform-core': minor
---

`ofType<T>()` and `cast<T>()` can be written as types.

`@fulcro/collections` now ships its own compile time transformer, at
`@fulcro/collections/transformer` and `@fulcro/collections/unplugin`. It
resolves a type argument into the token the runtime already understands:
`ofType<string>()` is emitted as `ofType('string')`, `ofType<Admin>()` as
`ofType(Admin)`.

Unlike the one in `@fulcro/reflect`, this plugin is **optional** — every
operator in the package works without it, and only the no-argument forms need
it. They refuse loudly rather than guessing when it has not run.

Only a primitive or a class resolves, since only those leave something behind to
test for. An interface has no runtime form, so the call is left alone and throws
with a message naming both reasons it could have arrived unresolved.

`@fulcro/transform-core` gained a `callForm` on its rewriters, which is what
lets a rewriter claim `something.method()` rather than an imported function.
