---
name: perf-regression
description: Compares a change against the version it departs from and says whether the cost of a behaviour got worse — counted contracts first, timing only as a ratio, an algorithmic regression reported as blocking and a noisy timing result as a warning. Use when a change touches a performance-sensitive implementation under packages/*/src, before opening a pull request that carries one, or when a performance suite started failing after an edit.
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(npm run build), Bash(npm run typecheck), Bash(npm ci), Bash(npx vitest run:*), Bash(node --version), Bash(npm ls:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git rev-parse:*), Bash(git merge-base:*), Bash(git worktree add:*), Bash(git worktree list), Bash(git worktree remove:*)
argument-hint: '[path or unit | against <ref> | nothing for the changed surface]'
---

# perf-regression

A change that is correct and slower ships green. Every behavioural suite
passes, the review reads the diff and sees a tidier implementation, and the
operator that used to read its source once now reads it twice. Nothing in the
tree says so, because nothing in the tree remembers what it cost yesterday.

This skill is that memory. It takes one change, finds the version it departs
from, and compares the cost of the behaviour across the two — deterministically
where the work can be counted, and as a ratio where it cannot, with the two
kinds never mixed in the same row of the report.

The distinction it is built around: **a count travels between runs and a
duration does not.** Elements pulled, projections invoked, comparisons made are
the same integers on a loaded CI runner and on an idle laptop, so a count
measured last week is still a baseline today. A millisecond figure is a fact
about the machine that produced it, and comparing one across two runs measures
whichever machine was busier. `docs/testing.md` records two assertions this
repository lost to exactly that.

**Where it sits next to `/benchmark`.** That skill asks what a behaviour costs,
against a comparator inside one run, and has no memory of yesterday. This one
asks whether the cost got worse, against an earlier version of the same code,
and its whole subject is the difference between two points in the history.

## Invocation

The model may invoke it. It is read-only on the repository's history and, on
its cheap path, writes nothing at all.

But it is **expensive on its slow path** — a second checkout, a second install,
a second build — so it is not fired after every edit. The signal is a concrete
change surface: a diff that touches a performance-sensitive implementation
under `packages/*/src`, a pull request about to carry one, or a performance
suite that began failing after an edit. Not a general wish to be reassured.

## When this applies

- "Did my change to `selectMany` make anything slower?"
- "This rewrite is cleaner — prove it didn't cost anything."
- "The `groupBy` performance suite fails on this branch and passed on `dev`."
- a pull request touching `packages/collections/src` is about to be opened and
  the operator it changes carries a laziness or single-traversal guarantee.

It does not apply when:

- **The question is what something costs**, with no earlier version in it. That
  is `.claude/skills/benchmark/SKILL.md`.
- **The question is whether the checks pass.** That is
  `.claude/skills/verify/SKILL.md`, which runs the suites and reports their
  exit statuses.
- **A regression is already proven and the question is why.** That is
  `.claude/skills/diagnose/SKILL.md`. This skill establishes that the cost
  changed and where; it does not take the cause apart.
- **There is no performance suite over the changed surface.** Nothing can be
  compared, and the missing scenarios are
  `.claude/skills/test-gap/SKILL.md`'s report, not a number this skill can
  invent.
- **The change is to the public surface rather than to its cost.** A signature
  that now infers differently is `.claude/skills/api-audit/SKILL.md`.
- **The behaviour is new.** A feature added on this branch has no earlier
  version, and its first measurement is a benchmark.

## Arguments

| Argument             | What is compared                                        |
| -------------------- | ------------------------------------------------------- |
| none                 | The performance-sensitive surface the tree changed      |
| a path or unit name  | That unit, against the ref chosen in §2.2               |
| `against <ref>`      | The changed surface, against that commit, tag or branch |
| a path and `against` | Both, named explicitly                                  |

With no argument and more than one performance-sensitive file in the diff, ask
which rather than choosing — or compare all of them only if the user says so,
since each one costs a run.

## Before starting

- **There is a change to compare.** `git status --short` and
  `git diff --stat origin/dev...HEAD`. A tree with nothing in it and no ref
  named has no subject; say so and stop.
- **The branch is not `main`.** `.claude/rules/git.md`.
- **`npm run build` succeeds on the candidate.** The transformers load from
  `dist`, and a stale one measures the wrong code.
- **The machine is not otherwise busy.** Every timing figure in the report
  carries this caveat, and the report says whether the run shared the machine.
- **A performance suite covers the changed surface.** If none does, stop —
  §2.3 has nowhere to start, and saying so with `/test-gap` named is the
  complete answer.

## 1. Read

Named sources, in this order. Nothing recalled from memory.

| #   | Source                                     | What it settles                         |
| --- | ------------------------------------------ | --------------------------------------- |
| 1   | `git diff` of the change, in full          | What actually moved                     |
| 2   | The changed implementation file            | Which branch the diff touched           |
| 3   | The performance suite covering it          | What is already counted                 |
| 4   | `git log` of that suite                    | Whether the counters themselves changed |
| 5   | `docs/testing.md`                          | What may be asserted, and how           |
| 6   | `.claude/rules/collections-performance.md` | Which guarantees apply, for sequences   |
| 7   | `.claude/rules/concurrency.md`             | Which apply, for anything async         |

Source 4 is the one a session skips and should not. If the change edited both
the implementation and its counted assertions, the suite is no longer a fixed
instrument, and every delta below is measured against a moved ruler. That is a
finding in its own right, and §2.3 chooses differently because of it.

Read the implementation rather than the signature. A regression lives in a
branch — an array fast path that a refactor stopped reaching, a key extracted
per comparison instead of per element, a buffer now filled before the first
result — and none of those are visible from the export.

## 2. Choose the comparison

### 2.1 The surface

One unit, named, with the guarantee it carries. `packages/collections`'
operators promise laziness, a single traversal, bounded memory and early exit;
`@fulcro/parallel` promises a concurrency bound and release under failure. The
guarantee is what decides which counter matters, and a comparison that does not
name one is comparing whatever the suite happened to print.

### 2.2 The baseline ref

The version the change departs from, not simply the last commit:

| The change is            | The ref is                       |
| ------------------------ | -------------------------------- |
| Uncommitted, on a branch | `HEAD`                           |
| A branch against `dev`   | `git merge-base HEAD origin/dev` |
| A released regression    | The release tag the user names   |
| Named by the user        | What they named, verbatim        |

Record the ref as a short hash in the report. "Against `dev`" means nothing six
commits later.

### 2.3 Which evidence, and therefore which path

Exhaust the cheap path before paying for the expensive one.

**Path A — the counts the candidate prints, against the bounds the baseline
committed.** A counted assertion in a performance suite _is_ a recorded
baseline: it is an integer that was true of the earlier implementation and is
machine-independent. Run the suite on the candidate and read the counts against
it. A count that now exceeds its bound is a proven regression with no second
checkout anywhere in the evidence.

Path A is available when the suite's counters and their bounds are unchanged by
the diff — source 4 above. It is the path most changes take, and it costs one
test run.

**Path B — the earlier version, measured.** Needed when the diff edited the
suite as well as the implementation, when the counters that would reveal the
regression do not exist yet, or when a count moved within its bound and the
question is by how much. The procedure is `baseline.md`, and the single rule
that makes it mean anything is there: the candidate's measurement file runs on
both sides.

If the counters that would settle the question do not exist, they are written
once, as one file, and run against both sides — never written into the
committed suite as part of this skill. A committed assertion is
`.claude/skills/implement-feature/SKILL.md`'s work, set from numbers this
report hands it.

### 2.4 What is compared, and how each kind is read

Three kinds, and the report never mixes them in one row.

| Kind      | What it is                                                                                               | Verdict it can produce |
| --------- | -------------------------------------------------------------------------------------------------------- | ---------------------- |
| `counted` | Elements pulled, projections invoked, comparisons made, keys extracted, tasks dispatched, peak in flight | `REGRESSED`            |
| `ratio`   | A duration over a baseline taken in the same run, compared across versions                               | `WARN`                 |
| `machine` | A bare duration, a heap figure, a run time                                                               | Nothing                |

A `counted` delta is exact and is written as integers: `1 → 2` traversals, not
"about twice". It is the only kind that can block, because it is the only kind
that is the same on every machine.

A `ratio` row is a ratio of ratios — each side's timing divided by its own
in-run baseline, then the two compared. That is the most a clock can honestly
say across two runs, and it is still a warning, never a failure.

**Memory and allocations** are counted where the suites already count them:
pulls at the first result for a bounded window, queue depth and peak in flight
for `@fulcro/parallel`. `process.memoryUsage()` is a `machine` row — it is
whatever the garbage collector had not got to yet — and it never supports a
verdict.

## 3. Ask

Path A needs no approval: it runs an existing suite and writes nothing.

Ask with `AskUserQuestion`, before doing it, when path B is chosen, when a
measurement file would be written, or when the baseline ref is ambiguous. Show
what it costs:

```text
| # | Part     | Decision                                       |
| 1 | Unit     | what is compared, and the guarantee it carries |
| 2 | Baseline | the ref, as a short hash, and why that one     |
| 3 | Path     | A, or B with the install and build it costs    |
| 4 | Counters | what is counted, and what each would prove     |
| 5 | Timing   | a ratio of ratios, or none                     |
| 6 | Files    | what is written, and whether it survives       |
```

One option is always to stop with the plan as the record.

## 4. Measure

**Build the candidate first**, then run the project the unit belongs to:

```sh
npm run build
npx vitest run --project collections --configLoader native
```

**Three runs of each side.** Counts that differ between runs of the same side
mean the instrument is not deterministic — a `Set` iteration order, a counter
never reset, a timer — and that is a defect in the measurement, reported
instead of a delta. Timings get a median and a spread, never a single sample.

For path B, `baseline.md` from here: the worktree, the copied measurement file,
the install, the build, the alternating runs, and the removal.

**Never edit an assertion to accommodate a number.** A performance assertion
that now fails is the finding — it is what this skill came for — and loosening
it turns the one mechanism that catches an algorithmic regression into a
formality. `.claude/CLAUDE.md` puts `skip` and its relatives behind explicit
approval for the same reason.

## 5. Decide

The verdict follows the evidence, and the evidence is the kind column of §2.4.
There is no repository-wide percentage threshold, and this skill does not
invent one.

| Evidence                                                                        | Status           |
| ------------------------------------------------------------------------------- | ---------------- |
| A counted contract got worse — a traversal, a projection, an extraction, a peak | `REGRESSED`      |
| A counted contract crossed a committed bound                                    | `REGRESSED`      |
| A count grew within its bound                                                   | `WARN`           |
| A ratio-of-ratios moved by more than a third, counts unchanged                  | `WARN`           |
| A ratio moved, counts unchanged, machine shared or unknown                      | `WARN`           |
| Counts identical, ratios within noise                                           | `CLEAN`          |
| The suite does not cover the changed surface                                    | `NOT MEASURABLE` |
| The build fails, or the two sides are different APIs                            | `BLOCKED`        |

`REGRESSED` is blocking for merge. It is a proven algorithmic change: the
implementation now does more work per element, on every machine, and no amount
of re-running alters an integer. It is lifted by a fix, or by the user waiving
it explicitly — and a waiver is theirs to give, recorded in the report, never
assumed from the change being small.

`WARN` is not blocking. A timing-only movement is noise until something
deterministic agrees with it, and this repository has already spent two
assertions learning that. Say what would settle it: usually a counter that does
not exist yet.

A change of **complexity class** is always `REGRESSED` and is said in those
words. Counts at N, 2N and 4N that grew ×2, ×2 on the baseline and ×4, ×4 on
the candidate is the finding that matters most in this report, and it outranks
every ratio in it.

## 6. Verify

The report is verified when all of these hold, and the ones that do not are
named in it:

- **Both sides ran in this session.** The commands and their output, quoted. No
  figure is reported that was not printed by a run performed here.
- **The counts are stable across three runs per side.** Stated, with values.
- **The measurement code was identical on both sides** — trivially true on path
  A, and stated explicitly on path B.
- **Every figure is labelled** `counted`, `ratio` or `machine`. An unlabelled
  number does not go in.
- **The worktree is gone**, confirmed by `git worktree list`, or the report
  names it as kept.
- **The working tree is as it was**, confirmed by `git status --short` against
  the one read before starting. Any file written for the run is removed or
  named as kept.

## Stop

Halt and hand back when:

- **No performance suite covers the surface.** `NOT MEASURABLE`, with
  `/test-gap` named. Do not write a suite from nothing and call its first run a
  baseline: a number with no earlier value beside it is a benchmark, not a
  comparison.
- **The two sides are not the same API.** The candidate's measurement does not
  compile against the baseline. Report it; `.claude/rules/api-design.md` is
  what that change is measured against instead.
- **The build fails on either side.** `BLOCKED`, the output verbatim.
- **The counts are not reproducible** after the measurement has been checked.
  The finding is about the instrument, and it is reported instead of a delta.
- **Only a duration separates the two versions.** `WARN`, and say what counter
  would settle it. Do not escalate a stopwatch to a failure.
- **The regression's cause is being reached for.** That is `/diagnose`, and
  this report is its input.
- **The scope grows** past the approved unit — a second surface, a rewrite of
  the implementation to make the number better.
- **The next step is a human's.** Pushing, publishing, merging and discarding
  uncommitted work are refused by the hooks; the baseline is read in a worktree
  precisely so that none of them is needed.
  `.claude/rules/protected-operations.md`.

## Output

The same eight sections, in this order, every run — including the run that
compares nothing.

```text
Status:      CLEAN | WARN | REGRESSED | NOT MEASURABLE | BLOCKED
Surface:     the unit, and the guarantee it carries
Baseline:    the ref as a short hash, and why that one
Path:        A (counts against committed bounds) or B (the earlier version, run)
Environment: node, platform, CPU count, vitest, commit, tree state, project
Deltas:      the table below
Scaling:     counts at N, 2N, 4N on both sides, and the class each names
Verdict:     the §5 row that decided it, and what lifts it
```

The table:

```text
| Metric | Kind | Baseline | Candidate | Delta | Verdict |
```

`Kind` is `counted`, `ratio` or `machine`. A `counted` delta is two integers
and an arrow. A `ratio` delta carries the caveat that it is a relationship
between two runs on one machine. A `machine` row is an observation, has no
verdict, and is never the basis of one.

The environment line is recorded from commands, not assumed:

```sh
node --version
npm ls vitest --depth 0
git rev-parse --short HEAD
git status --short
```

**When nothing regressed:** `Status: CLEAN`, the table with its unchanged
counts, and an end. Do not pad it with what might regress later, and do not
offer to compare something adjacent that was not asked for.

**When nothing could be compared:** `Status: NOT MEASURABLE`, the surface, the
baseline that was chosen, what was looked for as a counter, and why none was
found. No numbers, and no duration offered as a substitute for one.

## Commands

From `.claude/CLAUDE.md`'s table and `package.json`.

```sh
npm run build
npx vitest run --project collections --configLoader native
npx vitest run --project reflect --configLoader native
npx vitest run performance --project collections --configLoader native
npm run typecheck
npm ci
```

The git commands this skill runs, all of them reads except the worktree pair:

```sh
git status --short
git diff --stat origin/dev...HEAD
git merge-base HEAD origin/dev
git rev-parse --short HEAD
git log --oneline -- <the suite>
git worktree add --detach <scratchpad>/baseline <ref>
git worktree list
git worktree remove <scratchpad>/baseline
```

`npm test` builds and runs everything; this skill runs one project, because the
other projects are load on the machine the comparison is taken on.

## References

- `baseline.md` — path B: the worktree, the copied measurement file, the
  install, the alternating runs, and the removal.
- `docs/testing.md` — the standard: count the work, what is worth counting,
  when the clock is the right tool, and the two assertions that failed for
  contention.
- `.claude/CLAUDE.md` — the project contract, the command table, and the rule
  that a performance claim needs deterministic evidence.
- `.claude/rules/testing.md` — two suites per feature, and performance counted.
- `.claude/rules/collections-performance.md` — laziness, one traversal, bounded
  memory, early exit: the guarantees a delta is read against.
- `.claude/rules/concurrency.md` — the bound proven at its peak.
- `.claude/rules/api-design.md` — when the two sides turn out to be different
  APIs.
- `.claude/rules/git.md` — the branch this runs on, and what is not staged.
- `.claude/rules/protected-operations.md` — why the candidate is never stashed.
- `.claude/skills/benchmark/SKILL.md` — what a behaviour costs, with no earlier
  version in it.
- `.claude/skills/verify/SKILL.md` — whether the checks pass.
- `.claude/skills/diagnose/SKILL.md` — a proven regression, taken to its cause.
- `.claude/skills/test-gap/SKILL.md` — the performance scenarios that are
  missing.
- `.claude/skills/implement-feature/SKILL.md` — who turns a number into a
  committed assertion.
- `tools/claude/skill-evals/perf-regression.eval.json` — these examples as
  data.

## Examples

**Use this skill when:**

- "Did my rewrite of `selectMany` make anything slower?"
- "Compare this branch against `dev` before I open the pull request."
- "The `groupBy` memory assertion passes, but it feels heavier than it was."
- "This operator's suite fails on my branch and passed on the last release."

**Do not use this skill when:**

- "How much does `groupBy` cost over a hundred thousand orders?" That is
  `/benchmark`, which has no earlier version to compare against.
- "Is the tree green?" That is `/verify`.
- "The regression is real — why?" That is `/diagnose`, and this report is what
  it starts from.
- "Write the performance suite for `takeWhile`." That is `/implement-feature`.
