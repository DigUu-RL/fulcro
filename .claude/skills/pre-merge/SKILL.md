---
name: pre-merge
description: Answers whether one branch is ready to merge into its target, without merging it — snapshots the merge diff, classifies every changed path and signal, runs `/verify` and `/fulcro-review` always and only the audits that diff owes (`/test-gap`, `/api-audit`, `/transformer-audit`, `/perf-regression`, `/concurrency-audit`, `/dependency-audit`, `/docs-sync`, `/release-check` toward `main`), delegates to the reviewer subagents where the diff calls for them, and aggregates every child status unaltered into one merge-readiness report. Use before opening or merging a pull request, or when asked whether a branch can go in.
disable-model-invocation: true
allowed-tools: Skill, Agent, Read, Grep, Glob, Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git merge-base:*), Bash(git rev-parse:*), Bash(git ls-files:*), Bash(git branch --show-current)
argument-hint: '[target branch | --reuse to keep the reports this session already produced | nothing for the branch this one merges into]'
---

# pre-merge

A pull request is merged on one judgement, and this repository already has a
skill for every part of it: `/verify` says whether the tree is green,
`/fulcro-review` reads the diff against the contracts, and seven audits each
own one surface. What none of them does is decide which of the others a given
diff owes, or say what they add up to. This skill is that decision and that
sum.

The two failures it exists for point in opposite directions. Running every
audit on every change costs a clean build per audit and is abandoned within a
week, after which nothing runs at all. Running only the ones that feel relevant
is how a runtime-only edit to `packages/reflect/src` merges without the
transformer audit, while the matcher that recognises that call now points at a
shape that no longer exists — and every suite stays green, because the call
declines to the runtime fallback. So the diff chooses the audits, by a table a
second run applies the same way, and an ambiguous path takes the broader set.

**This skill merges nothing.** It does not push, does not merge, does not
publish, and does not edit a file to make a check pass. It runs other skills
and reads their reports. `.claude/rules/protected-operations.md` says how a
human performs each of the steps it hands back.

**Where it sits next to the neighbours.** `/verify` answers whether the tree is
green, and this skill carries its answer as one row. `/release-check` answers
whether a release would deliver what it claims; this skill runs it as one row
when the target is `main`, and not otherwise, because a merge into `dev`
releases nothing.

## Invocation

**The model may not invoke it**, and `disable-model-invocation: true` is set for
two reasons. The first is cost: the smallest run is a build, the affected
suites and a review, and a large one adds several audits that each build again.
The second is timing — a merge is a human's decision, and a gate that reports
readiness unasked turns the decision into a nudge.
`.claude/skills/skill-authoring/SKILL.md` §4 puts both on this side of the line.

`context: fork` is deliberately **not** set. The run invokes other skills and
delegates to subagents, and a fork can do neither. Five of the skills it calls
are forked themselves, and two of those — `/fulcro-review` and
`/transformer-audit` — end with a `NOTE` asking the parent to delegate to a
reviewer. This session is that parent.

## When this applies

- a pull request is about to be opened, from a feature branch into `dev` or
  from `dev` into `main`;
- a pull request is open and the question is whether to merge it;
- "is this branch ready?", "can this go in?", "what does this PR still need?".

It does not apply when:

- **The question is whether the checks pass.** That is
  `.claude/skills/verify/SKILL.md`, which this skill runs as its first row.
- **The question is one surface.** Each audit is worth running alone when that
  is the question, and running it alone costs a fraction of this.
- **The question is a release.** Whether a version reaches npm is
  `.claude/skills/release-check/SKILL.md`. This skill runs it only toward
  `main`.
- **Something is failing.** A red suite with no established cause is
  `.claude/skills/diagnose/SKILL.md`.
- **The request is to merge, push or publish.** Those are a human's, and the
  hooks refuse them.
- **Nothing has moved since the last run.** Say what that run found.

## Arguments

| Argument      | What is checked                                                  |
| ------------- | ---------------------------------------------------------------- |
| none          | This branch against its default target                           |
| a branch name | This branch against that target                                  |
| `--reuse`     | Reports already produced in this session are carried, not re-run |

The default target is `main` when the current branch is `dev`, and `dev` for
every other branch. `.claude/rules/git.md` is the branch model behind that.

`--reuse` holds only while the tree has not moved since a report was produced:
the commit and `git status --short` must match what that report was read
against. Where they do not, the child is re-run and the row says so. It is
also how a user-only child gets an answer — see §3.

## Before starting

- **The branch is not `main`.** Nothing merges from `main`. Say so and stop.
- **The working tree is clean.** A merge carries commits, not the working tree,
  while `/verify` and the audits read the working tree. A modified tracked file,
  or an untracked one under a path `surfaces.md` classifies, makes every row an
  answer about something the merge will not carry: report `BLOCKED` with the
  paths and stop. Nothing is stashed, committed or discarded to get past it.
