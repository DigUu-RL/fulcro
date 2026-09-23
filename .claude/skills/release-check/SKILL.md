---
name: release-check
description: Answers whether the tree is technically ready to be released, without releasing it — a known git state, the build, typecheck, suites, lint and formatting, the entry points, the API, documentation and dependency audits, the changesets, the package versions against the registry and the tags, the `dist` output, the `exports` and `files` lists, and the assumptions the release workflows make — and reports each check with the evidence it was answered from. Use before opening the pull request to `main`, before a release is cut, or when asked whether a version is ready to go out.
disable-model-invocation: true
allowed-tools: Skill, Read, Grep, Glob, Bash(npm run build), Bash(npm run typecheck), Bash(npm run format:check), Bash(npm run lint:md), Bash(npm run validate:claude), Bash(npx vitest run:*), Bash(npx eslint:*), Bash(npm ls:*), Bash(npm view:*), Bash(npm pack --dry-run:*), Bash(npm pkg get:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git tag:*), Bash(git describe:*), Bash(git ls-files:*), Bash(git ls-remote --tags:*), Bash(node --version), Bash(npm --version)
argument-hint: '[package name | --reuse to keep the reports this session already produced | nothing for the whole tree]'
---

# release-check

A release is the one step this repository cannot take back. `.claude/rules/release.md`
says why in a sentence — a version on npm stays there, and a consumer installing
it gets whatever was in `dist` when the workflow ran. This skill is the pass that
happens before that, and it answers one question: is this tree ready, and what is
the evidence.

The failures it exists for are the ones that go green. `changeset publish` skips
versions that already exist, so a merge carrying a pending changeset nobody
applied releases nothing at all and reports success doing it —
`.github/workflows/release-readiness.yml` was written for exactly that shape. An
`exports` path that resolves here and not inside the tarball is a consumer's
module error and no suite of ours imports it. A `.d.ts` that fails to resolve is
an editor showing `any`, and nothing runtime notices. Each of those passes CI.

**This skill releases nothing.** It does not publish, does not push, does not
create a tag, does not apply a changeset, does not edit a version. Those are a
human's, the hooks refuse most of them outright, and
`.claude/rules/protected-operations.md` says how each one is actually performed.

**Where it sits next to the neighbours.** `/verify` answers whether the tree is
green; this skill takes that answer and asks the further question a green tree
does not settle — whether what would ship is what was reviewed, and whether
anything would ship at all. `/api-audit`, `/docs-sync` and `/dependency-audit`
each own one surface of that, and this skill runs them rather than re-deriving
what they read. `/pre-merge` is the wider gate that will call this one.

## Invocation

**The model may not invoke it**, and `disable-model-invocation: true` is set for
two reasons. The first is timing: cutting a release is a decision, and a pass
that announces readiness on its own initiative turns a decision into a nudge.
The second is cost and reach — a full run is a clean build, the whole Vitest
matrix, three delegated audits, and `npm view` against the registry for every
package. `.claude/skills/skill-authoring/SKILL.md` §4 puts both on this side of
the line.

`context: fork` is deliberately **not** set. The run invokes other skills and
carries their reports into its own, and half of what makes a finding
release-blocking rather than a note lives in the conversation that led here —
which release, which packages, what was already agreed.

## When this applies

- a pull request from `dev` to `main` is about to be opened;
- a release is about to be cut, or has just been prepared and needs reading;
- the question is whether a version will actually reach npm;
- a package is being released for the first time;
- after a merge to `main`, before the release workflow is allowed to matter.

It does not apply when:

- **The question is whether the checks pass.** Build, typecheck, suites, lint,
  formatting: `.claude/skills/verify/SKILL.md` is that pass, and this skill
  delegates checks 2–7 to it rather than repeating them.
- **The question is one surface.** What a consumer sees of the exports is
  `.claude/skills/api-audit/SKILL.md`; what they also install is
  `.claude/skills/dependency-audit/SKILL.md`; what the pages claim is
  `.claude/skills/docs-sync/SKILL.md`. Each is worth running alone when that is
  the question.
