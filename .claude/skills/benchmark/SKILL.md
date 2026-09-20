---
name: benchmark
description: Measures what one behaviour costs — a described workload, a comparator measured in the same run, counted work rather than elapsed time, and a scaling probe that names the complexity class — then reports workload, environment, baseline, candidate, delta and recommendation. Use when asked how expensive something is, whether an operator is lazy or single-pass in practice, or which of two implementations to keep.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm run build), Bash(npm run typecheck), Bash(npm run format), Bash(npm run format:check), Bash(npx vitest run:*), Bash(npx eslint:*), Bash(npm ls:*), Bash(node --version), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*)
argument-hint: '[unit | unit against comparator | suite <path> | nothing for the changed unit]'
---

# benchmark

A number with no workload behind it is a rumour. "Twice as fast" says nothing
until someone names the size of the input, its shape, what the projection cost,
whether the source was an array with a fast path or a generator without one,
and what the other side of the comparison was doing. This skill produces the
number **and** the sentence that makes it mean something.

It measures the way `docs/testing.md` says this repository measures: work is
counted, not timed, and the clock appears only as a ratio against a comparator
taken in the same run on the same machine. A benchmark here is therefore mostly
an act of instrumentation — a counting source, a counted projection, a workload
sized so the algorithm's cost separates from the harness's — and only then a
run.

**It writes one file and removes it again.** The measurement is a spec under
the package, because that is the only place the harness will run it with the
transformers applied and the `@/*` alias resolved. Nothing is written before
the user has seen the plan, and the file does not survive the run unless the
user says to keep it.

**Where it sits next to `/perf-regression`.** That skill compares one
implementation against an earlier version of itself across a change. This one
compares a behaviour against a comparator inside a single run, and answers what
something costs rather than whether it got worse.

## Invocation

The model may invoke it. What it writes is a spec file the user approved, and
git holds it.

The signal is a question about cost with a unit attached: how expensive
something is, whether laziness or a single traversal survives in practice,
which of two implementations to keep. Not after every edit — a build plus a
hundred-thousand-element run is minutes, and a benchmark fired on a casual
"is that fast?" is a benchmark that gets switched off.

## When this applies

- "How much does `groupBy` actually cost on records?"
- "Is `selectMany` still one traversal when the source is a generator?"
- "I wrote two versions of the join — which one is cheaper, and by how much?"
- "What is the complexity class of this operator? It looks quadratic."
- a performance suite asserts a bound and the question is what the real number
  under it is.

It does not apply when:

- **The question is whether a change made something slower.** That is
  `.roadmap/features/F15-perf-regression.md`'s skill, which compares versions.
  This one has no memory of yesterday's run.
- **The question is whether the checks pass.** That is
  `.claude/skills/verify/SKILL.md`, which runs the suites and reports exit
  statuses, including the performance ones.
- **The question is what is untested.** That is
  `.claude/skills/test-gap/SKILL.md`. A missing performance suite is a gap it
  reports; a number inside one is this skill's.
- **The request is to write the performance suite.** This skill produces a
  measurement and its numbers; the committed suite with its assertions is
  `.claude/skills/implement-feature/SKILL.md`'s work, with this report in hand.
- **A performance suite is failing.** One failing assertion with a location is
  `.claude/skills/diagnose/SKILL.md`.
- **The behaviour does not exist yet.** There is nothing to instrument, and a
  benchmark of an imagined implementation is a guess with decimals on it.

## Arguments

| Argument                 | What is measured                                       |
| ------------------------ | ------------------------------------------------------ |
| none                     | The one performance-sensitive unit the tree changed    |
| a path or exported name  | That unit, against the comparator chosen in §2.3       |
| `<unit> against <other>` | That unit against the named alternative                |
| `suite <path>`           | An existing performance suite, re-read for its numbers |

With no argument and more than one candidate in `git status --short`, ask which
rather than choosing. A benchmark of the wrong unit is a report nobody can use
and a run nobody gets back.

`suite <path>` is the cheap path: the measurement is added to a suite that
already instruments the unit, rather than built from nothing.

## Before starting