- **The target resolves.** `git rev-parse --verify origin/<target>`, falling
  back to the local `<target>` and saying so. The remote ref is as fresh as the
  last fetch; this skill does not fetch, and the report names the ref it used.
- **There is something to merge.** An empty `git log <base>..HEAD` is a branch
  already merged or never started. Say so and stop.

## 1. Snapshot

Named commands, in this order, run once. Every later decision reads their
output, and nothing is recalled from memory.

| #   | Command                                                      | What it settles                    |
| --- | ------------------------------------------------------------ | ---------------------------------- |
| 1   | `git branch --show-current`, `git rev-parse --short HEAD`    | The branch and the commit          |
| 2   | `git status --short`                                         | That the tree is clean             |
| 3   | `git merge-base HEAD origin/<target>`                        | The base the pull request compares |
| 4   | `git log --oneline <base>..HEAD`                             | The commits the merge carries      |
| 5   | `git diff --name-status <base>...HEAD`                       | The changed paths, and new ones    |
| 6   | `git diff -U0 <base>...HEAD -- packages`                     | The signals `surfaces.md` reads    |
| 7   | `git ls-files packages/*/src/tests/**/*.performance.spec.ts` | Which units a suite counts         |

The snapshot is recorded in the report as the commit and the base, both as
short hashes. Every child report is valid for that pair and no other.

## 2. Classify

`surfaces.md` is the decision: twenty path rows and seven signal rows, each
naming the audits it owes. Match every changed path against every path row,
then every signal against the diff text from command 6, and take the union.

Three rules make a second run land on the same set:

- **Every match counts.** A path under `packages/parallel/src` is runtime,
  performance and concurrency at once, and owes all three sets.
- **Ambiguity takes the broader audit.** A path no row matches, a signal that
  cannot be ruled out from the diff, a hunk whose enclosing declaration git did
  not print: each is treated as matching every row it could. The
  `Classification` section names every path that was decided this way.
- **The arguments are the matched units.** Each owed audit is invoked with the
  package, path or transformer the match named, so it reads what this merge
  touched rather than what the branch has in common with `main`. An audit owed
  by more than one row is invoked once, with the union of its units.

An audit no row owes is `SKIPPED`, and its row says which surface was absent —
"no exports map, barrel or `export` line changed", not "not needed". A skip
with no reason is the thing this contract exists to make impossible.

## 3. Run

In this order. `/verify` runs first because four of the audits read `dist/`,
and a tree that does not build makes every one of them an audit of unknown
artifacts.

| Order | Child                | When                 | Invoked as                     |
| ----- | -------------------- | -------------------- | ------------------------------ |
| 1     | `/verify`            | always               | no argument                    |
| 2     | `/fulcro-review`     | always               | no argument                    |
| 3     | `/test-gap`          | P1, P2               | the changed paths              |
| 4     | `/api-audit`         | P4, P5, P20, S1, S2  | each package                   |
| 5     | `/transformer-audit` | P8–P10, S3           | `collections`, `reflect`, both |
| 6     | `/perf-regression`   | P3, P11, P12, S5     | the changed paths              |
| 7     | `/concurrency-audit` | P12, P13, S4         | the changed paths              |
| 8     | `/dependency-audit`  | P6, P7               | each package, or none          |
| 9     | `/docs-sync`         | P1, P14, P15, S1, S2 | each package or page           |
| 10    | `/release-check`     | the target is `main` | no argument                    |

Then the subagents, each handed the diff from §1 and the child reports that
concern it:

| Subagent                | When                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| `architecture-reviewer` | P16, S6, S7, or a `NOTE` from `/fulcro-review` asking for it                    |
| `transformer-reviewer`  | P8, P9, or a `NOTE` from `/fulcro-review` or `/transformer-audit` asking for it |
| `performance-reviewer`  | a `NOTE` asking for it, when `/perf-regression` did not already delegate to it  |

`.claude/CLAUDE.md` makes `/docs-sync` part of every finished change under
`packages/*/src/**`, which is why P1 owes it even when no page was edited.

**A child that halts is not retried and not worked around.** Its status is
recorded as it reported it, and it is never re-run with a narrower scope to get
a cleaner answer.

**A child that asks is answered by the user.** `/perf-regression` asks before a
second checkout; the question reaches the user through this session, and the
answer is theirs. Stopping there is a complete answer for that row.

**A child that cannot be invoked is `NOT RUN`.** `/dependency-audit` and
`/release-check` carry `disable-model-invocation: true` and the `Skill` tool may
refuse them from here. When it refuses, the row is `NOT RUN` with the refusal
quoted, and `Next` names the command the user types — after which
`/pre-merge --reuse` carries the report they produced. It is never assumed to
have passed.

