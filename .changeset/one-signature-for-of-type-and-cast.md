---
'@fulcro/collections': minor
---

`ofType` and `cast`, on `Sequence` and `AsyncSequence`, now declare the class, shape-test and type-argument forms as one signature, `(type?: Constructor<R> | TypeTest<R>)`, after the unchanged `typeof`-name overload. `AsyncSequenceCollection.from` likewise takes `AsyncIterable<T> | Iterable<T | PromiseLike<T>>` in one signature.

Every call that compiled before still compiles, and infers the same type but for one, which now infers a narrower one: a `TypeTest<User>` from `@fulcro/reflect` passed to `ofType` gives `Sequence<User>`, where it gave back the sequence's own element type, `Sequence<User | number | string>` for a `Sequence<User | number | string>`. A `TypeTest` from `@fulcro/collections` already narrowed, and still does. The new type-level tests pin the rest down. What is new is accepted:

- a value typed `Constructor<R> | TypeTest<R>` can be passed directly, where before it had to be narrowed to one form first;
- `SequenceCollection#ofType` and `#cast` accept a shape test, which the `Sequence` interface they implement already did.

Code that reads the overloads themselves — `Parameters<Sequence<T>['ofType']>`, or a type built over the overload list — sees one signature where it saw three.