- **Something is failing.** A red suite with no established cause is
  `.claude/skills/diagnose/SKILL.md`, which starts from the reproduction.
- **The request is to perform the release.** Publishing, pushing, merging and
  tagging are not this skill's and not any skill's.
  `.claude/rules/protected-operations.md`.
- **Nothing has moved since the last run.** Say what that run found.

## Arguments

| Argument       | What is checked                                                       |
| -------------- | --------------------------------------------------------------------- |
| none           | Every package, every check                                            |
| a package name | The per-package checks narrowed to it; the tree-wide checks still run |
| `--reuse`      | The delegated reports already produced in this session, not re-run    |

`--reuse` holds only while the tree has not moved since those reports were
produced: `git status --short` and `git diff --stat` must match what they were
read against. Where they do not, the delegated check is re-run and the report
says it was. A reused report carries the point in the session it came from, and
never a status nobody observed.

With a package name and no such package under `packages/`, say so and stop
rather than widening to the set.

## Before starting

- **The tree is installed and matches the lockfile.** `npm ls --depth=0`
  reporting a missing or invalid entry makes every check below it an assertion
  about a tree nobody has. Report `BLOCKED` and stop; this skill does not
  install to repair its own prerequisite.
- **The working tree is a known state.** Check 1 decides what that means, and it
  runs first because every other check reads artifacts built from it.
- **Registry reachability is established once.** The first `npm view` either
  answers or does not. Where it does not, check 12 is reported as not run with
  the error, and the status is `BLOCKED` — a version's fate on the registry is
  the one thing in this report that cannot be inferred from the checkout.
- **The build is this run's.** `dist/` from an earlier session is output nobody
  watched being produced; `.claude/rules/build-output.md` is why a stale one
  reads as a broken import rather than as stale output.

## 1. Read

Named sources, in this order. Nothing recalled from memory, and no version,
tag or status stated that was not read from a command in this session.

| #   | Source                                            | What it settles                       |
| --- | ------------------------------------------------- | ------------------------------------- |
| 1   | `git status --short`, `git branch --show-current` | The state and the branch              |
| 2   | `git log --oneline origin/main..HEAD`             | What a merge would carry              |
| 3   | `npm pkg get name version --workspaces --json`    | The versions that would publish       |
| 4   | The five manifests, in full                       | `exports`, `files`, `sideEffects`     |
| 5   | `.changeset/`                                     | What is pending and what was applied  |
| 6   | `.changeset/config.json`                          | The `fixed` group and the base branch |
| 7   | `git tag --list`                                  | Which versions were already released  |
| 8   | `npm view <name> version`                         | What the registry already has         |
| 9   | `.github/workflows/release.yml`                   | What the publish assumes              |
| 10  | `.github/workflows/release-readiness.yml`         | What the pull request has to satisfy  |
| 11  | `.github/workflows/prepare-release.yml`           | How the bump is meant to arrive       |
| 12  | `.github/workflows/ci.yml`                        | The matrix the release waits on       |

Sources 3, 7 and 8 are the three halves of check 12, and reading two of them is
how a report concludes a release will happen when it will not. Source 6 is what
says which packages move together: four of the five are a `fixed` group and one
is not, so a bump that looks partial may be correct and a bump that looks
complete may not be.

## 2. The sixteen checks

`checks.md` is each one: what it reads, what counts, and the decisions this
repository has already argued through. The table is the index, and the last
column is what a failure of it means for the release.

| #   | Check                        | Blocking | Owner               |
| --- | ---------------------------- | -------- | ------------------- |
| 1   | Git state                    | yes      | this skill          |
| 2   | Build                        | yes      | `/verify`           |
| 3   | Typecheck                    | yes      | `/verify`           |
| 4   | Tests                        | yes      | `/verify`           |
| 5   | Lint                         | yes      | `/verify`           |
| 6   | Format                       | yes      | `/verify`           |
| 7   | Entry points and packages    | yes      | `/verify`           |
| 8   | API surface                  | yes      | `/api-audit`        |
| 9   | Documentation                | no       | `/docs-sync`        |
| 10  | Dependencies                 | yes      | `/dependency-audit` |
| 11  | Changesets                   | yes      | this skill          |
| 12  | Package versions             | yes      | this skill          |
| 13  | `dist` output                | yes      | this skill          |
| 14  | `exports` and `files` lists  | yes      | this skill          |
| 15  | Release workflow assumptions | partly   | this skill          |
| 16  | Unresolved blockers          | yes      | this skill          |

