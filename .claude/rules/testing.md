# A feature is behaviour plus the cost of that behaviour

**Scope:** every `*.spec.ts` under `packages/*/src`, and `tests/**`

`docs/testing.md` is the full standard and the place to settle a detail. What
follows is the part a session gets wrong without it in front of them.

## Two suites, or the feature is unfinished

Every feature carries a behaviour suite **and** a performance suite. The first
says the result is right; the second says the result was arrived at the way the
API promises. A lazy sequence that returns the correct five elements after
walking a million of them passes the first and breaks the promise consumers
chose the library for.

One file per utility, tests included. Never group specs by theme: a file named
for a behaviour collects the utilities that happen to share it today and hides
which one is uncovered tomorrow.

## Performance is counted, never timed

A performance assertion counts work: elements pulled from the source,
projections invoked, comparisons made, tasks handed to a worker. Instrument the
input — a generator that increments a counter as it yields — and assert on the
number.

The clock is allowed in two places only: a ratio measured against a baseline
taken in the same run on the same machine, and a smoke ceiling generous enough
that only a change of complexity class can cross it. A bare duration asserts
something about the machine that ran it, which is why CI and a laptop disagree
about it.

## The data has the shape the code will meet

A performance suite over ten sorted integers measures nothing. Size the input
so the behaviour under test can actually appear — enough elements for the
algorithm's cost to separate from the harness's, keys that collide, an ordering
that is not already sorted, a projection that is not free.

## Concurrency is asserted at the peak

A concurrency limit is proven by recording how many operations were in flight
at once — increment on entry, decrement on exit, assert on the maximum — not by
how long the whole run took. Cancellation is proven by what stopped: the task
that never started, the cleanup that ran. See `concurrency.md` for what the
code owes these suites.

## Where a suite lives decides what it proves

A suite under `packages/*/src` runs with the transformers applied and the
package's `@/*` alias resolved, and proves the feature. A suite under `tests/`
runs against built output without the transformers, and proves what a consumer
gets before wiring anything up. The two are not interchangeable, and a test
moved between them quietly stops asserting what it was written for.

Never enable Vitest's `fsModuleCache`. It keys on source content, and the
transformer rewriting that content lives in this repository, so a broken
transformer goes on passing against cached output.