- **The branch is not `main`.** `.claude/rules/git.md`; a file is written here.
- **The tree's state is known.** `git status --short` is shown in the report,
  because a benchmark of uncommitted work measures uncommitted work. Nothing is
  stashed and nothing is discarded to get a cleaner view.
- **`npm run build` succeeds.** The suites of `@fulcro/reflect` are meaningless
  without its transformer, and the transformer is loaded from `dist`.
- **The machine is not otherwise busy.** `docs/testing.md` records two
  assertions that failed for contention rather than for code. Every timing
  figure in the report carries this caveat; say in the report if the run shared
  the machine with anything.
- **There is a unit with an observable cost.** If nothing can be counted and
  nothing can be compared, stop — §2.2 is where that is decided, and saying so
  is a complete answer.

## 1. Read

Named sources, in this order. Nothing recalled from memory.

| #   | Source                                     | What it settles                       |
| --- | ------------------------------------------ | ------------------------------------- |
| 1   | The implementation file, in full           | What there is to count                |
| 2   | The exported signature and its doc comment | What cost was promised                |
| 3   | `docs/testing.md`                          | What may be asserted, and how         |
| 4   | The package's existing performance suites  | The instrumentation already written   |
| 5   | `vitest.config.mts`                        | Which project the measurement runs in |
| 6   | `.claude/rules/collections-performance.md` | Which guarantees apply, for sequences |
| 7   | `.claude/rules/concurrency.md`             | Which apply, for anything async       |

`packages/collections/src/tests/sequence/performance.spec.ts` holds the shape
the counters take here — a counting generator, a wrapped projection, both reset
in a `beforeEach`. `packages/collections/src/tests/sequence/realistic.performance.spec.ts`
holds the record dataset and the `beforeAll` that builds it once. Reuse them;
a second instrumentation idiom in the same tree is a second thing to keep
right.

Read the implementation rather than the export. What is worth counting is a
branch — an array fast path a generator never takes, a buffer acquired before
the first result, a key extracted per comparison instead of per element — and a
branch is invisible from the signature.

## 2. Design the measurement

Nothing is written until all five of these have an answer.

### 2.1 The workload, in words

Stated before it is coded, and carried into the report verbatim. Five parts,
and a missing one is a benchmark that cannot be quoted:

- **Size** — the element count. 100,000 for counted assertions, 1,000,000 for a
  clock ceiling, per `docs/testing.md`. A smaller number needs its reason.
- **Shape** — numbers, or records with the fields the code will actually meet.
  A key projection over a number is free and measures nothing.
- **Source kind** — a generator, deliberately not an array, unless the array
  fast path is the thing under test. Say which.
- **Distribution** — sorted or not, keys that collide or not, how many
  distinct groups. A grouping benchmark over distinct keys measures the
  allocation and not the grouping.
- **Projection cost** — free, or a real field read. Say which.

A microbenchmark is never called representative. It is called what it is: this
workload, at this size, on this shape.

### 2.2 What is counted

The primary result, and the one the report leads with. Instrument the input and
count: elements pulled, projections invoked, comparisons made, keys extracted,
tasks handed to a worker, allocations of the buffer under test. `docs/testing.md`
has the table of what each guarantee is counted as.

If the question can be answered by a count, it is answered by a count and the
clock does not appear. "Before writing a ratio, ask whether the thing can be
counted instead" is the standard's sentence, and it usually can.

A behaviour with nothing countable and no comparable baseline is **not
measurable here**. Report that, with what was considered, and stop. Reaching
for a bare duration to have an output is the failure this skill exists to
prevent.

### 2.3 The baseline, measured in the same run

A baseline fixes the machine, and only a comparable one fixes anything else.
Choose one, and say why it is comparable:

| Baseline                         | Comparable when                                   |
| -------------------------------- | ------------------------------------------------- |
| A hand-written loop              | It does the same work over the same source        |
| The array path of the same API   | The question is what the generic path costs       |
| A second candidate               | Both are asked the same question over one fixture |
| A constant the transformer emits | The claim is that a call compiled away            |

Not comparable: an intrinsic against a function that builds a result.
`docs/testing.md` records `typeOf` bounded at sixty times `Object.getPrototypeOf`
— a ratio nothing bounds by any constant, which failed on one runner in four
while the code was fine. If the only baseline available is of that kind, §2.2
applies: count instead.

