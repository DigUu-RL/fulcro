---
'@fulcro/reflect': minor
---

Add `sizeOf<T>()` and `alignOf<T>()`, which read the size and alignment a type
declares and are replaced by the number at compile time.

A type declares a layout by carrying a `'~layout'` property with literal `size`
and `alignment`, as every fixed-layout type of `@fulcro/types` does. A type
without one is a type error at the call; a generic parameter, or a union of
different layouts, is left to throw at runtime, since there is no single number
to emit.
