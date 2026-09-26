---
'@fulcro/reflect': minor
'@fulcro/types': minor
'@fulcro/errors': patch
---

`offsetOf<T>(field)` and `layoutOf<T>()` answer where a struct's fields sit, at
compile time: `offsetOf<Vector3>('y')` becomes `4`, and `layoutOf<Vector3>()`
becomes a frozen object equal to `Vector3.layout`. A name that is not a field is
a type error. The layout of a struct value's type now also lists each field's
size and alignment, in declaration order, which is what the transformer places
the fields from — including for a struct imported from a built package.
`FULCRO4009` names the two new utilities in its message.