Checks 11 to 14 are the ones that survive a green suite most often, and they are
read first when time is short: each of them is a release that runs, reports
success, and delivers nothing or delivers the wrong thing.

Check 9 is not release-blocking because a wrong page breaks nobody's install —
but `.claude/CLAUDE.md` makes documentation part of a finished change, and a
release carrying documented drift ships a promise the code does not keep. Its
findings are reported in full and cap the status at `WARN`.

## 3. Delegate

Checks 2 to 10 belong to skills that already own them. They are invoked, not
re-implemented, and their reports are carried into this one whole:

| Order | Skill               | Invoked as  | What is taken                          |
| ----- | ------------------- | ----------- | -------------------------------------- |
| 1     | `/verify`           | `full`      | Checks 2–7, per check, with exit codes |
| 2     | `/api-audit`        | no argument | Check 8, the findings and the bump     |
| 3     | `/dependency-audit` | no argument | Check 10, the findings and the bump    |
| 4     | `/docs-sync`        | `--all`     | Check 9, the drift it located          |

`/verify full` runs first because three of the others read built output, and
because a tree that does not build makes every audit below it an audit of
unknown artifacts.

A delegated skill that halts on its own stop condition is not retried and not
worked around. Its status is recorded as it reported it, the check it owns is
marked not answered, and this report's status follows §4. A delegated `PARTIAL`
never becomes a `PASS` here.

## 4. Decide

### The four statuses

From `.roadmap/features/F19-release-check.md`, and they mean exactly this:

| Status    | Means                                                                     |
| --------- | ------------------------------------------------------------------------- |
| `PASS`    | Every release-blocking check ran and has evidence, and nothing is open    |
| `WARN`    | Every blocking check passed; only non-blocking uncertainties remain       |
| `BLOCKED` | A prerequisite or a release artifact is missing, so a check has no answer |
| `FAILED`  | A release-blocking check failed                                           |

Precedence, when more than one applies: `FAILED`, then `BLOCKED`, then `WARN`,
then `PASS`. A failed check is a definite no and a blocked one is an unknown, so
the definite no is what the status says — and the blocked check is still listed
with the reason it could not be answered.

**`PASS` is the narrow one.** It requires that every blocking check was
_observed_ to pass in this run or in a reused report from this session. A
blocking check that was skipped, inferred, or answered from a previous session
makes the status `BLOCKED`, whatever the rest did. This is the claim the whole
report exists to make carefully: somebody merges on it.

### What counts as release-blocking

A finding blocks when a consumer of the published version is affected, or when
the release would not deliver what it claims:

- the build, typecheck, suites, lint or formatting are red;
- an `exports` path, a declaration or a `files` list does not resolve inside the
  tarball — check 14, and the consumer's error is a module error;
- a version in the manifests already exists on the registry, so `changeset
publish` skips it and the merge ships nothing — check 12;
- a shipped source change with no version to carry it — check 11, which is also
  what `.github/workflows/release-readiness.yml` fails the pull request for;
- a `BLOCKER` from `/api-audit` or `/dependency-audit`;
- a package that has never been published, since the release workflow refuses a
  first publish and says so — check 15.

### What does not block

- **A `LOW` or a `NOTE` from a delegated audit.** Reported under its check,
  counted as a non-blocking uncertainty, and that is `WARN`'s whole job.
- **The half of the matrix this machine is not.** A run here covers one
  operating system and one Node line, and `.claude/rules/release.md` says a
  release goes out when the full matrix is green. The report names which half it
  observed and defers the rest to CI — it does not claim it, and it does not
  fail for it.
