# Measuring the baseline version

Read this only when §2.3 of `SKILL.md` chose **path B**: the counted evidence
that already exists is not enough, and the earlier version has to be run.

Path A — reading the counts the candidate's own suites print, against the
bounds the baseline committed — needs none of this, and is the path to exhaust
first. What follows is expensive: a second checkout, a second install, a second
build. Say so before starting it, and say it again in the report.

## The candidate is never moved

The working tree stays exactly as it is. Nothing is stashed, nothing is
checked out over it, nothing is reset. `.claude/rules/protected-operations.md`
is why discarding uncommitted work is not this skill's to do, and a benchmark
that begins by hiding the user's edits is a benchmark they cannot repeat.

The earlier version is therefore read in a **separate worktree**, detached, in
the scratchpad directory:

```sh
git worktree add --detach <scratchpad>/baseline <ref>
```

`<ref>` is the one §2.2 settled — usually `git merge-base HEAD origin/dev`, or
the commit the user named. `--detach` matters: a named branch checked out
twice is a worktree the next `git checkout` in the primary tree refuses.

## The measurement code is the candidate's, on both sides

This is the whole point of the exercise and the easiest thing to get wrong. If
the baseline runs the suite as it was written then, and the candidate runs the
suite as it is now, a changed counter proves only that the suite changed.

So: the measurement file — the spec that prints the counts, whether it is a
committed performance suite or one written for this run — is **copied from the
candidate into the baseline worktree** before the baseline runs. One file, one
workload, one set of counters, two implementations underneath it.

Where the candidate's suite instruments a signature the baseline does not have
— a parameter that did not exist, an operator that was renamed — it will not
compile there. That is not a workaround to find: it is a finding, and it means
the comparison is between two different APIs. Report it as such and stop, with
`.claude/rules/api-design.md` as what the change is really being measured
against.

## Installing and building it

A worktree gets none of the primary tree's `node_modules`, and the transformers
are loaded from `dist`, so both steps are needed before any number is real:

```sh
npm ci
npm run build
```

`npm ci` in the baseline worktree installs the lockfile as it stood at `<ref>`,
which is correct: a dependency bump between the two versions is part of what is
being compared, not noise to be normalised away. If `npm ci` fails there
because the lockfile predates a workspace, the comparison is across a
repository layout change — report that and stop rather than editing the
baseline checkout into compiling.

Nothing in the baseline worktree is ever edited except by the file copy above.
It is a read of history, and a history edited to produce a better number is not
a baseline.

## Running the two sides

Same project, same command, one after the other, on the same machine, with
nothing else running:

```sh
npx vitest run --project collections --configLoader native
```

Three runs of each, alternating baseline and candidate rather than three of one
and then three of the other — a machine that warms up or throttles halfway
through otherwise donates its drift entirely to the side that ran second.

Counts must be identical across the three runs of a side. If they are not, the
measurement is not deterministic and no delta computed from it means anything;
`SKILL.md`'s stop conditions cover that case.

## Removing it

The worktree is removed when the run is over, and its removal is reported:

```sh
git worktree remove <scratchpad>/baseline
git worktree list
```

`git worktree list` is what confirms it went. A stale worktree left behind
holds a lock on a commit and confuses the next `git worktree add` at the same
path, which is a puzzle the next session inherits with no idea where it came
from.

If the user asked to keep it — to look at the earlier code themselves — say
that it was kept, name its path, and name the command above as what removes it.
