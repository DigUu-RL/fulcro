---
name: implement-feature
description: Builds one roadmap feature or one concrete change end to end — dependencies confirmed from the code rather than from a checkbox, a plan agreed before the first edit, the behaviour suite and the performance suite the standard requires, and the changeset when something ships. Use when a feature is to be implemented, named by roadmap ID, by feature name, or as a described change, and the work is larger than one obvious edit.
argument-hint: <feature id, feature name, or what to build>
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Write, WebFetch, WebSearch, Bash(npm run build), Bash(npm run typecheck), Bash(npm run format), Bash(npm run format:check), Bash(npm run lint:md), Bash(npm run validate:claude), Bash(npx vitest run:*), Bash(npx eslint:*), Bash(npm ls:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git branch:*), Bash(git switch:*)
---

# implement-feature

One feature, built to the contract this repository already states. The skill
reads the specification and its dependencies, confirms those dependencies from
the code rather than from a tick in a checklist, agrees a plan before touching
a file, implements the smallest coherent version of it, and leaves behind the
two suites, the documentation and the changeset that make the change shippable.

The failure this exists to prevent is the plausible feature: something that
compiles, passes the behaviour test somebody wrote for it, exports a name
nobody reviewed, walks a million elements to return five, and arrives with no
changeset — so it merges green and never reaches npm. Every one of those is
written down somewhere under `.claude/`. This skill is the order in which they
get applied.

**This skill writes.** It edits the working tree. It does not commit, branch
onto `main`, push, publish or merge, and it never adjusts a test to make its
own change pass.

## Invocation

`disable-model-invocation: true`. Not because implementing is irreversible —
edits are in git — but because the timing is the user's. This skill runs a
build and several suites, proposes an architecture, and expects an answer
before it writes. Firing it because a message mentioned a feature would start
that whole sequence on a sentence that was a question.

Invoke it by typing it. An ordinary implementation turn is still an ordinary
implementation turn; this is the procedure for the ones with a specification
behind them.

## When this applies

Use it when there is a change to build and more than one file will know:

- a roadmap feature by ID — `/implement-feature F13`;
- a feature by name, with a specification under `.roadmap/features/`;
- a concrete described change large enough to need a plan: a new operator, a
  transformer branch, a new package surface.

It does not apply when:

- **Something is failing and the cause is unknown.** That is one defect with a
  location: `.claude/skills/diagnose/SKILL.md`.
- **The request is the warnings as a body of work.** That is
  `.claude/skills/fix-warnings/SKILL.md`.
- **The request is to check a finished change.** That is
  `.claude/skills/verify/SKILL.md`.
- **The change is one obvious edit** — a typo, a doc line, a renamed local.
  Make it.
- **The request is a public surface change and nothing else.** A new export,
  a widened signature, a removed overload: that is a proposal first, under
  `.claude/rules/api-design.md`, and this skill's §2 stops there too.

## Arguments

One of:

| Argument            | Meaning                                                 |
| ------------------- | ------------------------------------------------------- |
| `F13`               | A roadmap ID; the specification is found under §1       |
| `transformer-audit` | A feature name; matched against the specification files |
| A described change  | No specification exists; §1 builds one with the user    |

With no argument, ask which feature and stop. There is no default feature, and
choosing one produces an implementation nobody asked for.

## Before starting

- `git status --short`. Uncommitted work is never stashed, discarded or
  committed to make room. If the tree carries unrelated changes, say so and ask
  whether to proceed — a mixed diff cannot be reviewed in one pass
  (`.claude/rules/git.md`).
- `git branch --show-current`. On `main`, branch from `dev` first and say so.
  One branch is one change; a branch already carrying an unrelated change is a
  second branch.
- The specification exists, or the user agrees to the one §1 writes down.
- Every direct dependency is implemented — not ticked, implemented. §1 says how
  that is established, and a missing one is a hard stop.

## 1. Read

Gather before proposing anything. Name every source; nothing here is recalled
from memory.

