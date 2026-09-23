---
name: test-gap
description: Derives the scenarios a unit of code owes tests for — from its implementation, its public signature, its documentation and its roadmap spec — compares them against the suites that exist, and reports the missing ones ranked by what they would catch. Use when asked what is untested, before writing tests for something, or when a feature is about to be called finished.
allowed-tools: Read, Grep, Glob, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git merge-base:*)
context: fork
argument-hint: '[path | package | feature id | nothing for the working tree]'
---

# test-gap

Coverage says which lines ran. It does not say which behaviours were asserted,
and the two are barely related here: a lazy operator whose every line executes
under one `toEqual` has been run, not tested. What is missing from these suites
is almost never a line — it is a scenario nobody thought of. The empty source.
The second traversal. The abort that arrives while the pool is waiting rather
than while it is working. The call the transformer stopped recognising, which
the runtime fallback then answers correctly enough that no test notices.

So this skill derives the scenarios rather than measuring the lines. It reads
what the code does, what its signature promises, what the documentation claims
and what the roadmap asked for, enumerates what each of those obliges the suite
to assert, and subtracts what is already asserted. What is left is the report.

**This skill is read-only.** It writes no test, edits no spec, runs no suite.
A gap it reports is written in an ordinary implementation turn with the report
in hand.

**Where it sits next to `/fulcro-review`.** The review reads a diff and reports
a missing performance suite as one finding among many, because the two suites
are a contract. This skill takes one unit and enumerates the scenarios inside
those suites — it is what the review's finding hands off to.

## Invocation

The model may invoke it. It changes nothing, runs nothing and costs reading
time.

The signal is a unit of code and a question about its assertions: what is
untested, what tests to write next, whether a feature is finished. Not after
every edit — mid-implementation the suites are deliberately incomplete, and
enumerating the gaps in an unfinished feature reports the parts that are
unfinished.

`context: fork` is set: the scenario list is the only thing the parent session
needs back, and everything this skill reads it reads from the tree. What a fork
loses is the session's account of what was already decided — a scenario ruled
out as unobservable, a case the user said they would take separately. Where
that matters, say it in the invocation.

## When this applies

- "What is untested in `@fulcro/parallel`?"
- "I am about to write tests for the async sequence operators — what are the
  cases?"
- "Is `takeWhile` finished?" where finished means both suites carry it;
- a feature spec under `.roadmap/features/` lists behaviour that no assertion
  names;
- `/fulcro-review` reported a missing suite and the next question is what goes
  in it.

It does not apply when:

- **The request is whether the checks pass.** That is
  `.claude/skills/verify/SKILL.md`, which runs them.
- **A test is failing.** One failure with a location is
  `.claude/skills/diagnose/SKILL.md`. A gap is something that never ran; a
  failure is something that ran and disagreed.
- **The request is to write the tests.** This skill produces the list;
  `.claude/skills/implement-feature/SKILL.md` owns writing them, and the two
  suites are part of what it builds.
- **The request is to review a change.** That is
  `.claude/skills/fulcro-review/SKILL.md`, which reads a diff against every
  contract rather than one unit against its scenarios.
- **The unit does not exist yet.** A scenario list for unwritten code is a
  specification, and `.roadmap/features/` is where those live.

## Arguments

| Argument       | What is enumerated                                      |
| -------------- | ------------------------------------------------------- |
| none           | Every unit touched by the working tree and this branch  |
| a path         | That file, or every source file under that directory    |
| a package name | That package's public surface, entry point outward      |
| a feature id   | The unit or units that `.roadmap/features/` spec names  |
| `deep <path>`  | That unit alone, every catalogue in §2.2 worked in full |

A bare invocation is the common case and is bounded by the diff. `deep` is for
a single operator or class that is about to be called finished, where the point
is completeness rather than triage.

## Before starting

- There has to be a unit to read. With no argument, `git status --short` and
  `git diff --stat main...HEAD`; if both are empty, say so and ask which unit,
  rather than picking one.
- The skill reads source and specs, never `dist/`. No build is required and
  none is run.
- No suite is executed, so no report here says a test passes or fails. A claim
  about a result belongs to `/verify`.
- Nothing is stashed or committed to get a cleaner view.

## 1. Read

Seven sources, in this order, because each constrains what the next can claim.
Every one is named; nothing is recalled from memory.

