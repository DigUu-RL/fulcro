---
'@fulcro/memory': minor
'@fulcro/errors': minor
---

Add ownership: `own(create)` creates a storage and returns its `Owned<T>`, whose values are reached only by borrowing them. `borrow(owner)` lends them for reading as a `Borrowed<T>`, a `ReadOnlyView<T>` that any number of readers can hold at once; `borrowMutable(owner)` lends them for writing as a `MutableBorrow<T>`, a `View<T>` that ends every borrow before it. `move(owner)` hands the same values to a new owner and spends the old one. A spent owner, and a borrow something later ended — with every subview, view and pointer made from it — throw on their next access. The optional transformer at `@fulcro/memory/transformer` (or `@fulcro/memory/unplugin`) refuses the same uses when the code is compiled, following variables through branches, loops and closures; it rewrites nothing. `@fulcro/transform-core` is now a dependency, and `typescript` an optional peer. Their errors are `FULCRO7023`–`FULCRO7029`.
