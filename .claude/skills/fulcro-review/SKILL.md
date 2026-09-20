---
name: fulcro-review
description: Reviews a change against this repository's own contracts — the public surface, the transformer/runtime pair, laziness and bounded memory, cancellation and release, package boundaries, the two suites, bilingual docs and the release gate — and reports located findings with the invariant each one violates. Use when a diff, a branch or a pull request is ready to be read, or when asked to review changes under `packages/`.
allowed-tools: Read, Grep, Glob, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git merge-base:*), Bash(gh pr view:*), Bash(gh pr diff:*)
context: fork
argument-hint: '[branch | path | PR number | nothing for the working tree]'
---

# fulcro-review

A review pass against the contracts this repository has already written down.
Not a style opinion, not a second linter — ESLint and Prettier already decide
formatting, and `/verify` already decides whether the checks pass. What neither
can see is an operator that buffers a source it promised to stream, a
transformer that stopped recognising a call and let the runtime fallback answer
instead, a pool that releases its worker only on the happy path, or an exported
signature that now infers `unknown`. Every one of those ships green.

So the findings here are located, and each names the invariant it breaks with
the file that states it. A finding that cannot name one is a preference, and
preferences are out of scope — `.claude/rules/` is the whole of what this skill
reviews against.

**This skill is read-only.** It reports; it does not edit, does not reformat,
does not add a test and does not run the suites. The repair is an ordinary
implementation turn with this report in hand, `/diagnose` where a failure has no
established cause, or `/fix-warnings` for a body of warnings.

**The name is prefixed deliberately.** Claude Code ships `code-review`, which
reads a diff for general correctness. This one reads it against Fulcro's
contracts, and the two are worth running separately.

## Invocation

The model may invoke it. It changes nothing and runs no build, so its cost is
reading time rather than machine time.

The signal is a change that is finished and about to be read by someone: a
branch ready for a pull request, a diff the user asks about, a review requested
by name. Not after every edit — mid-implementation, the contracts are
`implement-feature`'s to hold, and re-reading an unfinished diff reports the
parts that are unfinished.

`context: fork` is set: the review's findings are the only thing the parent
session needs back, and a diff is read from git rather than from the
conversation. What that costs is the session's own account of why a change was
made, so where the intent matters — a deliberate surface change, an argued
exception — pass it as an argument or say it in the invocation.

## When this applies

- a branch is complete and a pull request is about to be opened;
- the request is "review this", "does this hold up", "anything wrong with the
  change under `packages/collections`";
- a change touches a transformer, an `exports` map, an async sequence or the
  worker pool — the four surfaces where a wrong answer is silent;
- a pull request number is given to read.

It does not apply when:

- **The request is whether the checks pass.** That is
  `.claude/skills/verify/SKILL.md`, which runs them and reports the output.
- **Something is failing and the cause is unknown.** One defect with a location
  is `.claude/skills/diagnose/SKILL.md`.
- **The request is to build the thing.**
  `.claude/skills/implement-feature/SKILL.md` owns the contract while the code
  is being written; this skill reads what came out.
- **The request is the warnings as a body of work.** That is
  `.claude/skills/fix-warnings/SKILL.md`.
- **The request is what a unit still owes its suites.** This skill reports a
  missing suite as one finding among many;
  `.claude/skills/test-gap/SKILL.md` enumerates the scenarios inside it.
- **The request is to write or review a skill.** That is
  `.claude/skills/skill-authoring/SKILL.md`, which has its own checklist.
- **Nothing has changed.** Say so and stop.

## Arguments

| Argument      | What is reviewed                                         |
| ------------- | -------------------------------------------------------- |
| none          | The working tree, plus what this branch adds over `main` |
| a branch name | `git diff main...<branch>`                               |
| a path        | The change restricted to that path                       |
| a number      | The pull request of that number, read with `gh`          |
| `full <path>` | The file as it stands, not only the lines that changed   |

A bare invocation is the common case. `full` is for a file whose diff is small
and whose surrounding code is what the finding is about — an operator whose new
line is fine and whose loop was already buffering.

## Before starting

- There has to be a change to read. `git status --short` and
  `git diff --stat main...HEAD`; if both are empty and no argument was given,
  say so and stop.
- The review reads source, not `dist/`. No build is required and none is run.
- Nothing is stashed, committed or discarded to get a cleaner diff. Uncommitted
  work is part of what is being reviewed.
- Where a pull request number is given, `gh pr view` and `gh pr diff` are the
  sources. If `gh` is unavailable, say so and review the local branch instead of
  guessing at the remote.

## 1. Read

Establish the change and the contracts it falls under, in that order. Every
source is named; nothing is recalled from memory.