| #   | Source                                        | What it settles                        |
| --- | --------------------------------------------- | -------------------------------------- |
| 1   | The implementation file, in full              | What the code actually branches on     |
| 2   | The exported signature and its doc comment    | What a consumer was promised           |
| 3   | The `docs/` page covering it                  | What the documentation claims out loud |
| 4   | `.roadmap/features/<id>.md`, where one exists | What the feature was asked to do       |
| 5   | Every spec that names the unit                | What is already asserted               |
| 6   | `package.json` of the package, `exports`      | Which entry points a consumer reaches  |
| 7   | `vitest.config.mts`                           | Which project a given spec runs under  |

Read the whole implementation, not the export. A gap is usually a branch — an
early `return`, a `catch`, a `finally`, a fast path for an array that a
generator never takes — and a branch is invisible from the signature.

Find the existing assertions by searching rather than by guessing at a path.
The suites of this repository sit under each package's `src/`, and are found by
what they name:

```sh
rg -l 'takeWhile' --glob '*.spec.ts' --glob '*.spec.mts'
rg -n 'describe\(|it\(' packages/collections/src/tests/async/concurrency.spec.ts
```

A unit with no spec anywhere is not a finding to be inferred from a failed
search: name the search that came back empty, in the report.

## 2. Decide

### 2.1 What counts as a gap

A reported gap needs three things, and a candidate missing any of them is
dropped rather than softened:

- **An observable** — a value returned, a counter incremented, an error thrown,
  a call not made. A requirement with no observable is not a missing test; it
  is an unobservable requirement, and §2.4 says what happens to it.
- **A trigger** — the input, the sequence of calls or the platform that reaches
  it. "Behaves correctly under load" names no trigger.
- **A consequence** — what ships broken if nobody asserts it. This is what the
  ranking in §2.3 is computed from.

Each gap also states **which suite it belongs to**: a behaviour suite or a
performance suite, and under `packages/*/src` or under `tests/`. Those are not
interchangeable — `.claude/rules/testing.md` is explicit that a suite under
`tests/` runs against built output without the transformers and proves a
different thing. A gap filed against the wrong one is a gap that gets closed
without being closed.

### 2.2 The catalogues

Work every catalogue that applies to the unit. A unit matching two is worked
under both.

**Every unit** — whatever else it is

1. The happy path, with the shape the code will actually meet.
2. Each branch the implementation takes, named by the condition that reaches
   it.
3. Each documented claim in the doc comment and the `docs/` page, as an
   assertion. A claim nobody asserts is documentation with no test behind it.
4. Each way the unit can fail, and that the thrown error names the operation,
   the value and what was expected — `.claude/rules/general.md` asks for that
   text, and only a test reads it.
5. What the call infers. A signature that returns `Sequence<unknown>` where it
   returned `Sequence<User>` breaks every consumer with no runtime test
   failing; the assertion is a type-level one, and its absence is its own gap.

**Collections** — `packages/collections/src`

| Scenario          | What it catches                                                         |
| ----------------- | ----------------------------------------------------------------------- |
| empty source      | A reduction with no seed, an off-by-one in the first pull               |
| singleton         | A pairwise operator that assumes a second element                       |
| duplicate values  | A keyed operator that silently collapses or silently keeps              |
| large volume      | A cost that only separates from the harness at scale                    |
| lazy / no pull    | Construction doing work: built, never consumed, count is 0              |
| early termination | `return()` on the source, generators unwound, work stopped              |
| bounded memory    | A streaming operator that acquired a buffer                             |
| one traversal     | A source walked twice — invisible over an array, wrong over a generator |
| projection count  | The projection invoked once per element produced                        |
| iterator failure  | A source that throws mid-iteration, and what is released                |

`.claude/rules/collections-performance.md` is what each of these is owed to,
and the counted assertion — elements pulled, projections invoked — is how they
are asserted. Never the clock.

**Async and concurrency** — `packages/parallel`, and the async sequences under
`packages/collections/src/collections/async`

| Scenario              | What it catches                                            |
| --------------------- | ---------------------------------------------------------- |
| abort before start    | Work that starts anyway because the signal was read late   |
| abort while waiting   | A queued task that never learns it was cancelled           |
| abort during work     | In-flight work not told, and a caller not told either      |
| producer failure      | A source that rejects, and what the consumer sees          |
| consumer failure      | A consumer that throws, and whether the producer is closed |
| peak concurrency      | The limit held while errors settle and the queue drains    |
| ordering              | Whether the order the API promises survives concurrency    |
| release under failure | A worker, lock, handle or listener released on every path  |

