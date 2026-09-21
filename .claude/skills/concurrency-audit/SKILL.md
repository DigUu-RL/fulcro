---
name: concurrency-audit
description: Audits one asynchronous or concurrent unit for the failures that survive a green suite — race windows, a bound that slips, a release skipped on throw, cancellation ignored while waiting or while executing, an unbounded queue, starvation, reentrancy, lock ordering, backpressure, ordering and duplicate work — and reports each finding with the interleaving or lifecycle sequence that demonstrates it, plus the scenario matrix rows no suite covers. Use when a change touches `packages/parallel/src`, the async sequences of `@fulcro/collections`, or any code that awaits while holding something.
allowed-tools: Read, Grep, Glob, Bash(npm run build), Bash(npx vitest run:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(node --version)
context: fork
argument-hint: '[a path, a unit name, or nothing for the async surface this branch touched]'
---

# concurrency-audit

Concurrency bugs are not found by running the code. They are found by ordering
it. A pool that releases its worker after the `await` returns is correct in
every run where nothing rejects, and the suite that proves it works proves
exactly that: one caller, no contention, no abort, no throw. The interleaving
that breaks it is the one nobody wrote a test for, and it arrives in
production, once, under load.

This skill reads one unit and enumerates the orderings. Not "does it work" —
`/verify` answers that — but **which sequence of events leaves the unit holding
something it promised to give back, past a bound it promised to keep, or
waiting for something that will never arrive.**

Its output rule is the whole discipline: **a finding states the sequence.**
Step one, step two, step three, and the state at the end. A concern with no
ordering behind it is a suspicion, and suspicions are not reported as findings
— they go in a separate section, named as unproven, with what would settle
them.

**Where it sits next to the neighbours.** `/fulcro-review` reads a diff against
every contract in the repository and asks four questions about concurrency on
the way past; this skill takes one unit and spends the whole run on it, so a
review that flags something async hands it here. `/diagnose` starts from a
failure that already happened and works back to its cause; this one starts from
code that is passing and works forward to the failure it has not had yet.
`/test-gap` reports the scenarios a unit owes tests for in general; this skill
reports the eight concurrency scenarios specifically, and hands the uncovered
ones on.

**This skill is read-only.** It reports; it does not repair, and it does not
write a test to prove a hazard. Naming the hazard and the sequence is the
deliverable.

## Invocation

The model may invoke it. It writes nothing, and its cost is reading plus at
most one existing suite run.

It is not fired after every edit. The signal is a concrete change surface:

- a diff touching `packages/parallel/src/**`;
- a diff touching `packages/collections/src/collections/async/**`;
- any code that `await`s while holding a resource — a worker, a lock, a handle,
  a listener, a queue slot;
- a new API that takes an `AbortSignal` or promises a concurrency limit.

Not on a general wish to be reassured about async code, and not on a file that
merely returns a promise. A function that awaits one call and returns its value
has no interleaving to enumerate.

## When this applies

- "Does the pool ever hand out more tasks than `workers`?"
- "What happens if the consumer stops reading halfway through `stream`?"
- "I added an `AbortSignal` to `process` — is cancellation actually honoured?"
- "Two callers hit this cache for the same key at once. Do both fetch?"
- a pull request touching `packages/parallel/src` is about to be opened.

It does not apply when:

- **Something is already failing.** That is
  `.claude/skills/diagnose/SKILL.md`, which starts from a reproduction. This
  skill is for code that passes.
- **The question is whether the checks are green.** That is
  `.claude/skills/verify/SKILL.md`.
- **The whole diff needs reviewing.** That is
  `.claude/skills/fulcro-review/SKILL.md`; it calls this one in when the async
  part needs more than four questions.
- **The question is what the concurrency costs.** A peak counted for its price
  rather than its correctness is `.claude/skills/benchmark/SKILL.md`, and a
  peak that got worse is `.claude/skills/perf-regression/SKILL.md`.
- **The answer is "write the tests".** The missing scenarios are reported here;
  writing them is `.claude/skills/implement-feature/SKILL.md`'s turn.
- **The code is synchronous.** No `await`, no callback, no timer, no worker:
  there is no interleaving, and a report saying so at length helps nobody.

## Arguments

| Argument    | What is audited                                            |
| ----------- | ---------------------------------------------------------- |
| none        | The async surface this branch changed, per `git diff`      |
| a path      | That file, and the unit it exports                         |
| a unit name | The unit, located by `Grep` and confirmed against its file |
| a package   | Every async unit in it — the expensive case, named as such |

With no argument and more than one async unit in the diff, audit the one with
the most `await` points and say the others were not read. A report covering
four units shallowly is worth less than one covering the unit that matters.

## Before starting

- **The unit is asynchronous.** It awaits, spawns, listens, or times. If not,
  say so and stop.
- **The source is readable in full.** This audit reads implementations, not
  signatures. A unit whose body is generated or lives in `dist/` cannot be
  ordered.
- **The rule is in hand.** `.claude/rules/concurrency.md` is what the unit is
  audited against, and `docs/concurrency.md` is what the library promised its
  consumers.
- **Any suite run is over built output.** The transformers load from `dist`, so
  a run without `npm run build` first measures stale code. If the build is not
  run, no suite is run either, and the report says the rows were read rather
  than executed.

## 1. Read

Named sources, in this order. Nothing recalled from memory.

| #   | Source                              | What it settles                        |
| --- | ----------------------------------- | -------------------------------------- |
| 1   | The implementation, in full         | Where the await points are             |
| 2   | Its `@types` or exported interface  | What was promised — bound, order, stop |
| 3   | Its doc comments                    | Which promises are written down        |
| 4   | Its suite under `packages/*/src/**` | Which scenarios already exist          |
| 5   | `docs/concurrency.md`               | What a consumer was told               |
| 6   | `.claude/rules/concurrency.md`      | The four invariants findings cite      |
| 7   | `docs/testing.md`, "Concurrency"    | How a peak is proven, if it is         |
| 8   | `git log -- <the file>`, recent     | Which guarantee arrived when           |
| 9   | The call sites, by `Grep`           | Whether a caller already relies on it  |

Source 3 is the one that decides half the findings. A bound the code does not
hold is a bug only if something promised it; a bound nothing promised is a
`NOTE` about an undocumented behaviour consumers will come to depend on. Read
the comment before deciding which.

## 2. Order the unit

Before any hazard is looked for, build the two lists. They are what every
finding below is written from, and a finding not traceable to them is a guess.

**The await points.** Every `await`, every `yield`, every callback handed to
something that will call it later, every timer. Each one is a place where the
world moves while this function is suspended. Number them; findings refer to
them by number.

**The held state at each point.** For each await point, what does the unit hold
that something else wants back? A worker marked busy, an entry in a map, a
counter incremented, a listener registered, a queue slot taken, a lock.

The audit is then mechanical: for each await point, ask what a second caller,
an abort, a rejection and a consumer that walks away each do to the state held
there. Four questions, one row of the model, and the hazards in `hazards.md`
are what the answers are matched against.

For a generator, add the interleaving nobody writes down: **the consumer may
never ask for the next value.** An `AsyncIterable` abandoned mid-iteration runs
its `finally` only when the iterator is returned — a `break` does this, an
abandoned `for await` in a rejected branch may not — and the state held at that
`yield` is held until it is.

## 3. The hazards

Fifteen, and `hazards.md` is each one: what it is, the code shape that carries
it, and the sequence a finding about it must state. The table is the index.

| #   | Hazard                   | The question it asks                               |
| --- | ------------------------ | -------------------------------------------------- |
| 1   | Race window              | What happens between the check and the act?        |
| 2   | Double release           | Can the same thing be given back twice?            |
| 3   | Release skipped on throw | Is it in a `finally`, or after the happy path?     |
| 4   | Cancel while waiting     | Does queued work that never started, never start?  |
| 5   | Cancel while executing   | Is work in flight told, and is the caller told?    |
| 6   | Queue growth             | Who decided the bound, and what happens at it?     |
| 7   | Starvation               | Can one caller wait forever while others proceed?  |
| 8   | Reentrancy               | What if the callback calls back in?                |
| 9   | Lock ordering            | Are two locks ever taken in two orders?            |
| 10  | Maximum concurrency      | Is the counter moved before the operation begins?  |
| 11  | Backpressure             | Does the producer pull faster than the consumer?   |
| 12  | Resource lifecycle       | Acquire, use, release — on all three paths?        |
| 13  | Error propagation        | Does every task settle, and does nothing escape?   |
| 14  | Ordering guarantees      | Which order was promised, and is it held on retry? |
| 15  | Duplicate work           | Do two callers for one key do the work twice?      |

Hazards 1, 3, 10 and 13 are the ones that survive a green suite most often, and
they are read first when the unit is large.

## 4. The scenario matrix

Eight rows. For each, the audit says whether a suite already exercises it,
where, and — when none does — what the row would catch. Coverage is read from
source 4, never assumed from a suite's name.

| Row | Scenario                   | What it exposes                       |
| --- | -------------------------- | ------------------------------------- |
| 1   | One caller                 | The happy path, and nothing else      |
| 2   | Small contention           | The bound, at rest                    |
| 3   | Heavy contention           | The bound at its peak, and starvation |
| 4   | Same-key contention        | Duplicate work, single-flight         |
| 5   | Different-key parallelism  | A lock too coarse to be needed        |
| 6   | Failure inside the section | Release on throw, and sibling fate    |
| 7   | Abort before acquisition   | Work that must never start            |
| 8   | Abort after acquisition    | Work in flight, and what is released  |

Rows 6, 7 and 8 are where the failures live, and rows 1 and 2 are what suites
usually contain. A unit covering only rows 1 and 2 is reported as such even
when every hazard above came back clean: the matrix gap is a finding of its
own, at `MEDIUM`, and `/test-gap` is named as what takes it further.

A row is "covered" only when the suite asserts the concurrent property — a peak
recorded, a task proven never to have started, a release counted. A test that
awaits two calls and checks both results exercises row 2 and proves nothing
about it. `docs/testing.md` is the standard, and it is quoted rather than
paraphrased.

## 5. Decide

### What is a finding

A finding is a hazard, a location, and **a sequence**. The sequence is ordered
steps naming the await point each one happens at, and it ends with the state
that is wrong:

```text
1. Caller A enters `process`, dispatch fills all four workers  (await point 2)
2. Worker 1 replies `failed`; `failure` is set, `notify()` wakes the loop
3. The loop throws before `delivered` reaches `pending.length`
4. `finally` terminates the pool — but the listener registered at step 1 on
   each surviving member is never removed
5. State: the next `ready()` registers a second listener on a fresh member,
   and the discarded closure still holds `finished` and `outstanding`
```

Five steps or two, it does not matter. What matters is that a reader can
replay it against the file and either agree or point at the step that is wrong.
No sequence, no finding.

### Severity

The five of `.claude/skills/fulcro-review/SKILL.md`, so that two reports can be
read side by side. There is no score and no verdict on the unit.

| Level     | Means                                                                                                                                                      |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKER` | A promise in the public documentation is broken by a sequence that needs no failure to reach it — a bound that slips under ordinary load, a deadlock       |
| `HIGH`    | A promise is broken under failure or cancellation: a release that does not run on throw, queued work that starts after an abort, a rejection nobody sees   |
| `MEDIUM`  | Unbounded growth nobody documented, a matrix row with no suite, an ordering consumers will assume and nothing states                                       |
| `LOW`     | A hazard whose window exists but whose reachable consequence is contained — a listener that outlives its run in a unit that discards the whole pool anyway |
| `NOTE`    | Behaviour worth writing down: a deliberate trade-off with no comment, a platform half untested                                                             |

### What is not a finding

- **A documented decision.** `packages/parallel/src/pool/index.ts` discards the
  whole pool when a run ends with tasks outstanding, and says in a comment why:
  a worker cannot be asked to stop mid-task, only terminated. That is an argued
  trade-off, and re-reporting it teaches the reader to skim.
- **A hazard the shape forecloses.** Single-threaded JavaScript has no
  preemption between two synchronous statements; a "race" with no await point
  between the check and the act is not one, and claiming it costs the report
  its credibility for the fourteen that are real.
- **A theoretical interleaving with no caller.** If nothing in the tree and
  nothing in the documented API can produce step one, it is a `NOTE` at most,
  and it says who would have to call what.
- **A performance observation.** A peak that is held but expensive belongs to
  `/benchmark`.

### Unproven concerns

A hazard that reading cannot settle — a callback whose reentrancy depends on a
platform detail, an ordering that depends on a worker's scheduling — goes in
its own section, as a question, with the experiment that would answer it. It is
never promoted to a finding to make the report look complete, and it is never
dropped silently either.

## 6. Change

Nothing. No edit, no test written, no assertion added, no fix applied — not
even the one-line `finally` that would obviously close a hazard. A finding is
reported with its fix described in words, and applying it is someone else's
turn, under `/implement-feature`.

One suite run is permitted, over built output, to record which matrix rows pass
today. It runs the existing suite unchanged. A suite that fails is a stop
condition, not an input to the audit.

## 7. Verify

The report is verified when every finding survives all five, and the ones that
do not are deleted before it is written:

- **The location opens.** `file:line`, taken from the file as read.
- **The sequence replays.** Each step names an await point from §2's list and a
  line that exists. A step that cannot be pointed at is the step that is wrong.
- **The promise is quoted.** The sentence from `.claude/rules/concurrency.md`,
  from `docs/concurrency.md`, or from the unit's own doc comment. A finding
  whose promise cannot be named is a `NOTE` about undocumented behaviour, not a
  broken contract.
- **The evidence was observed.** Lines as they are in the file; suite output
  only if a run happened in this session, quoted. Never a run that was not
  performed.
- **The consequence is concrete.** Who notices, and when. "The fifth task is
  dispatched while four are in flight, so a pool created with `workers: 4` runs
  five" — not "this may be unsafe".

`Audited` lists what was read. An await point in scope that was not ordered is
listed under `Not audited` with the reason, and its presence makes the status
`PARTIAL`.

## Stop

Halt and hand back when:

- **The unit is synchronous**, or has one await point and holds nothing across
  it. Say so in a line; there is nothing to enumerate.
- **A source cannot be read** — a file outside the checkout, a body only in
  `dist/`. Audit what remains and report `PARTIAL`.
- **The suite fails for a reason this audit did not cause.** Report the failure
  verbatim and stop; that is `/diagnose`'s subject, and an audit over a red
  suite is an audit over unknown code.
- **A hazard needs a change to decide.** It goes to Unproven with the
  experiment named. This skill never edits to confirm a hypothesis, and never
  writes a test to see.
- **The finding is a public surface change.** A bound that should be an option,
  a signal that should be a parameter: report it as review territory under
  `.claude/rules/api-design.md` and stop. This skill does not propose a
  signature.
- **The next step is a human's.** Push, merge, publish and discarding
  uncommitted work are refused by the hooks.
  `.claude/rules/protected-operations.md`.

## Output

The same seven sections, in this order, every run — including the run that
finds nothing.

```text
Status:    CLEAN | FINDINGS | PARTIAL | BLOCKED
Unit:      the file, the export, and the promises it makes
Model:     the await points, numbered, and what is held at each
Findings:  the table below, then a sequence per row
Matrix:    the eight rows, covered or not, with where
Unproven:  the concerns reading could not settle, and what would
Audited:   what was read; what was not, and why
```

The findings table:

```text
| # | Hazard | Where | Severity | Promise broken |
```

Below the table, one block per finding: the numbered sequence, then a sentence
on the consequence, then the fix in words. The table has no room for an
ordering, and the ordering is the point.

**When nothing is found:** `Status: CLEAN`, the model, the matrix with its
coverage, and an end. Do not pad it with hazards that do not apply to the
shape, and do not offer to audit something adjacent that was not asked for. A
clean unit with six uncovered matrix rows is still `FINDINGS` — the gap is the
finding.

**When the unit could not be ordered:** `Status: BLOCKED`, what was unreadable,
and nothing else. No hazard list produced from a signature.

## Commands

From `.claude/CLAUDE.md`'s table and `package.json`.

```sh
npm run build
npx vitest run --project parallel --configLoader native
npx vitest run --project collections --configLoader native
```

The reads:

```sh
git status --short
git diff --stat origin/dev...HEAD
git log --oneline -- <the file>
node --version
```

`npm test` builds and runs everything; this skill runs one project, because the
rest is load it does not need.

## References

- `hazards.md` — the fifteen, each with its code shape and the sequence a
  finding about it must state.
- `.claude/rules/concurrency.md` — cancellation honoured, a bound that is a
  bound, a queue somebody sized, release on every path, one shape for failure.
- `.claude/rules/testing.md` — the peak is asserted at its maximum, and
  cancellation is proven by what stopped.
- `docs/concurrency.md` — what the library promised consumers about bounds,
  order, failure and cancelling.
- `docs/testing.md` — "Concurrency: count the peak", quoted rather than
  paraphrased.
- `.claude/rules/api-design.md` — where a finding that changes a signature goes
  instead.
- `.claude/rules/protected-operations.md` — what no skill does.
- `.claude/skills/fulcro-review/SKILL.md` — the whole diff, four questions
  deep on async; it hands units here.
- `.claude/skills/diagnose/SKILL.md` — a failure that already happened.
- `.claude/skills/test-gap/SKILL.md` — where the uncovered matrix rows go.
- `.claude/skills/benchmark/SKILL.md` — what the concurrency costs.
- `.claude/skills/implement-feature/SKILL.md` — who applies a fix.
- `tools/claude/skill-evals/concurrency-audit.eval.json` — these examples as
  data.

## Examples

**Use this skill when:**

- "Can the pool ever run more than `workers` tasks at once?"
- "I added an `AbortSignal` to the streaming path — is cancellation honoured
  while a worker is mid-task?"
- "This branch touches `packages/parallel/src/pool`; read it before I open the
  pull request."
- "Two callers ask for the same key at the same time. Does the work happen
  twice?"

**Do not use this skill when:**

- "The parallel suite fails intermittently on CI." That is `/diagnose`: there
  is a failure to start from.
- "Is the tree green?" That is `/verify`.
- "How much does a pool of eight cost over a hundred thousand elements?" That
  is `/benchmark`.
- "Write the abort-after-acquisition test." That is `/implement-feature`, from
  this report's matrix.
