# The fifteen hazards

`SKILL.md` §3 indexes these; this file is each one. Three lines per hazard:
**what it is**, **the shape that carries it** — what to `Grep` for and what to
read around it — and **the sequence** a finding about it must state, as a
template to fill with the unit's own await point numbers.

The shapes are written against the code this repository actually has:
`packages/parallel/src/pool/index.ts`, the async sequences of
`@fulcro/collections`, and anything that awaits while holding something. A
hazard whose shape is absent from the unit is not reported as absent — it is
simply not a finding.

---

## 1. Race window

**What.** A check and the act it authorises, with an await point between them.
The world moves while the function is suspended, and the answer the check gave
is stale when the act runs.

**Shape.** Any `if` whose condition reads mutable state, followed — even many
lines later — by an `await` and then a write to that same state. `??=`,
`counter++`, `map.set` after an await, a `has` followed by a `get`. The read
and the write need not be adjacent; the await between them is the whole bug.

**Sequence.**

```text
1. A reads <state> and finds <value>            (await point N)
2. A suspends at <the await>
3. B runs, and changes <state> to <other value>
4. A resumes and acts on <value>, which is no longer true
5. State: <what is now wrong>
```

Single-threaded JavaScript forecloses this between two synchronous statements.
If there is no await point between the check and the act, there is no finding —
`SKILL.md` §5 says why claiming one is expensive.

## 2. Double release

**What.** The same resource given back twice: a worker returned to the pool on
both the completion path and the cleanup path, a handle terminated in `finally`
and again in `close`, a listener removed twice, a slot freed by two branches.

**Shape.** More than one site writing the release — `busyWith = null`,
`.delete(`, `.terminate()`, `release()`, `resolve()` — for one acquisition.
Read every path out of the block, not only the one the happy case takes. A
release under both `catch` and `finally` is the classic pair.

**Sequence.**

```text
1. A acquires <resource>                        (await point N)
2. <path one> releases it
3. <path two> runs for the same acquisition and releases it again
4. State: the resource is handed to two callers, or the counter goes negative
```

A release guarded by a flag that the second path also reads is hazard 1, not
this one; say which.

## 3. Release skipped on throw

**What.** The release is the last line of the happy path rather than the body
of a `finally`, so the first rejection leaks it. `.claude/rules/concurrency.md`
names the consequence: the deadlock surfaces at the next caller, and the stack
trace never points at the one that dropped it.

**Shape.** An acquisition outside a `try`, or a `try` whose release sits in the
block rather than in `finally`. Grep the unit for its acquire verbs and check
each one has a `finally` between it and every `return`, `throw` and `yield`.
An `await` inside `finally` that can itself reject is the second half of this
hazard.

**Sequence.**

```text
1. A acquires <resource>                        (await point N)
2. <the awaited call> rejects
3. The release at <line> is never reached
4. State: <resource> is held forever; the next caller waits on it
```

This is the hazard that most often survives a green suite, because no suite row
except matrix row 6 ever makes step 2 happen.

## 4. Cancellation while waiting

**What.** An abort that arrives before the work starts must mean the work never
starts. A pool that stops handing out queued tasks but lets its workers finish
has been slowed down, not cancelled.

**Shape.** `signal.throwIfAborted()`, `signal.aborted`, `addEventListener('abort'`
— and where they are **not**: in the dispatch loop, before the post, at the top
of the wait. A signal read once before a loop and never again inside it is this
hazard.

**Sequence.**

```text
1. N elements are queued; M are dispatched      (await point N)
2. The caller aborts while the remaining N−M wait
3. <the dispatch site> is reached again and posts element M+1
4. State: work started after the abort, and the caller believes it stopped
```

## 5. Cancellation while executing

**What.** Work already in flight, at the moment of the abort. Three things are
owed: it is told, the caller learns the result is a cancellation rather than a
value, and whatever it held is released. A worker that cannot be interrupted is
terminated instead — and that choice is stated, not implied.

