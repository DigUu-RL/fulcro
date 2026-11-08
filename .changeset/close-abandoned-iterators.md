---
'@fulcro/collections': patch
---

`any()` with no condition, `sequenceEqual` and `zip` now close the iterators they
open by hand when they stop before the end, in both the synchronous and the
asynchronous sequence. A generator behind one of them — a file being read, a
connection, a lock — used to be left suspended with its `finally` block never
run; it is now returned, as every other operator already did. Nothing about the
results, the number of elements read or the order of the calls changes.
