---
paths:
  - packages/collections/src/**/*.ts
---

# Laziness is the product, not an implementation detail

**Scope:** `packages/collections/src/**/*.ts`

A consumer picks `@fulcro/collections` over an array chain for one reason: the
work that was never needed is never done. Every operator either keeps that
promise or quietly removes the reason the package exists, and it removes it
without failing a behaviour test — the elements come back correct either way.

## Nothing is pulled until it is asked for

Building a sequence does no work. `map` over a source of a million elements and
then taking three pulls three, plus whatever the operator's own lookahead
genuinely requires. An operator that walks its source while being constructed
has turned a description of work into the work itself.

The projection is the same story. A projection is invoked once per element that
is actually produced, never per element inspected and discarded, and never
twice for one element unless the operator's documentation says it caches.

## The source is traversed once

A second pass over the source is a change of complexity class, and it is
invisible from the outside when the source is an array. It is not invisible
when the source is a generator, a file or a network stream — there, the second
pass is either wrong or impossible.

Where an operator needs a value more than once, it holds the value, not a way
of fetching it again.

## Streaming and buffering are different operators

`map`, `filter`, `take` and `takeWhile` are streaming: memory is bounded by one
element, whatever the source's size. `sort`, `groupBy`, `reverse` and
`toArray` are buffering: they hold the source, and that is the honest cost of
what they compute.

Never make a streaming operator buffer. A buffer inserted for convenience —
materialising a source to index into it, collecting to count — converts a
bounded-memory promise into an unbounded one, and the suite that would notice
is the one counting elements pulled.

Where a buffering step is genuinely needed, it is named in the documentation
and it is the operator's whole reason for existing.

## Termination propagates

A consumer that stops pulling stops the whole chain. `return()` on the
underlying iterator runs, generators unwind, and an operator holding a resource
releases it. An operator that ignores early termination leaves a file handle
open for as long as the process lives, and no behaviour test will say so.

## Caching is an algorithmic decision, with evidence

A key computed once per element and compared many times is worth caching; a key
computed once and used once is not, and the map holding it is pure overhead.
Cache where the comparison count justifies it, say so in a comment, and prove
it by counting invocations — `docs/testing.md` on what counts as evidence.