A concurrency limit is proven at its peak — in-flight counted on entry and
exit, maximum asserted — not by how long the run took.
`.claude/rules/concurrency.md` is what the code owes these.

**Transformers** — a `transformer/` or `unplugin/` directory

| Scenario           | What it catches                                           |
| ------------------ | --------------------------------------------------------- |
| supported syntax   | Each call shape the matcher claims, one fixture each      |
| unsupported syntax | A shape it must decline, and the diagnostic it emits      |
| foreign symbol     | A call of the same name from another package, not claimed |
| compile output     | What is emitted, asserted as output rather than inferred  |
| runtime fallback   | What a consumer gets with no transformer wired up         |
| path segments      | Backslashes and forward slashes both matched              |

`.claude/CLAUDE.md` requires fixtures or tests beside a transformer change, and
notes that the matcher compares path segments — which is why the platform half
is a scenario and not a detail. `tests/transformers/coexistence.spec.mts` is
where the two plugins walking one tree together is asserted.

**Entry points** — a change to an `exports` map, or a new public symbol

| Scenario           | What it catches                                             |
| ------------------ | ----------------------------------------------------------- |
| every exports path | A path in the map resolving to a file that is not in `dist` |
| declarations       | A `.d.ts` that fails to resolve, so a consumer sees `any`   |
| no transformer     | The runtime fallback a consumer meets before wiring up      |

These belong under `tests/`, against built output.
`tests/entrypoints.spec.mts` is the suite they join.

### 2.3 Ranking

Ranked by what the gap lets ship, not by how easy the test is to write. Five
levels and no others; there is no score and no coverage percentage.

| Level     | Means                                                                                                                 |
| --------- | --------------------------------------------------------------------------------------------------------------------- |
| `BLOCKER` | A public promise with no assertion at all: an exported symbol no spec names, an entry point nothing imports           |
| `HIGH`    | A silent failure: a lost inference, laziness unasserted, cancellation unasserted, a transformer shape unfixtured      |
| `MEDIUM`  | A real behaviour a consumer would meet: a boundary, a documented claim, an error whose message nothing reads          |
| `LOW`     | A case unlikely to reach a consumer, or one a neighbouring assertion nearly covers                                    |
| `NOTE`    | Something the reader should know: a scenario deliberately not tested, a platform half CI covers and a laptop does not |

**A feature missing a whole suite outranks a feature missing a case.** A unit
with behaviour tests and no performance suite is unfinished by
`.claude/rules/testing.md`, and that is reported as one `HIGH` naming the
absent file, not as fifteen `MEDIUM` scenarios inside it.

**Duplicates collapse.** The same missing scenario across six operators is one
gap with the six locations and a count.

### 2.4 Missing test, or unobservable requirement

The distinction the report turns on, and the one a session gets wrong by
reporting everything it could imagine asserting.

A requirement is **unobservable** when no test could tell the two outcomes
apart from outside the unit: a private helper's shape, an internal ordering no
API promises, a cache whose only effect is one the documentation says nothing
about, a platform the checkout cannot run. Those go in their own section of the
report, named, with why — never as gaps, and never as a suggestion to export
something so it can be tested.

A requirement that is only awkward to observe is **not** unobservable. Laziness
looks unobservable until the source is a counting generator; bounded memory
looks unobservable until the buffer is the thing counted. Instrument the input
before concluding that nothing can see it.

And a scenario the repository has already argued through — a documented
exception, a case a spec says in words it does not cover and why — is not a
gap. Re-reporting a written-down decision teaches its reader to skim.

## 3. Change

Nothing. No spec written, no spec edited, no `describe` added, no suite run,
no coverage tool invoked. A gap whose test is four lines is reported with those
four lines described in words, and writing it is someone else's turn.

## 4. Verify

The report is verified when each gap survives all four:

- **The unit opens.** `file:line` for the implementation the gap is about,
  taken from the file as read.
- **The absence was searched for, not assumed.** The search that came back
  empty is named — the pattern and the globs — because a gap that exists only
  because the spec was filed under a name nobody grepped for is a false report,
  and a false report is what gets an audit switched off.
- **The scenario has its three parts.** Observable, trigger, consequence, from
  §2.1. A gap that cannot state its observable is moved to §2.4 or deleted.