**Shape.** The `finally` of a generator, the `catch` around
`throwIfAborted()`, the path that runs when `outstanding.size > 0`. Read what
happens to in-flight entries, and whether the caller receives an abort error or
a truncated result.

**Sequence.**

```text
1. A dispatches <element> to <worker>           (await point N)
2. The caller aborts
3. <what happens to the in-flight element>
4. State: the caller received <value or error>, and <resource> is <held or freed>
```

A truncated result returned as if complete is the worst version of this and is
a `BLOCKER`: the caller cannot tell a cancelled run from a short one.

## 6. Queue growth

**What.** An unbounded queue is a memory leak that only appears under load. The
bound exists and is documented, or the growth is the finding.

**Shape.** An array or map that is pushed to from one path and drained by
another: `pending`, `finished`, `outstanding`, a buffer in an async operator.
Ask who limits its length. `[...items]` materialising an iterable up front is a
bound of a different kind — the whole input in memory — and is a `NOTE` when
the documentation says so and a `MEDIUM` when it does not.

**Sequence.**

```text
1. The producer adds to <queue> at <line>       (await point N)
2. The consumer drains it at <line>, one per <what>
3. With <a realistic producer>, step 1 outpaces step 2
4. State: <queue> grows to <what bounds it — nothing>
```

## 7. Starvation

**What.** One caller waits while others proceed, indefinitely. Not slowness: a
caller whose turn never arrives under a load pattern that does not end.

**Shape.** A wake-up that resolves a single stored continuation rather than a
queue of them — `wake = resolve` overwritten by a second waiter is the shape
— a `for` loop that always starts from index zero, a priority that has no
ageing, a retry that goes to the back of a queue it can never reach the front
of.

**Sequence.**

```text
1. A waits at <the wait point>                  (await point N)
2. B arrives and overwrites/precedes A at <line>
3. <the wake> resolves B; A's continuation is <dropped or still queued>
4. State: with B's pattern repeating, A waits forever
```

## 8. Reentrancy

**What.** A callback that calls back into the unit before the first call has
finished. The state the unit was in the middle of changing is observed
half-changed, or changed twice.

**Shape.** Any user-supplied function invoked while the unit holds a mutable
invariant: a projection inside a lock, a listener that can be triggered
synchronously from within `post`, an `onResult` that the consumer may use to
enqueue more work. Ask what happens if that function calls the unit's own
exported API.

**Sequence.**

```text
1. The unit takes <invariant> and calls <the user function>   (await point N)
2. That function calls <the exported API> again
3. The second call observes <state> mid-change
4. State: <what breaks — a double dispatch, a bound exceeded, a lost entry>
```

## 9. Lock ordering

**What.** Two mutual exclusions taken in two different orders by two paths.
Each holds one and waits for the other, and neither proceeds.

**Shape.** Two of anything exclusive acquired in one function — two keyed
entries in a map of promises, a per-key lock plus a global one, a worker plus a
buffer slot. Then the second path that takes them the other way round. A single
lock cannot deadlock against itself unless it is also hazard 8.

**Sequence.**

```text
1. A takes <lock X>, then awaits <lock Y>       (await point N)
2. B takes <lock Y>, then awaits <lock X>       (await point M)
3. State: neither resumes; both callers hang
```

State the two orders explicitly. A deadlock asserted without both paths named
is unproven, and goes in that section.

## 10. Maximum concurrency

**What.** Where the API promises a limit, the number in flight never exceeds
it — not while errors are handled, not while the queue drains, and not for the
one extra task started before the counter moved. `.claude/rules/concurrency.md`
puts it in one line: the counter changes before the operation begins.

**Shape.** The increment relative to the dispatch. `handedOut++` before `post`
holds; a counter incremented in the promise's `then` does not. Check the error
path too: a bound enforced by "free workers" needs the worker to be marked busy
synchronously, in the same tick as the post.

**Sequence.**

```text
1. <limit> operations are in flight             (await point N)
2. <the event that frees capacity — a reply, a rejection>
3. <the dispatch site> runs before <the counter moves>
4. State: <limit + 1> in flight, and the suite never recorded a peak
```