Both sides run in the same process, in the same file, over the same fixture,
built once.

### 2.4 The scaling probe

What separates a benchmark from a stopwatch. Measure the count at N, 2N and 4N
and read the growth:

| Counts grow by | The class is             |
| -------------- | ------------------------ |
| ×2, ×2         | linear                   |
| a little       | constant, or logarithmic |
| ×4, ×4         | quadratic                |

This is deterministic, survives a loaded machine, and answers the question a
duration only gestures at. Run it whenever the unit walks a source. Where the
count is constant by design — a known cardinality answered without a pull — say
so and skip it.

### 2.5 Where the timing is allowed

Two places, per `docs/testing.md`, and the report marks every figure with
which:

- **A ratio** against the §2.3 baseline, taken in the same run.
- **A smoke ceiling** generous enough that only a change of complexity class
  crosses it.

Every other duration is reported as an observation about the machine, labelled
as such, and never as evidence about the algorithm.

## 3. Ask

Show the plan, then ask with `AskUserQuestion`. One option is always to change
nothing and stop with the plan as the record.

```text
| # | Part        | Decision                                    |
| 1 | Unit        | what is measured                            |
| 2 | Workload    | size, shape, source kind, distribution, cost |
| 3 | Counted     | the counters, and what each proves          |
| 4 | Baseline    | what it is, and why it is comparable        |
| 5 | Timing      | ratio, ceiling, or none                     |
| 6 | File        | where the measurement is written            |
| 7 | Afterwards  | removed, or kept for adoption               |
```

Ask separately, and before writing, when: the measurement file would join a
committed performance suite rather than stand alone; the workload departs from
the sizes in `docs/testing.md`; or the only available baseline is one §2.3
calls not comparable.

## 4. Measure

Only after the answer.

**The file.** One spec, written where the unit's performance suite lives, named
for the unit and carrying the spec extension so the package's project picks it
up — `vitest.config.mts` includes `src/**/*.spec.ts` and nothing outside it. It
follows `.claude/rules/general.md` like any other file here: a doc comment
saying what the workload is and why this shape, English throughout, no
abbreviated names.

It **reports** rather than asserts. The counts are logged; the only assertion it
may carry is a smoke ceiling, and only where §2.5 allows one. A measurement
that fails is a measurement nobody can read a number out of.

**The fixture is built once**, in a `beforeAll`, or every figure below it
measures the builder.

**The run.** Build first, then the project the unit belongs to, then record the
numbers as they were printed:

```sh
npm run build
npx vitest run --project collections --configLoader native
```

**Repeat it.** Three runs minimum. Counts that differ between runs mean the
measurement is not deterministic — a `Set` iteration order, a timer, a shared
counter never reset — and that is a defect in the measurement, fixed before any
number is reported. Timings vary; report the median and the spread, never a
single sample.

**Then remove the file**, unless the user chose to keep it. If it stays, it is
their file and it is left uncommitted for them to review;
`.claude/rules/testing.md` is what it has to satisfy before it becomes a
committed suite, and `npm run format` and `npx eslint .` are what it has to
pass.

Never edit an existing assertion to accommodate a number this run produced. A
performance assertion that now fails is a finding, reported, and
`.claude/skills/diagnose/SKILL.md` is what takes it to a cause.

## 5. Verify

The report is verified when all of these hold, and the ones that do not are
named in it:

- **The measurement ran.** The command and its output, quoted. No figure is
  reported that was not printed by a run performed in this session.
- **The counts are stable across three runs.** Stated, with the values.
- **The file is accounted for.** Either `git status --short` no longer shows it,
  or the report names it as kept and says so.
- **Each figure is labelled** — counted, ratio, ceiling, or machine
  observation. An unlabelled number does not go in.
- **The tree still builds** if a file was kept: `npm run typecheck`.

## Stop

Halt and hand back when:

- **Nothing is measurable** — §2.2. Say what was considered and why none of it
  could be counted or compared.
- **No comparable baseline exists** and the question needs one. Report the
  counts alone rather than inventing a ratio.
