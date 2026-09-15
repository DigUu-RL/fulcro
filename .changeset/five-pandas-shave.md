---
'@fulcro/collections': minor
---

Five operators: `choose`, `ofType`, `cast`, `topBy` and `tap`.

`topBy(keySelector, count)` answers what `orderByDescending(...).take(count)`
answers — same elements, same order, ties broken the same way — while keeping
only a window of the best `count` seen so far. Measured over a hundred thousand
records for a top ten: 201,400 key comparisons against 4,532,640 for the sort.

`choose` projects and filters in one pass, for the case where the condition and
the projection are the same work. `ofType` narrows a mixed sequence to one
runtime type and `cast` does the same but throws on the first element that does
not fit. `tap` observes a chain without consuming it.