A bound is proven at its peak, never by a total: `docs/testing.md`,
"Concurrency: count the peak". If the suite asserts a total, matrix row 3 is
uncovered regardless of what the test is called.

## 11. Backpressure

**What.** The producer pulls faster than the consumer takes, and the difference
accumulates. An async sequence reading from a source at its own pace is exactly
this shape.

**Shape.** A `for await` that pushes into an array which something else reads,
a prefetch of any depth, a generator that starts the next fetch before yielding
the current value. The question is whether the pull is gated on somewhere to
put the result.

**Sequence.**

```text
1. The consumer takes one element per <slow thing>   (await point N)
2. The producer pulls the next at <line>, ungated
3. State: <what accumulates>, bounded by <nothing / the source>
```

Either the pull waits, or the bound is stated with what happens at it. Both are
acceptable; silence is not.

## 12. Resource lifecycle

**What.** Acquire, use, release — on success, on failure and on cancellation.
The audit's completeness check over hazards 2, 3 and 5: every acquisition in
the unit is matched, on all three paths.

**Shape.** List the acquisitions — worker spawned, listener registered, entry
added, timer set, handle opened — and walk each of the three exits for each.
The listener is the one that is forgotten, because nothing fails when it
outlives its run; it merely keeps the closure alive.

**Sequence.** The table, not a narrative:

```text
| Resource | Acquired at | Success | Failure | Cancellation |
```

A cell that is empty is the finding, and its sequence is hazard 3's.

## 13. Error propagation

**What.** Every task settles one way or the other; one rejection does not leave
the unit holding a resource, does not silently cancel siblings unless the API
says it does, and never escapes as an unhandled rejection — which ends the
process in Node and is never seen in a browser.

**Shape.** `??=` on a failure slot — the first error wins and the rest are
discarded, which is a decision that must be documented. A promise created and
not awaited. A rejection stored to be thrown later, whose `catch` handler is
attached in a subsequent tick. `Promise.all` where one rejection abandons the
others still running.

**Sequence.**

```text
1. <task A> rejects at <line>                   (await point N)
2. <what happens to tasks B..N>
3. <what the caller receives, and when>
4. State: <resources held>, <errors lost>, <unhandled rejections>
```

## 14. Ordering guarantees

**What.** Which order the results arrive in, and whether the code holds it on
every path — including after a retry, a failure, or a slow element.
Completion order and input order are different promises; the unit makes one.

**Shape.** Results written by index (`collected[position] = value`) keep input
order; results yielded as they arrive do not. Read the doc comment: whichever
it promises, the other path must not quietly produce it. A `shift()` from a
buffer filled out of order is completion order even when it looks sequential.

**Sequence.**

```text
1. Elements 1..N are dispatched                 (await point N)
2. Element <k> finishes before element <j <k>
3. <what the consumer observes>
4. State: the documented order is <X>, the observed order is <Y>
```

## 15. Duplicate work

**What.** Two callers asking for the same thing at the same time, and the work
happening twice. Not a correctness bug in itself — it becomes one when the work
has effects, and it is always a cost.

**Shape.** A cache or map whose entry is written **after** the await that
produces it rather than before: the in-flight promise itself must be what is
stored, or the second caller finds nothing and starts again. This is hazard 1
with a specific fix, and it is reported as its own finding because the fix is
named: store the promise, not the value.

**Sequence.**

```text
1. A asks for <key>, finds no entry, starts the work   (await point N)
2. B asks for <key> before A's entry is written
3. B finds no entry and starts the work again
4. State: the work ran twice; <the effect it had> happened twice
```

Where the unit is keyed, matrix rows 4 and 5 are the pair that settles it: same
key must collapse, different keys must not serialise.

## References

- `SKILL.md` — the audit these are the catalogue for.
- `.claude/rules/concurrency.md` — the four invariants a finding cites.
- `docs/concurrency.md` — what consumers were promised about bounds, order,
  failure and cancelling.
- `docs/testing.md` — "Concurrency: count the peak", and why a total is not a
  peak.