| #   | Source                                   | What it settles                      |
| --- | ---------------------------------------- | ------------------------------------ |
| 1   | `git status --short`                     | What is uncommitted                  |
| 2   | `git diff --stat main...HEAD`            | What the branch adds over the base   |
| 3   | `git diff main...HEAD -- <path>`         | The change itself, per path          |
| 4   | `git log --oneline main...HEAD`          | Whether one branch is one change     |
| 5   | `.claude/rules/*.md`                     | The invariants a finding cites       |
| 6   | `packages/*/package.json`                | The `exports` map, before and after  |
| 7   | the spec beside each changed source file | Whether both suites are there        |
| 8   | `.changeset/`                            | Whether a shipped change records one |
| 9   | `docs/`                                  | The page a changed surface documents |

Read the whole of every changed source file, not the hunk. An operator's
laziness is a property of the function, and a diff of three lines inside it
cannot be judged from the three lines.

Then map each changed path to the contracts that govern it. A path matching
more than one row is reviewed under every one.

| Changed path                                    | Reviewed against                              |
| ----------------------------------------------- | --------------------------------------------- |
| `packages/*/src/**/*.ts`                        | `general.md`, `testing.md`, `build-output.md` |
| `packages/collections/src/**`                   | `collections-performance.md`                  |
| `packages/parallel/src/**`                      | `concurrency.md`                              |
| `packages/collections/src/collections/async/**` | `concurrency.md`                              |
| `packages/*/src/transformer/**`                 | `transformers.md`                             |
| `packages/*/src/unplugin/**`                    | `transformers.md`                             |
| `packages/transform-core/src/**`                | `transformers.md`                             |
| `packages/*/package.json`, an `exports` map     | `api-design.md`, `release.md`                 |
| any exported symbol or type                     | `api-design.md`                               |
| `packages/*/src/**/*.spec.ts`, `tests/**`       | `testing.md`                                  |
| `docs/**`                                       | `.claude/CLAUDE.md` on bilingual docs         |
| `.changeset/**`, a version field                | `release.md`, `git.md`                        |
| `.claude/**`, `tools/claude/**`                 | `skill-authoring`'s checklist, not this skill |

## 2. Decide

A finding needs three things, and a candidate missing any of them is dropped
rather than softened: a **location** the reader can open, an **invariant** in
`.claude/` or `docs/` that it violates, and an **impact** a consumer or a
maintainer would feel. "This could be cleaner" has none of the three.

### The dimensions

Each is a question with an answer in the diff. They are worked in this order so
that the silent failures are found before the cosmetic ones.

**Public surface** — `api-design.md`

1. Does an `exports` map, an exported value, an overload or an exported type
   change? Name it, say what a consumer's code looks like before and after.
2. **Does a call now infer something looser?** `Sequence<unknown>` where it was
   `Sequence<User>` breaks every consumer with no name changed and no runtime
   test failing. Only a type-level test catches it; its absence is a finding.
3. Is a new overload inserted ahead of an existing one? That changes which
   signature an existing call selects.
4. Is a symbol exported because a sibling module needed it rather than because a
   consumer does — including a helper exposed on `./transformer` or
   `./unplugin`?
5. Is the surface change bundled into an implementation commit? `api-design.md`
   asks for it to be proposed separately.

**Transformer and runtime** — `transformers.md`

1. Did a runtime signature, call shape or entry point move without the
   transformer that recognises it moving too?
2. Are there fixtures or tests beside the transformer change? `.claude/CLAUDE.md`
   requires them.
3. Is a path compared against a hard-coded `/`-joined string rather than one
   built with `path.join`? That passes on one platform and fails on the other.
4. Does the matcher claim a call by name alone, rather than by tracing the
   symbol to its own package?
5. Where no runtime fallback can give the right answer, is a diagnostic emitted
   naming the file, the call and what to write instead — or does it decline in
   silence?
6. Is machinery reimplemented that `@fulcro/transform-core` already has?

**Laziness, memory and termination** — `collections-performance.md`

1. Does constructing the sequence do work? An operator that walks its source
   while being built has turned a description of work into the work.
2. Is the projection invoked once per element produced — not per element
   inspected, not twice, unless the documentation says it caches?
3. Is the source traversed twice? Invisible over an array, wrong or impossible
   over a generator or a stream.
4. Has a streaming operator acquired a buffer? Materialising to index into,
   collecting to count: each converts a bounded-memory promise into an
   unbounded one.
5. Does early termination propagate — `return()` on the underlying iterator,
   generators unwound, resources released?
6. Did the complexity class change, and is a cache justified by a counted
   comparison rather than by intuition?