## 4. Decide

### Each row

A child's status is carried, never re-judged. The row's verdict is a
translation of it, and the translation is fixed:

| Child status                                  | Row verdict |
| --------------------------------------------- | ----------- |
| `PASS`, `CLEAN`, `COMPLETE`                   | `PASS`      |
| `FINDINGS`, `GAPS` with a `BLOCKER` or `HIGH` | `FAIL`      |
| `FINDINGS`, `GAPS` with `MEDIUM` and below    | `WARN`      |
| `WARN`, `NOT MEASURABLE`                      | `WARN`      |
| `FAIL`, `FAILED`, `REGRESSED`                 | `FAIL`      |
| `PARTIAL`, `BLOCKED`                          | `BLOCKED`   |
| refused, or stopped before it reported        | `NOT RUN`   |
| owed by no row                                | `SKIPPED`   |

A subagent memo is a row too, and its findings translate the same way.

**`HIGH` blocks a merge**, where `/release-check` blocks only on `BLOCKER`.
Every child defines `HIGH` as a broken contract a consumer will feel — a lost
inference, a buffering operator, a missing performance suite — and a merge into
`dev` is where that starts travelling toward a release. A `HIGH` is lifted by a
fix or by the user waiving it explicitly, and a waiver is recorded in the
report with who gave it, never assumed from the change being small.

**A `PARTIAL` never becomes a `PASS`.** It is a child that did not answer all
of its own question, so its row is an unknown.

### The overall status

Precedence, when more than one applies: `FAILED`, then `BLOCKED`, then `WARN`,
then `PASS`.

| Status    | Means                                                                         |
| --------- | ----------------------------------------------------------------------------- |
| `PASS`    | Every owed row ran in this session or was reused under §3, and passed         |
| `WARN`    | No row failed or is unanswered; only non-blocking findings remain             |
| `BLOCKED` | An owed row is `BLOCKED` or `NOT RUN`, so the merge has a question unanswered |
| `FAILED`  | A row is `FAIL`                                                               |

`SKIPPED` rows do not affect the status, and only because §2 says why each one
was not owed. A row owed by the diff and not observed is `NOT RUN`, which is
`BLOCKED` — orchestration never turns an unknown into a pass, and never
overrides a child's `BLOCKED` or `FAILED` with a summary of the others.

**The half of the matrix this machine is not** is a `NOTE`, never a failure and
never a pass. `/verify` names which half it observed; CI covers the other.

## 5. Change

Nothing. Not a fix a child described, not a formatting pass, not a changeset,
not a commit. A merge is judged over the commit as it stands, and a tree edited
mid-pass is not the commit the earlier rows were answered against.

The children that may write — `/perf-regression` with a measurement file —
ask the user before they do, under their own contracts, and leave the working
tree as they found it. Their reports say so, and the row carries it.

## 6. Verify

The report is verified when every row survives all five, and a row that does
not is marked `NOT RUN` rather than softened:

- **The commit and base are still the snapshot's.** `git rev-parse --short HEAD`
  and `git status --short` at the end match §1. Where they do not, every row is
  stale and the status is `BLOCKED`.
- **Every owed audit has a row**, and every row is owed or `SKIPPED` with the
  surface that was absent.
- **Each row carries the child's status as the child spelled it**, the
  invocation that produced it, and whether this session observed it.
- **Each blocking finding is located** — the child, its severity, the file and
  line — and copied, not paraphrased.
- **The status follows §4 mechanically.** Re-derive it from the rows rather
  than writing the one the run felt like.

## Stop

Halt and hand back when:

- **The branch is `main`, the tree is dirty, or there is nothing to merge.**
  `BLOCKED` or a plain statement, per Before starting, before any child runs.
- **`/verify` reports `BLOCKED`** because the build cannot complete. The audits
  that read `dist/` are `NOT RUN` with that reason; the ones that read only the
  diff — `/fulcro-review`, `/test-gap`, `/docs-sync` — still run.
- **A child stops on its own condition.** Record what it reported and continue
  with the remaining rows.
- **A failure needs a cause.** That is `/diagnose`, with this report as its
  input. This skill does not investigate.
- **The finding is a public surface change nobody proposed.**
  `.claude/rules/api-design.md` makes that review territory before it is a
  merge, and the report says so rather than deciding it.
- **The next step is a human's.** Push, merge, publish and discarding
  uncommitted work. `.claude/rules/protected-operations.md`.

## Output

The same eight sections, in this order, every run — including the run where
everything passes.

