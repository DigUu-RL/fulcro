---
'@fulcro/memory': minor
'@fulcro/errors': minor
---

Add `Storage<T>`, one contract for a fixed number of values held by index, with two strategies behind it: `createManagedStorage`, which holds any value as it is in an ordinary array, and `createFixedBufferStorage`, which holds the values of a struct from `@fulcro/types` as bytes, end to end in one buffer. Their errors are `FULCRO7001`–`FULCRO7004`.