**Concurrency and resources** — `concurrency.md`

1. Does a long-running operation take an `AbortSignal`, and is cancellation
   honoured in all three senses: work not yet started never starts, work in
   flight is told, the caller learns it was cancelled?
2. Is a promised concurrency limit held while errors are being handled and while
   the queue drains? The counter changes before the operation begins.
3. Is the queue bounded, or is backpressure applied? An unbounded queue is a
   memory leak that appears only under load.
4. Does every release — a worker returned, a lock, a handle, a listener — run on
   failure and on cancellation, in a `finally` rather than at the end of the
   happy path?
5. Can a rejection escape unhandled, and does one task failing settle its
   siblings the way the API says?

**Errors, names and shape** — `general.md`

1. Does a thrown error name the operation, the value that broke it and what was
   expected?
2. Is a failure swallowed by a `catch` that discards it?
3. Do exported names describe the concept rather than the implementation, and is
   every exported symbol documented?
4. Is an abstraction introduced for a second case that has not arrived — an
   interface with one implementation, an option nobody passes?
5. Do comments say why, or do they restate the line above them?

**Package boundaries** — `.claude/CLAUDE.md`

1. Does a package import from another's `src/` rather than from its public
   entry point?
2. Does `@fulcro/collections` reach for `@fulcro/reflect`, or either transformer
   for the other? `.claude/CLAUDE.md` says neither knows the other exists.
3. Did a dependency appear in a package that `.claude/CLAUDE.md`'s table lists
   as having none?

**Tests** — `testing.md`

1. Does the feature carry a behaviour suite **and** a performance suite? One
   without the other is unfinished, and the missing one is a `HIGH`.
2. Is performance counted rather than timed — elements pulled, projections
   invoked, comparisons made — with the clock used only for a same-run ratio or
   a generous smoke ceiling?
3. Is the input the shape the code will meet: enough elements for the cost to
   separate from the harness, keys that collide, an order that is not already
   sorted?
4. Is a concurrency limit proven at its peak — in-flight counted, maximum
   asserted — rather than by how long the run took?
5. Is the suite in the right place? `packages/*/src` proves the feature with the
   transformers applied; `tests/` proves what a consumer gets without them, and
   a test moved between them stops asserting what it was written for.
6. One file per utility. A spec grouped by theme is a finding.
7. Was a test changed to accommodate the implementation rather than the other
   way round?

**Documentation** — `.claude/CLAUDE.md`

1. Does a changed public surface leave its `docs/` page describing the old one?
2. Does every changed English page still have its `pt-BR` counterpart, and do
   the two still link to each other?

**Release** — `release.md`, `git.md`

1. Does a change under `packages/*/src/**` carry a changeset? Without one the
   release-readiness workflow fails the pull request, and this is a `BLOCKER`.
2. Does the recorded bump match the claim — major where something stops
   compiling for somebody?
3. Is a `version` field edited by hand?
4. Does the branch carry two unrelated changes, which cannot be reverted or
   released separately?
5. Is emitted output committed under `packages/*/src/`? `build-output.md` says
   the bug is the `rootDir`/`outDir` pair, not the file.

### Severity

Five levels, and no others. There is no score, no grade and no verdict on
whether the change is good — the report is a list of findings.