| #   | Source                                       | What it settles                           |
| --- | -------------------------------------------- | ----------------------------------------- |
| 1   | `.roadmap/features/<ID>-*.md`                | The objective, the checkboxes, the stops  |
| 2   | `.roadmap/MASTER-ROADMAP.md`                 | Where the feature sits in the ordering    |
| 3   | `.roadmap/CHECKLIST-MASTER.md`               | What the plan claims is already done      |
| 4   | `.roadmap/DEPENDENCIES-MASTER.md`            | What this feature is declared to need     |
| 5   | The specification of each direct dependency  | What that dependency promised to provide  |
| 6   | The code that dependency produced            | Whether it actually provides it           |
| 7   | `.roadmap/GLOSSARY.md`                       | The canonical name for every concept used |
| 8   | `.claude/CLAUDE.md`, `.claude/rules/`        | The invariants the change is bound by     |
| 9   | The package's `src/`, its specs, its `docs/` | The abstraction that may already exist    |
| 10  | The package's `package.json` `exports` map   | The public surface as it stands today     |
| 11  | `vitest.config.mts`                          | Which project the new suites will run in  |
| 12  | `docs/testing.md`                            | What the two suites have to assert        |

**A checkbox is not evidence.** `.roadmap/CHECKLIST-MASTER.md` records
intent; the dependency is confirmed by reading what it produced — the file, the
export, the passing suite — and by running the one command that exercises it.
A dependency ticked in the checklist and absent from the tree is a hard stop,
not a gap to fill on the way past.

Then establish the surface, with the table in
`.claude/skills/verify/SKILL.md` §1 as the vocabulary: runtime, tests,
performance, transformer, public surface, entry points, documentation, release.
A feature usually touches several, and each one it touches brings its
obligations with it:

| Surface        | What the feature owes it                                            |
| -------------- | ------------------------------------------------------------------- |
| runtime        | A behaviour suite and a performance suite, one file per utility     |
| transformer    | Fixtures or tests beside it, and the runtime fallback still correct |
| public surface | A proposal under `.claude/rules/api-design.md`, before the edit     |
| documentation  | The English page, and its `pt-BR` counterpart, linked both ways     |
| release        | A changeset naming the bump the change is claiming                  |

Where the semantics are novel, or borrowed from C# or another runtime, read the
primary documentation for it before choosing a behaviour — the language
specification, the standard library reference, the proposal — and credible
prior art second. Record what was adopted, and from where, in the plan. A
borrowed name with invented semantics is worse than a new name.

## 2. Decide

Produce a plan, and hand it over before editing anything. The plan is the part
that makes a second run land in the same place, so it is written down rather
than held in mind:

```text
Feature:      the ID and the objective, in one line
Semantics:    what it does, and where the semantics were taken from
Invariants:   what must remain true, each one testable
Architecture: the files added or changed, and why each one exists
Surfaces:     from §1, with the obligation each brings
Public API:   unchanged, or the proposal — names, inference, bump
Tests:        the behaviour cases, and what the performance suite counts
Docs:         the pages, English and pt-BR
Changeset:    the bump, or why the change ships nothing
Out of scope: what this feature is not, so the diff can be read against it
```

The criteria that decide its content:

- **Smallest coherent architecture.** `.claude/rules/general.md`: abstraction
  follows the second case. An interface with one implementation, a generic with
  one argument, an option added in case someone needs it — each is a guess, and
  each is a public commitment once exported.
- **Search before adding.** One file per utility, and the neighbour often
  already solves it. `Grep` the package before describing behaviour as missing.
- **Names come from the glossary.** `.roadmap/GLOSSARY.md` is canonical; a
  concept that has a name there is not given a second one here, and a name that
  is not there yet is proposed as a glossary entry in the plan.
- **Inference is part of the surface.** A signature that starts returning
  `Sequence<unknown>` where it returned `Sequence<User>` breaks every consumer
  without changing a name, and only a type-level test catches it.
- **Performance is a contract, not an outcome.** What the feature promises —
  laziness, one traversal, bounded memory, early exit, a concurrency bound — is
  an invariant in the plan, and it is the thing the performance suite counts.
- **The bump is the claim.** Patch for a fix, minor for an addition, major for
  a break — and a break is `.claude/rules/api-design.md`'s territory before it
  is a number.

Stop here and wait for the user on any plan that moves the public surface. That
is not a formality: `.claude/CLAUDE.md` calls it deliberate review territory,
and bundling it with an implementation is how the one line that mattered gets
reviewed by nobody.

## 3. Change

In this order. The order is the point — tests written after the implementation
are written against what the implementation does.

1. **Types and signatures first**, as the plan agreed them. The signature is
   the part consumers cannot change later.
2. **The implementation**, smallest coherent version, in the file the plan
   named. One file per utility.