- **A version that is merely not the newest**, in a dependency or in a package.
  Newer is not a finding; check 12 is about what is already taken.
- **Documented drift under check 9**, per the note in §2.
- **A pending changeset on `dev` before `Prepare release` has run.** That is the
  ordinary state of the working branch. It blocks the pull request to `main`,
  which is what check 11 says and when it says it.

### The severity of a delegated finding is not re-judged

A `BLOCKER` from `/api-audit` is a `BLOCKER` here. Re-grading a delegated
finding down because the release is wanted today is the one move that would make
this report worthless, and the audits use the five levels of
`.claude/skills/fulcro-review/SKILL.md` precisely so two reports can be read
side by side.

## 5. Change

Nothing. Not a version, not a manifest, not a changeset, not a tag, not a
formatting pass over a file check 6 reported. A release is judged over the tree
as it stands, and a tree edited mid-pass is not the tree the earlier checks were
answered against.

`npm run build`, `npm run typecheck` and the suites run — through `/verify` —
over that tree, and their output is the evidence. Nothing else is executed.

### The three prohibitions

From `.roadmap/features/F19-release-check.md`, and each one is a thing the
report may not do rather than a thing it may not say:

- **Never publish.** Not `npm run release`, not `changeset publish`, not a
  workspace publish of one package. The hooks refuse them and
  `.claude/rules/release.md` says the workflow is what publishes, from `main`,
  after the merge.
- **Never push.** Including a push of tags, which is a step inside the release
  and not a tidy-up.
- **Never create a release tag.** `changeset publish` writes the tags, in the
  workflow, from the versions it actually published. A tag written here names a
  version that may never exist and the check that reads tags would then believe
  it.

A fourth follows from the first three: **never recommend widening or skipping a
check to make a release possible today.** A check that cannot be satisfied is
reported with what would satisfy it.

## 6. Verify

The report is verified when every row survives all five, and a row that does not
is marked not answered rather than softened:

- **The evidence was observed in this run**, or in a reused report this session
  produced. A command's output, quoted; an exit status, recorded; a registry
  answer, with the date it was read.
- **Both halves of a version claim were read.** The manifest and the registry,
  or the manifest and the tag list. A row stating one and inferring the other
  names which half it has.
- **Each delegated check carries the delegated status**, spelled as that skill
  spelled it, and the invocation that produced it.
- **The consumer is concrete** for every blocking finding: which install fails,
  which import does not resolve, which version never arrives.
- **The status follows §4 mechanically.** Re-derive it from the rows rather than
  writing the one the run felt like.

## Stop

Halt and hand back when:

- **The tree does not match the lockfile**, or the working tree is dirty in a
  way check 1 blocks on. Report `BLOCKED` with what was read, and stop.
- **A delegated skill stops on its own condition.** Record what it reported and
  continue with the remaining checks; never re-run it with a narrower scope to
  get a cleaner answer.
- **The registry is unreachable.** Check 12 is not run, the error is quoted, and
  the status is `BLOCKED`. A version's availability is never answered from the
  tag list alone.
- **A build or a suite fails for a reason this pass did not cause.** Quote it,
  mark the check failed, and leave the cause to `/diagnose`.
- **The finding is a public surface change nobody proposed.**
  `.claude/rules/api-design.md` makes that review territory before it is a
  version number, and this skill reports it rather than deciding the bump.
- **The next step is a human's.** Push, merge, publish, tag, and discarding
  uncommitted work. `.claude/rules/protected-operations.md`.

## Output

The same seven sections, in this order, every run — including the run where
everything passes.

```text
Status:     PASS | WARN | BLOCKED | FAILED
Release:    the branch, the commit, and the versions that would publish
Checks:     the table below, all sixteen, none omitted
Blocking:   one block per release-blocking failure, with its evidence
Open:       the non-blocking uncertainties, each with what would settle it
Not run:    which checks had no answer, and why
Next:       what a human does next, in order, and who does it
```

The checks table:

```text
| #  | Check | Verdict | Evidence |
```