| Level     | Means                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKER` | It cannot merge: a break with no bump, a missing changeset, a surface change slipped into an implementation commit                                                      |
| `HIGH`    | A contract is broken and a consumer will feel it: a lost inference, a buffering streaming operator, a release that does not run on failure, a missing performance suite |
| `MEDIUM`  | A contract is broken where the blast radius is contained: a test in the wrong project, an error that names nothing                                                      |
| `LOW`     | A contract holds but narrowly: a comment restating the code, an abstraction ahead of its second case                                                                    |
| `NOTE`    | Something the reader should know that is nobody's fault: a platform half not covered, a decision worth recording                                                        |

**Tests passing is not an approval.** Every failure this skill exists to catch
passes the suites — that is why it exists. `/verify` says whether the checks are
green; this report says whether the contracts hold, and the two answers are
independent.

**A documented exception is not a finding.** Where the repository has already
argued a case through — the tracked fixtures under `packages/*/src/**/fixtures/`
that `build-output.md` names, a buffering operator that says in its
documentation that buffering is its whole purpose, a cache with its counted
evidence beside it — the review says nothing. Re-reporting a decision someone
wrote down teaches its reader to skim.

**Duplicates collapse.** The same violation in six files is one finding with the
six locations and a count, not six rows.

## 3. Change

Nothing. No edit, no reformat, no added test, no changeset, no commit, and no
suite run. A finding whose fix is one line is reported with that line described
in words, and applying it is someone else's turn.

## 4. Verify

The report is verified when each finding survives all four:

- **The location opens.** `file:line` taken from the file as read, not from the
  diff's line numbering.
- **The invariant is quoted.** The rule file and the sentence it holds. A
  finding whose invariant cannot be named is deleted before the report is
  written, not demoted to `LOW`.
- **The evidence was observed.** The lines as they are in the file, the
  signature before and after, the absent spec named by the path it would have.
  Never a suite result — this skill runs none, and a claim that something fails
  is `/verify`'s or `/diagnose`'s to make.
- **The impact is concrete.** Who notices, and when. "A consumer calling `map`
  over a generator gets a second traversal" — not "this is risky".

`Reviewed` lists what was read. A surface in scope that was not read is listed
under `Not reviewed` with the reason, and its absence makes the status
`PARTIAL`.

## Stop

Halt and hand back when:

- **There is nothing to review** — an empty diff, or an argument naming a path
  the change does not touch.
- **A source cannot be read** — `gh` unavailable for a pull request, a file
  outside the checkout. Say which, review what remains, report `PARTIAL`.
- **A finding needs a change to decide.** Report it as open with what would
  settle it. The review never edits to confirm a hypothesis, and never runs a
  suite to see.
- **The change is a public surface proposal.** Report it as review territory
  under `api-design.md` and stop; this skill does not approve one.
- **The next step is a human's.** Push, merge, publish and discarding
  uncommitted work are refused by the hooks —
  `.claude/rules/protected-operations.md`.

## Output

The same six sections, in this order, every run — including the run that finds
nothing.

```text
Status:       CLEAN | FINDINGS | PARTIAL
Reviewed:     the paths read, and the contracts each was read against
Not reviewed: anything in scope that was not read, with why
Findings:     the table below, ordered BLOCKER first
Detail:       one paragraph per finding — observed, invariant, impact, evidence, action
Surface:      whether the public surface moved, and whether a changeset records it
```

The table:

```text
| # | Severity | Where | Dimension | Finding |
```

Then, below it, one paragraph per finding carrying the six things F09 asks of
each: **location**, **observed behaviour**, **violated invariant** (with the
file that states it), **impact**, **evidence** (the lines, verbatim), and
**recommended action** — described, never applied.

**When nothing is found:** `Status: CLEAN`, the `Reviewed` list, `Findings:
none`, the surface line. Do not end with a question, do not offer to fix what
was not found, and do not say the change is approved — the report is what it is.

## Commands

Read-only, all of them. No build, no suite, no formatter.

```sh
git status --short
git diff --stat main...HEAD
git diff main...HEAD
git log --oneline main...HEAD
gh pr view 42
gh pr diff 42
```

`npm run build`, `npx vitest run --configLoader native` and the rest of
`.claude/CLAUDE.md`'s table belong to `/verify`. This skill names them in a
recommendation and does not run them.

## References

- `.claude/CLAUDE.md` — the project contract, the package table, and what
  counts as public API.
- `.claude/rules/api-design.md` — the surface, inference included.
- `.claude/rules/transformers.md` — the transformer and the runtime as one
  feature.
- `.claude/rules/collections-performance.md` — laziness, one traversal, bounded
  memory, early exit.
- `.claude/rules/concurrency.md` — cancellation, bounds, release under failure.
- `.claude/rules/testing.md` — two suites, and performance counted.
- `.claude/rules/general.md` — names, errors, comments, when to abstract.
- `.claude/rules/build-output.md` — why emitted output beside source is a
  tsconfig bug.
- `.claude/rules/release.md` and `.claude/rules/git.md` — the changeset gate and
  the commit shape.
- `.claude/rules/protected-operations.md` — what no skill performs.
- `docs/testing.md` — the full testing standard.
- `.claude/skills/verify/SKILL.md` — whether the checks pass.
- `.claude/skills/diagnose/SKILL.md` — one defect, taken to its cause.
- `.claude/skills/test-gap/SKILL.md` — the scenarios a unit still owes its
  suites.
- `.claude/skills/implement-feature/SKILL.md` — the contract while the code is
  being written.
- `tools/claude/skill-evals/fulcro-review.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "Review the branch before I open the pull request."
- "I changed `take` and `takeWhile` — does this still hold up?"
- "Read PR 42 against our rules."
- "Anything wrong with the worker pool change?"

**Do not use this skill when:**

- "Is the tree green?" That is `/verify`, which runs the checks.
- "The reflect suite fails on `defaultOf` — why?" That is `/diagnose`.
- "Clean up every warning." That is `/fix-warnings`.
- "Review this skill I wrote." That is `skill-authoring`'s checklist.