3. **The behaviour suite**, beside it, `<utility>.spec.ts`. Every invariant
   from the plan has a case; so does every boundary the specification names.
4. **The performance suite**, `<utility>.performance.spec.ts`, counting work —
   elements pulled, projections invoked, comparisons made, tasks handed to a
   worker. Instrument the input; never read the clock. Size the data so the
   behaviour can actually appear. `docs/testing.md` is the standard and
   `.claude/rules/testing.md` the short form.
5. **The transformer side**, where there is one, with its fixtures beside it,
   and the runtime fallback still correct without it — the two are one feature
   (`.claude/rules/transformers.md`).
6. **The exports map**, only where the agreed plan said so, and never as a
   convenience for a test.
7. **The documentation**, English first, then the `pt-BR` counterpart, each
   linking to the other.
8. **The changeset**, when `packages/*/src/**` changed: a file under
   `.changeset/`, naming the packages and the bump, with one sentence a
   consumer can read. `npm run changeset` is the same artifact written by an
   interactive prompt this skill cannot answer; the file it would produce is
   written directly, and a change that ships nothing — tests, `.claude/`,
   tooling, documentation — gets none, because an empty one publishes a version
   with an empty diff.

What may not change:

- **A test, to accommodate this edit.** A failing test is a stop condition and
  goes back with what broke. Deleting, skipping or loosening one to reach green
  is the anti-pattern this whole file is arranged around.
- **A warning, by silencing it.** `eslint-disable`, `@ts-ignore`,
  `@ts-expect-error`, `skip` — each is a last resort with explicit approval and
  a comment saying why (`.claude/CLAUDE.md`).
- **Anything outside the plan.** Unrelated tidying, reformatting and generated
  output are their own commits (`.claude/rules/git.md`), and in this skill they
  are their own turn.
- **`dist/`, or a file beside a source.** If a `.js` or `.d.ts` appears under
  `packages/*/src/`, the `rootDir`/`outDir` pair is the bug —
  `.claude/rules/build-output.md`, and do not delete the file and move on.

Run the narrow command after each step rather than the full pass:

```sh
npx vitest run packages/collections/src/take.spec.ts --configLoader native
npx vitest run --project collections --configLoader native
npm run typecheck
npx eslint packages/collections/src/take.ts
```

## 4. Verify

The feature is not finished when it works. It is finished when the checks say
so and the diff says nothing else.

1. **The full pass**, by invoking `.claude/skills/verify/SKILL.md` — it selects
   the checks the changed surface requires, runs them, and reports what it
   skipped and why. Its `Status: PASS` is this skill's evidence; a `FAIL` or
   `PARTIAL` is carried into the report verbatim, never summarised as green.
2. **Both suites ran and both assert something.** A performance suite that
   passes without counting anything is a file, not a suite.
3. **The diff, read line by line** — `git diff` and `git status --short`. Every
   hunk is in the plan or it is removed. What this catches is the file that was
   touched on the way past: a formatting sweep, a stray console line, an
   emitted artifact, an export added to make a test resolve.
4. **The changeset is present** where `packages/*/src/**` changed, and names
   the bump the plan claimed.
5. **`npm run format:check`** and **`npx --yes markdownlint-cli2`** for the
   documentation the change carries.

Nothing is reported as verified on the strength of having been written. A check
that was not run is reported as not run.

## Stop

Halt and hand back when:

- **A direct dependency is missing**, whatever the checklist says. Name the
  feature, what was looked for, and where.
- **The roadmap contradicts itself**, or contradicts `.claude/rules/`. Quote
  both and ask which holds; do not pick.
- **The plan moves the public surface** and the user has not agreed it. §2 is
  where that wait happens.
- **A test fails after the implementation**, including one the change did not
  obviously cause. Report it with its verbatim output. If the cause is not
  established, that is `/diagnose`, not a guess and an edit.
- **A performance invariant the feature promised cannot be met** by the agreed
  architecture. That is a plan to revisit, not a suite to relax.
- **The transformer and the runtime disagree** — a call rewritten to something
  the fallback does not produce, or a fallback the rewrite makes unreachable.
- **The specification asks for something the repository reserves for a human**:
  pushing, publishing, merging, discarding uncommitted work. The hooks refuse
  them and `.claude/rules/protected-operations.md` says how a human performs
  each one. A refusal is not a puzzle.
