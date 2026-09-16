---
'@fulcro/collections': minor
---

Thirty-three operators reach the asynchronous sequence.

**Terminals**: `sum`, `average`, `min`, `max`, `minBy`, `maxBy`, `contains`,
`single`, `singleOrNull`, `elementAt`, `sequenceEqual`, `countBy`, `toMap`,
`toLookup`, `standardDeviation`, `sampleStandardDeviation`.

**Deferred**: `append`, `prepend`, `defaultIfEmpty`, `pairwise`, `windowed`,
`takeLast`, `skipLast`, `groupAdjacent`, `zip`, `except`, `exceptBy`,
`intersect`, `intersectBy`, `union`, `unionBy`, `join`, `groupJoin`.

They are written for streams rather than delegated to the synchronous ones. The
terminals that can stop do — `contains` leaves the source where it found the
value, `single` at the second element, `sequenceEqual` at the first difference.
The windows hold a window: `windowed`, `pairwise`, `skipLast` and
`groupAdjacent` all yield over an endless source. The set operations and joins
read their **argument** whole, never the sequence they are called on, and a join
indexes the inner side once rather than scanning it per element.

`standardDeviation` accumulates each value as it arrives instead of collecting
them to find a mean and revisiting them, which also keeps it accurate on values
far from zero where the textbook formula loses precision to cancellation.

**Six are deliberately absent**: `orderBy`, `orderByDescending`, `reverse`,
`groupBy`, `median` and `percentile`. Each must hold the entire source before it
can produce anything, and offering them here would be a memory trap wearing an
ordinary operator's clothes. Reach for `toArray()` and the synchronous sequence,
where holding everything is visible in the code.

One consequence worth knowing: `groupAdjacent` and `groupJoin` hand back the
same `Group` and `Sequence` their synchronous counterparts do, so a bundle
importing only `@fulcro/collections/async` now carries the synchronous sequence
as well.