`Verdict` is `pass`, `fail`, `warn` or `not run`, and `Evidence` is the command,
the delegated report, or the file and field the row was answered from. Sixteen
rows, always: a check with nothing to say says `pass` with what it read, and a
check that did not run says so rather than being left out.

Under `Next`, the ordered human steps and no more — record the bump with
`npm run changeset`, dispatch `Prepare release`, open the pull request, merge
it. Each one named as the person's, never as something about to be done here.

**When everything passes:** `Status: PASS`, the release line, the sixteen rows,
`Blocking: none`, the open uncertainties if any, and `Next`. Do not end with an
offer to release.

Then the same figures once more, for `/pre-merge` and anything else reading the
run rather than a person:

```json
{
	"skill": "release-check",
	"status": "PASS",
	"branch": "dev",
	"commit": "944907d",
	"versions": [{ "name": "@fulcro/parallel", "version": "0.1.1" }],
	"checks": [
		{ "n": 1, "check": "git-state", "verdict": "pass", "blocking": true },
		{
			"n": 4,
			"check": "tests",
			"verdict": "pass",
			"blocking": true,
			"delegate": { "skill": "verify", "status": "PASS", "observed": true }
		}
	],
	"blocking": [],
	"open": [],
	"not_run": [],
	"platforms": ["win32"]
}
```

`observed` is `true` only for a report this session produced. A delegated status
is never given a value the run did not see, and a check absent from `checks` is
a malformed report rather than a passing one.

## Commands

From `.claude/CLAUDE.md`'s table and the root `package.json`. The reads:

```sh
git status --short
git branch --show-current
git log --oneline origin/main..HEAD
git tag --list
git ls-remote --tags origin
npm pkg get name version --workspaces --json
npm ls --depth=0
npm view @fulcro/collections version
npm pack --dry-run --workspace @fulcro/collections --json
node --version
npm --version
```

The checks `/verify full` runs on this skill's behalf, listed so the report can
name them as they are spelled:

```sh
npm run build
npm run typecheck
npx vitest run --configLoader native
npx eslint .
npm run format:check
npm run lint:md
npm run validate:claude
```

`npm run changeset` records a bump and `npm run version-packages` applies the
pending ones; `npm run release` publishes. This skill runs none of the three and
names them so the report can say which one a human owes.

## References

- `checks.md` — the sixteen, each with what it reads and what counts.
- `.claude/rules/release.md` — the release is the built output, and Claude does
  not publish it.
- `.claude/rules/protected-operations.md` — push, publish, merge and tag.
- `.claude/rules/git.md` — the branch model and which bump a change claims.
- `.claude/rules/build-output.md` — why `dist` and never beside the source.
- `.claude/rules/api-design.md` — the public surface, and inference as part of it.
- `.github/workflows/release.yml` — what the publish assumes and refuses.
- `.github/workflows/release-readiness.yml` — why a shipped change without a
  version merges green and reaches nobody.
- `.github/workflows/prepare-release.yml` — how the bump is meant to arrive.
- `.github/workflows/ci.yml` — the matrix the release waits on.
- `.changeset/config.json` — the `fixed` group and the base branch.
- `.claude/skills/verify/SKILL.md` — checks 2 to 7.
- `.claude/skills/api-audit/SKILL.md` — check 8.
- `.claude/skills/docs-sync/SKILL.md` — check 9.
- `.claude/skills/dependency-audit/SKILL.md` — check 10.
- `.claude/skills/diagnose/SKILL.md` — a failure with no established cause.
- `tools/claude/skill-evals/release-check.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "I'm about to open the pull request from `dev` to `main`. Is it ready?"
- "Will merging this actually publish anything?"
- "We want to cut a release today — what is outstanding?"
- "`@fulcro/parallel` has a fix waiting. Is the tree ready to ship it?"

**Do not use this skill when:**

- "Is the tree green before I commit?" That is `/verify`, and this skill runs it
  as one of sixteen checks.
- "What changed in our exports since the last tag?" That is `/api-audit` on its
  own.
- "Publish it." Publishing is a human's, and the hooks refuse it.
- "The entry point suite is failing." That is `/diagnose`: there is a failure to
  start from.