- **The work turns out to be two features.** Implement the first, name the
  second, and let the user choose the order.

## Output

The same eight sections, in this order, every run — including the run that
stops at the plan.

```text
Status:       IMPLEMENTED | PARTIAL | BLOCKED | AWAITING-APPROVAL
Feature:      the ID and the objective, in one line
Plan:         the plan from §2, as agreed, with any deviation marked
Changed:      one row per file — path, what it does, why it is in the plan
Tests:        the behaviour cases, and what the performance suite counts
Verification: the /verify report — status, checks executed, checks skipped
Release:      the changeset and its bump, or why the change ships nothing
Next step:    one action, and the commit subject this branch would carry
```

`Changed` is a table and is never replaced by a sentence about the diff. A file
in it that is not in `Plan` is either marked as a deviation with its reason, or
it should not have been touched.

**When the run stops at the plan:** `Status: AWAITING-APPROVAL`, the plan in
full, `Changed: nothing`, and `Next step` naming the decision being waited on.
The sections are all still there; none is dropped for being empty.

**When a check fails:** `Status: PARTIAL` or `BLOCKED`, with the failure
verbatim under `Verification` and the file left as it stands. The tree is not
reverted to make the report tidy, and the failure is not described as
unrelated unless something other than this skill established that.

Then the same figures once more, for a workflow reading the run rather than a
person:

```json
{
	"skill": "implement-feature",
	"status": "IMPLEMENTED",
	"feature": "F13",
	"surfaces": ["runtime", "tests", "performance", "documentation", "release"],
	"changed": [
		{ "path": "packages/collections/src/takeWhile.ts", "why": "the operator" },
		{
			"path": "packages/collections/src/takeWhile.performance.spec.ts",
			"why": "counts elements pulled from the source"
		}
	],
	"public_surface_changed": false,
	"approved": true,
	"verification": { "skill": "verify", "status": "PASS", "observed": true },
	"changeset": { "present": true, "bump": "minor" },
	"deviations": [],
	"blocked_on": null
}
```

`observed` is `true` only for a verification run that actually ran in this
session. A step that was skipped is reported as skipped; it is never assumed to
have passed.

## Commands

From `.claude/CLAUDE.md` and the root `package.json`:

- `npm run build`
- `npm run typecheck`
- `npx vitest run --configLoader native`
- `npx eslint .`
- `npm run format:check`
- `npm run lint:md`
- `npm run validate:claude`
- `npm run changeset`

`npm test` is the same suites with a build in front of them. During §3 the
narrow command is the one to run; the full pass in §4 belongs to `/verify`.

## References

- `.claude/CLAUDE.md` — the project contract, the command table, and what
  counts as public API.
- `.claude/rules/general.md` — names, errors, comments, and abstraction
  following the second case.
- `.claude/rules/api-design.md` — what the public surface is, inference
  included, and how a change to it is proposed.
- `.claude/rules/testing.md` — two suites, and performance counted rather than
  timed.
- `.claude/rules/transformers.md` — why the runtime and the transformer are one
  feature.
- `.claude/rules/git.md` — the branch model, the commit shape, and the
  changeset a shippable change carries.
- `.claude/rules/build-output.md` — why an emitted file beside its source is a
  tsconfig bug.
- `.claude/rules/protected-operations.md` — what no skill performs.
- `docs/testing.md` — the full testing standard.
- `.claude/skills/verify/SKILL.md` — the verification pass §4 invokes.
- `.claude/skills/diagnose/SKILL.md` — one defect, taken to its cause, for when
  §4 turns red for a reason this change did not establish.
- `.claude/skills/skill-authoring/SKILL.md` — the standard this skill is
  written against.
- `tools/claude/skill-evals/implement-feature.eval.json` — these examples as
  data.

## Examples

**Use this skill when:**

- "/implement-feature F13"
- "Implement the transformer audit feature from the roadmap."
- "Add a `takeWhile` operator to `@fulcro/collections`."
- "Build the worker-pool cancellation path described in F43."

**Do not use this skill when:**

- "The reflect suite fails on `defaultOf` — find out why." Nothing is being
  built; that is `/diagnose`.
- "Is the tree green before I open the PR?" That is `/verify`.
- "Fix the typo in `docs/sequences.md`." One obvious edit.
- "Rename `switchFor` to `matchOn` across the packages." A public surface
  change on its own is a proposal first, under `.claude/rules/api-design.md`.
