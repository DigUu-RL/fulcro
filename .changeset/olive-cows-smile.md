---
'@fulcro/collections': minor
---

The shaping operators reach the asynchronous sequence: `choose`, `ofType`,
`cast`, `topBy` and `tap`, plus `chooseAwait` and `topByAwait`.

They are written for streams rather than adapted from the synchronous ones. The
plain forms pull one element at a time, so back pressure is intact; the `Await`
forms overlap the waiting with a bounded concurrency.

`cast<T>()` is the reason this matters. Untrusted data usually arrives
asynchronously, and the synchronous path meant collecting all of it first:

```ts
const orders = AsyncSequenceCollection.from(paginatedOrders()).cast<Order>();
```

It refuses at the element that failed, so a bad page is caught without the rest
of the feed being fetched. Interfaces are written out as checks here exactly as
they are on the synchronous sequence.

`topBy` ranks a stream without collecting it: what it holds is bounded by
`count`, not by the length of the source. `topByAwait` extracts keys
concurrently, and ties still break on arrival — recorded before the keys are
extracted, since concurrent work finishes in an order that has nothing to do
with the input.
