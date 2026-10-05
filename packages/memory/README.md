# @fulcro/memory

Where a value's bytes live, and who may reach them. A value's type says what it
is; this package decides where it is held — in ordinary JavaScript memory or in
a buffer of fixed size — without the code that reads it having to know which.

```sh
npm install @fulcro/memory
```

**Nothing is exported yet.** The package is being built feature by feature, and
the first of them is storage: one contract, `Storage<T>`, that a consumer
writes against, and the strategies behind it. Allocators and the views that
reach into a region follow.

The values themselves — numeric types, structs and their byte layout — are
[`@fulcro/types`](../types/README.md).
