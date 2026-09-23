---
paths:
  - packages/parallel/src/**/*.ts
  - packages/collections/src/collections/async/**/*.ts
---

# Concurrency promises are kept under failure, not only under success

**Scope:** `packages/parallel/src`, the async sequences of
`@fulcro/collections`, and any concurrency package that follows them

Every bug in this area looks the same from the outside: the happy path passes,
and the promise breaks the first time something rejects, something is
cancelled, or the producer is faster than the consumer. The rules below are
what the code owes; `testing.md` is how the suites prove it.

## Cancellation is explicit and it is honoured

A long-running operation takes an `AbortSignal`, or it cannot be stopped. There
is no ambient cancellation and no timeout that quietly abandons work still
running in the background.

Honoured means three things: work not yet started never starts, work in flight
is told, and the caller learns that the result is a cancellation rather than a
value. A pool that stops handing out queued tasks while its workers run to
completion has not been cancelled, it has been slowed down.

## A bound is a bound

Where an API promises a concurrency limit, the number of operations in flight
never exceeds it — not while errors are being handled, not while the queue is
draining, not for the one extra task started before the counter was
incremented. The counter changes before the operation begins, not after it
resolves.

## The queue has a size, and somebody decided it

An unbounded queue turns a fast producer into a memory leak that only appears
under load. An async sequence pulling from a source faster than its consumer
takes elements is exactly that shape. Either apply backpressure — do not pull
until there is somewhere to put the result — or state the bound and what
happens when it is reached.

## Release runs on every path

A worker returned to the pool, a lock released, a handle closed, a listener
removed: each happens on success, on failure and on cancellation. `finally`, or
a `using` binding, not a line at the end of the happy path.

A lock acquired outside a `try` is a lock that leaks the first time the body
throws, and the process then deadlocks somewhere else entirely — the stack
trace points at the second caller, never at the one that dropped it.

## Failure has one shape

One task rejecting does not leave the pool holding a worker, and does not
silently cancel the siblings unless the API says it does. Say which it is,
settle every task one way or the other, and never let a rejection escape into
an unhandled promise — in Node that ends the process, and in a browser it ends
nothing and is never seen.