```text
Pre-merge status
----------------
Merge:          <branch> @ <commit> into <target> (base <base>, <n> commits)
Classification: each surface, with the rows and paths that put it in scope
Rows:           the table below, one per child and subagent, none omitted
Blocking:       one block per FAIL or BLOCKED row, with the located findings
Non-blocking:   the WARN findings and NOTEs, each with its source
Not run:        the owed rows with no answer, why, and what would answer them
Overall:        PASS | WARN | BLOCKED | FAILED
Next:           what a human does next, in order
```

The rows, in the order of §3:

```text
| Row          | Verdict | Child status          | Invoked as              | Observed |
| Verification | PASS    | PASS                  | /verify                 | yes      |
| Review       | WARN    | FINDINGS (1 MEDIUM)   | /fulcro-review          | yes      |
| API audit    | SKIPPED | —                     | no exports map, barrel or export line changed | — |
```

`Observed` is `yes` for a report this session produced, `reused` for one
carried under `--reuse` with the point it came from, and `—` for a row that did
not run. Under `Next`, the human steps and no more — fix and re-run, run a
refused child and re-run with `--reuse`, open the pull request, merge it — each
named as the person's.

**When everything passes:** the merge line, the classification, every row,
`Blocking: none`, the notes if any, `Overall: PASS`, and `Next`. Do not end with
an offer to merge.

Then the same figures once more, for a workflow reading the run:

```json
{
	"skill": "pre-merge",
	"status": "WARN",
	"branch": "migrate",
	"target": "dev",
	"commit": "524ed75",
	"base": "2bfff6c",
	"surfaces": ["control plane"],
	"rows": [
		{
			"row": "verify",
			"verdict": "PASS",
			"child_status": "PASS",
			"invoked_as": "/verify",
			"observed": true
		},
		{
			"row": "api-audit",
			"verdict": "SKIPPED",
			"why": "no exports map, barrel or export line changed"
		}
	],
	"blocking": [],
	"non_blocking": [],
	"not_run": [],
	"waivers": [],
	"platforms": ["win32"]
}
```

`observed` is `true` only for a report this session produced. A row absent from
`rows` is a malformed report rather than a passing one.

## Commands

The snapshot, spelled as it is run:

```sh
git branch --show-current
git rev-parse --short HEAD
git rev-parse --verify origin/<target>
git status --short
git merge-base HEAD origin/<target>
git log --oneline <base>..HEAD
git diff --name-status <base>...HEAD
git diff -U0 <base>...HEAD -- packages
git ls-files packages/*/src/tests/**/*.performance.spec.ts
```

Every other command runs inside a child, under that child's own
`allowed-tools`. The ones a report most often names, from `.claude/CLAUDE.md`
and the root `package.json`, so the `Next` section can spell them:

```sh
npm run build
npm run typecheck
npx vitest run --configLoader native
npx eslint .
npm run format:check
npm run lint:md
npm run validate:claude
npm run changeset
```

## References

- `surfaces.md` — the path and signal tables §2 classifies with.
- `.claude/CLAUDE.md` — public API, documentation and the changeset gate.
- `.claude/rules/git.md` — the branch model behind the default target.
- `.claude/rules/protected-operations.md` — push, merge and publish.
- `.claude/rules/api-design.md` — what a public surface change is.
- `.claude/rules/transformers.md` — why a runtime diff can owe a transformer audit.
- `.claude/skills/verify/SKILL.md` — row 1.
- `.claude/skills/fulcro-review/SKILL.md` — row 2, and the five severities.
- `.claude/skills/test-gap/SKILL.md` — row 3.
- `.claude/skills/api-audit/SKILL.md` — row 4.
- `.claude/skills/transformer-audit/SKILL.md` — row 5.
- `.claude/skills/perf-regression/SKILL.md` — row 6.
- `.claude/skills/concurrency-audit/SKILL.md` — row 7.
- `.claude/skills/dependency-audit/SKILL.md` — row 8.
- `.claude/skills/docs-sync/SKILL.md` — row 9.
- `.claude/skills/release-check/SKILL.md` — row 10, toward `main` only.
- `.claude/agents/architecture-reviewer.md`, `.claude/agents/transformer-reviewer.md`,
  `.claude/agents/performance-reviewer.md` — the delegated rows.
- `.claude/skills/diagnose/SKILL.md` — a failure with no established cause.
- `tools/claude/skill-evals/pre-merge.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "I'm about to open the PR for this branch into `dev`. Is it ready?"
- "Can `dev` go to `main`?"
- "PR #31 is green on CI — anything left before I merge it?"
- "I changed `selectMany` and its doc comment. What does this branch still owe?"

**Do not use this skill when:**

- "Is the tree green?" That is `/verify`, which this skill runs as one row.
- "What changed in our exports since the last tag?" That is `/api-audit` alone.
- "Merge it." Merging is a human's, and the hooks refuse it.
- "The transformer suite fails on Windows — why?" That is `/diagnose`.