- **The destination is named.** The suite the test joins, by path, and whether
  it is a behaviour or a performance assertion.

`Read` lists what was read. A unit in scope that was not read is listed under
`Not read` with the reason, and its absence makes the status `PARTIAL`.

## Stop

Halt and hand back when:

- **There is nothing in scope** — an empty diff and no argument, or an argument
  naming a path with no source under it. Ask which unit; do not choose one.
- **A source cannot be read** — a file outside the checkout, a spec that does
  not parse. Say which, enumerate what remains, report `PARTIAL`.
- **The unit's intended behaviour cannot be established.** No doc comment, no
  documentation page, no feature spec, and an implementation whose branches
  admit more than one reading. Report what was established and ask; a scenario
  list invented against a guess at the intent is worse than none.
- **The answer is that the unit is untestable as written.** That is a design
  finding, reported as one, and changing the design to suit a test is not this
  skill's to propose in code.
- **The next step is a human's.** Push, merge, publish and discarding
  uncommitted work are refused by the hooks —
  `.claude/rules/protected-operations.md`.

## Output

The same six sections, in this order, every run — including the run that finds
nothing.

```text
Status:       COMPLETE | GAPS | PARTIAL
Read:         the units read, and the specs searched for each
Not read:     anything in scope that was not read, with why
Gaps:         the table below, ordered BLOCKER first
Detail:       one paragraph per gap — observable, trigger, consequence, destination
Unobservable: the requirements no test can see, each with why
```

The table:

```text
| # | Rank | Unit | Scenario | Suite | Destination |
```

`Suite` is `behaviour` or `performance`. `Destination` is the spec file the
test joins — an existing path, or the path it would have if the file does not
exist yet.

Then one paragraph per gap: the **unit** with its location, the **scenario** in
one sentence, the **observable** an assertion would read, the **trigger** that
reaches it, the **consequence** of nobody asserting it, and the **destination**.
Described, never written.

**When nothing is missing:** `Status: COMPLETE`, the `Read` list, `Gaps: none`,
and the unobservable section if it has entries. Do not invent a low-value
scenario so the run has an output, do not report a coverage number, and do not
end by offering to write tests that were not found to be missing.

## Commands

Read-only, all of them. No build, no suite, no coverage tool.

```sh
git status --short
git diff --stat main...HEAD
git diff main...HEAD
git log --oneline main...HEAD
rg -l 'takeWhile' --glob '*.spec.ts'
```

`npm test`, `npx vitest run --configLoader native` and the rest of
`.claude/CLAUDE.md`'s table belong to `/verify`. This skill names them in a
recommendation and does not run them.

## References

- `.claude/CLAUDE.md` — the project contract, the two kinds of suite, and the
  transformer fixture requirement.
- `.claude/rules/testing.md` — two suites per feature, performance counted, and
  where a suite lives deciding what it proves.
- `docs/testing.md` — the full standard, and what is worth counting.
- `.claude/rules/collections-performance.md` — laziness, one traversal, bounded
  memory, early exit.
- `.claude/rules/concurrency.md` — cancellation, bounds, release under failure.
- `.claude/rules/transformers.md` — the transformer and the runtime as one
  feature.
- `.claude/rules/api-design.md` — inference as public surface, which is why a
  type-level gap is a gap.
- `.claude/rules/general.md` — what a thrown error owes its caller.
- `.claude/skills/fulcro-review/SKILL.md` — the diff read against every
  contract; a missing suite there is a scenario list here.
- `.claude/skills/verify/SKILL.md` — whether the checks pass.
- `.claude/skills/diagnose/SKILL.md` — one failing test, taken to its cause.
- `.claude/skills/implement-feature/SKILL.md` — who writes the tests this skill
  enumerates.
- `tools/claude/skill-evals/test-gap.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "What is untested in the worker pool?"
- "I am about to write the performance suite for `takeWhile` — what are the
  cases?"
- "Does the transformer have a fixture for every call shape it claims?"
- "Is F14 finished, test-wise?"

**Do not use this skill when:**

- "Is the tree green?" That is `/verify`, which runs the checks.
- "`defaultOf` fails on a union — why?" That is `/diagnose`. A failing test is
  not a gap.
- "Write the missing tests." This skill produces the list; writing them is
  `/implement-feature`.
- "Review the branch." That is `/fulcro-review`.