- **The build fails.** Status `BLOCKED`, the output verbatim, and stop; the
  transformers come from `dist` and a stale one measures the wrong code.
- **The counts are not reproducible** after the measurement has been checked.
  That is a finding about the measurement, and it is reported instead of a
  number.
- **An existing assertion fails during the run.** It is not adjusted, ever. It
  is reported, and it goes to `/diagnose`.
- **The scope grows past what was approved** — a second unit, a rewrite of the
  implementation to make it measurable.
- **The next step is a human's.** Pushing, publishing, merging and discarding
  uncommitted work are refused by the hooks —
  `.claude/rules/protected-operations.md`.

## Output

The same eight sections, in this order, every run — including the run that
measures nothing.

```text
Status:      MEASURED | PARTIAL | NOT MEASURABLE | BLOCKED
Workload:    size, shape, source kind, distribution, projection cost
Environment: node, platform, CPU count, vitest, commit, tree state, project
Baseline:    what it is, and why it is comparable
Candidate:   what was measured
Delta:       the table below
Scaling:     counts at N, 2N, 4N, and the class they name
Observations: what the numbers say about the algorithm
Recommendation: what to do, or that nothing needs doing
```

The table:

```text
| Metric | Kind | Baseline | Candidate | Delta |
```

`Kind` is `counted`, `ratio`, `ceiling` or `machine`. A `counted` delta is
exact and is written as a ratio of integers. A `ratio` delta carries the
caveat that it is a relationship between two figures from one machine. A
`machine` row is an observation and is never the basis of a recommendation.

The environment line is recorded from commands, not assumed:

```sh
node --version
npm ls vitest --depth 0
git rev-parse --short HEAD
git status --short
```

**When nothing could be measured:** `Status: NOT MEASURABLE`, the workload that
was designed, what was considered as a counter and as a baseline, why each was
rejected, and no numbers. Do not fall back to a duration, do not describe the
implementation instead, and do not end by offering a benchmark of something
adjacent that was not asked for.

## Commands

From `.claude/CLAUDE.md`'s table and `package.json`.

```sh
npm run build
npx vitest run --project collections --configLoader native
npx vitest run --project reflect --configLoader native
npx vitest run performance --project collections --configLoader native
npm run typecheck
npm run format
npx eslint .
```

`npm test` builds and runs everything; this skill runs one project, because the
other projects are load on the machine the measurement is taken on.

## References

- `docs/testing.md` — the standard: count the work, what is worth counting,
  when the clock is the right tool, and the two assertions that failed for
  contention.
- `.claude/CLAUDE.md` — the project contract, the command table, and the rule
  that a performance claim needs deterministic evidence.
- `.claude/rules/testing.md` — two suites per feature, performance counted, and
  the data having the shape the code will meet.
- `.claude/rules/collections-performance.md` — laziness, one traversal, bounded
  memory, early exit: the guarantees the counters are chosen from.
- `.claude/rules/concurrency.md` — what the async units owe, and why a limit is
  proven at its peak.
- `.claude/rules/general.md` — the measurement file is a source file like any
  other.
- `.claude/rules/git.md` — the branch it is written on, and what is not staged.
- `.claude/rules/protected-operations.md` — what no skill here does.
- `.claude/skills/verify/SKILL.md` — whether the checks pass.
- `.claude/skills/test-gap/SKILL.md` — which performance scenarios are missing.
- `.claude/skills/diagnose/SKILL.md` — a failing performance assertion, taken
  to its cause.
- `.claude/skills/implement-feature/SKILL.md` — who turns a measurement into a
  committed suite.
- `tools/claude/skill-evals/benchmark.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "How much does `groupBy` cost over a hundred thousand orders?"
- "I have two implementations of the join — measure them against each other."
- "Is this operator linear? It reads like it walks the source twice."
- "What does the transformer actually save on `nameOf`?"

**Do not use this skill when:**

- "Did my change make anything slower?" That is `/perf-regression`, which
  compares versions rather than implementations.
- "Is the tree green?" That is `/verify`.
- "`selectAwait` fails its memory assertion — why?" That is `/diagnose`.
- "Write the performance suite for `takeWhile`." That is `/implement-feature`;
  this skill measures, and its output is what the assertions are set from.
