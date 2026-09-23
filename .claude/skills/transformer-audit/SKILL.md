---
name: transformer-audit
description: Audits the compile-time/runtime boundary of `@fulcro/collections` and `@fulcro/reflect` — which calls each transformer still recognises across the package boundary, what it emits, where it declines to the runtime fallback, where it must fail loudly instead, how it behaves on both path separators, and whether the two plugins still coexist on one tree — and reports a fixture matrix with the emitted output as evidence. Use when a `transformer/` or `unplugin/` directory changed, when a call is resolving at runtime that should have been rewritten, or when a runtime signature moved and the transformer half has not been checked.
allowed-tools: Read, Grep, Glob, Bash(npm run build), Bash(npm run typecheck), Bash(npx vitest run:*), Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(git show:*)
context: fork
argument-hint: '[collections | reflect | a call name | a path | nothing for the transformers this branch touched]'
---

# transformer-audit

A transformer that stops recognising a call does not throw. It declines, the
runtime fallback answers, and the build stays green with a worse answer in it —
`.claude/rules/transformers.md` names that as the failure mode of this whole
subsystem. Every other kind of bug here has the same shape: an emitted literal
that is subtly wrong, a `.d.ts` the checker reads differently from the source, a
matcher that claims a consumer's unrelated `nameOf`, a path comparison that
works on one separator. None of them produce an error. They produce output.

So this audit does the only thing that settles any of it: it compiles fixtures
with the transformers applied and reads what came out. The unit of a finding is
a call form, the evidence is the emitted JavaScript, and a claim about what a
transformer does that was not read out of an emit this run does not go in the
report.

**This skill is read-only.** It reports; it does not fix a rewriter, does not
add a fixture, does not adjust an assertion and does not commit. Applying a
finding is an ordinary implementation turn with this report in hand.

**And it never half-generates.** Where transformer support for a form is
incomplete, that is the finding. Emitting a partial structural test, a
placeholder validator or a narrowed type so that a case produces something is
the one move this skill may not make — it converts a known gap into a wrong
answer nobody is looking for.

## Invocation

The model may invoke it. It changes nothing, but it builds every workspace and
compiles fixtures through the TypeScript API, so the description is narrow on
purpose.

The signal is a concrete change surface:

- a file under `packages/collections/src/transformer/`,
  `packages/reflect/src/transformer/`,
  `packages/collections/src/unplugin/index.mts`,
  `packages/reflect/src/unplugin/index.mts`, or anywhere in
  `packages/transform-core/src/`;
- a runtime signature, overload or entry point of a transformer-backed utility
  that moved — `.claude/rules/transformers.md` calls the two halves one
  feature, and a runtime change is a transformer change that has not been made
  yet;
- a reported symptom of declining: a call answering at runtime that used to be
  rewritten, `defaultOf` throwing, a diagnostic that stopped being emitted;
- a platform-only failure, where CI disagrees with a laptop about the same
  commit.

Not after every edit under `packages/`, and not while a rewriter is still being
written — mid-implementation the emit is unfinished and the audit reports the
parts that are not done yet.

`context: fork` is set: the matrix and the findings are all the parent needs
back. What that costs is the session's own account of intent, so where a
decline is deliberate — a form that is meant to fall back, a diagnostic that was
removed on purpose — say so in the invocation.

## When this applies

It does not apply when:

- **The request is whether the checks pass.** That is
  `.claude/skills/verify/SKILL.md`, which runs the build and the suites and
  reports their exit statuses. This skill runs a compile to have an emit to
  read.
- **One defect is failing and the cause is unknown.**
  `.claude/skills/diagnose/SKILL.md` takes a single reported defect to a root
  cause. This skill sweeps the boundary whether or not anything is failing; when
  it finds one failing case, it reports the case and the likely cause and stops
  rather than continuing into a repair.
- **The question is the published surface.**
  `.claude/skills/api-audit/SKILL.md` owns the `exports` map, the declarations
  and what a call infers. `./transformer` and `./unplugin` are entry points it
  audits as surface; this skill audits what they _do_ once applied.
- **The request is a review of the whole change.** That is
  `.claude/skills/fulcro-review/SKILL.md`, which treats the transformer pair as
  one dimension among several.
- **The request is which scenarios a unit still owes tests.** That is
  `.claude/skills/test-gap/SKILL.md`. A form with no fixture is reported here as
  one row of the matrix; deriving a unit's whole scenario list is that skill's.
- **Nothing in the boundary changed and nothing is misbehaving.** Say so and
  stop.

## Arguments

| Argument      | What is audited                                                              |
| ------------- | ---------------------------------------------------------------------------- |
| none          | The transformers this branch touched, and their runtime halves               |
| `collections` | `@fulcro/collections` — `ofType`, `cast`, and its narrowing                  |
| `reflect`     | `@fulcro/reflect` — `nameOf`, `typeOf`, `defaultOf`, `is`, `as` and the rest |
| a call name   | That call form alone, across every dimension below                           |
| a path        | The package that owns the path                                               |
| `full`        | Both transformers, every dimension, whether or not anything changed          |

A bare invocation is the cheap case. `full` is for a release or for a change to
`@fulcro/transform-core`, which both transformers are built on and where a
regression reaches everything at once.

## Before starting

- **The build has to be current.** The fixtures resolve `@fulcro/reflect` and
  `@fulcro/collections` by name, through `node_modules` into built
  declarations — that is the package boundary the suites exist to cross. An
  audit over a stale `dist/` describes a transformer that is no longer there.
  `npm run build` runs first, always, and a failed build is a stop condition.
- **The cache stays off.** Vitest's `fsModuleCache` keys on source content while
  the transformer rewriting that content lives in this repository, so a broken
  transformer goes on passing against cached output. `vitest.config.mts` says
  this was measured. Never enable it to make a run faster, and if a run is
  suspiciously green, checking that it is still off is the first thing to do.
- **Nothing is stashed, committed or discarded** for a cleaner comparison.
  Uncommitted work is part of what is being audited.
- The audit never edits a fixture to make it compile, never relaxes an
  assertion, and never adds `@ts-expect-error` to move past a case.
  `.claude/CLAUDE.md` reserves each of those for explicit approval.

## 1. Read

Every source is named. A path is read before it is described and a command's
output is observed before it is reported —
`.claude/skills/skill-authoring/SKILL.md` §7 is why.

| #   | Source                                                           | What it settles                                                   |
| --- | ---------------------------------------------------------------- | ----------------------------------------------------------------- |
| 1   | `git status --short`, `git diff --stat main...HEAD`              | Which half of which feature this branch moved                     |
| 2   | `npm run build`                                                  | That the fixtures resolve the current transformers                |
| 3   | `packages/collections/src/transformer/index.ts`                  | Which call forms that package claims                              |
| 4   | `packages/reflect/src/transformer/index.ts`                      | The same for reflect, rewriter by rewriter                        |
| 5   | `packages/transform-core/src/shared/index.ts`                    | `isOwnedCall` and `utilityModuleSegment` — the matcher both share |
| 6   | `packages/transform-core/src/program/index.ts`                   | How a program is built where a bundler has no checker             |
| 7   | `packages/transform-core/src/structural/index.ts`                | `buildStructuralTest`, which turns a type into a runtime test     |
| 8   | `packages/collections/src/tests/transformer/transformer.spec.ts` | The forms collections already asserts                             |
| 9   | `packages/reflect/src/tests/transformer/transformer.spec.ts`     | The forms reflect already asserts                                 |
| 10  | the `*.sample.ts` fixture beside each of those suites            | What is actually compiled, and what is not                        |
| 11  | `tests/transformers/coexistence.spec.mts` and its sample         | The two plugins over one tree                                     |
| 12  | `tests/entrypoints.spec.mts`                                     | The runtime fallback, with no transformer applied                 |
| 13  | `packages/*/src/unplugin/index.mts`                              | What a bundler is handed, and under which conditions              |
| 14  | `vitest.config.mts`                                              | Which projects apply which plugin, and that the cache is off      |

`matrix.md` beside this file is the case catalogue: the call forms, the type
shapes and the boundary conditions each transformer is expected to handle, with
what a correct emit looks like for each. Read it when filling the matrix in §2,
not before — it is long, and only the rows in scope matter.

Do not stop at the first command that fails. Record it, continue, and say in the
report which checks did not run.

## 2. Decide

A finding needs three things, and one missing any of them is dropped rather than
softened: a **call form** with a location, the **emitted output** that was
observed, and the **consequence** stated as what a consumer's program does
differently.

### The dimensions

Worked in this order, so the failures nothing else catches come before the ones
a suite would.

**Recognition** — which calls each transformer claims.

1. Does each call form in `matrix.md` still get claimed? A form that stopped
   being recognised emits as written, and the emit is the evidence: a surviving
   `nameOf(...)` or `.ofType()` with no injected argument is a decline.
2. Is the claim traced back to the package, rather than matched on a name?
   `isOwnedCall` exists so that a consumer's own `nameOf` is left alone.
   A matcher that widened to a bare identifier is a `BLOCKER` — it rewrites code
   the package has no business touching.
3. Does the claim survive every way a consumer resolves the package: by name
   through `node_modules`, through a workspace link, through a `paths` alias?
   The suites compile against built declarations for this reason.
4. Method calls are traced through the symbol of the receiver, not the method
   name. `.cast(...)` on an unrelated object is not this package's call.
5. Does each transformer still claim **only** its own? Neither knows the other
   exists, and a rewriter reaching across is the failure
   `tests/transformers/coexistence.spec.mts` was written to expose.

**Emission** — what came out.

1. The emitted JavaScript is quoted in the report, from this run's compile. A
   description of what a rewriter "should" emit, taken from its source, is not
   evidence.
2. The injected value is complete for the type: every required member present,
   optional members absent, literals preserved as literals.
   `matrix.md` has the shape expected per form.
3. Nothing is left over. A rewritten call that also leaves a call to the runtime
   implementation behind ships both paths, and the suites assert this explicitly
   for `nameOf` and `defaultOf`.
4. A rewritten call still type-checks where it landed. `npm run typecheck` is
   the whole-tree answer, and a form that only compiles under `skipLibCheck` is
   a finding.

**Decline, and the diagnostic** — the line between the two.

1. For every form the transformer declines, does the runtime fallback give the
   **same** answer? Slower is fine; different is not. That is the whole of
   `.claude/rules/transformers.md`'s quiet-decline case.
2. For every form where no fallback can be right — a type that exists only at
   compile time, an inference the runtime cannot reconstruct — is a diagnostic
   emitted, naming the file, the call and what to write instead? Silence there
   ships a wrong value, and it is a `BLOCKER`.
3. Is a diagnostic emitted where a fallback would have been fine? A false
   diagnostic spends the credibility the true ones rely on.
4. Unsupported syntax is reported as unsupported, in the matrix, with the form
   written out. It is never made to pass by emitting something partial — see the
   hard stop in `## Stop`.

**Type shapes** — the catalogue.

Unions, intersections, generics and their constraints, recursive shapes,
classes, arrays, tuples, literal types, optional and readonly members, enums,
function types. Each is a row of `matrix.md` with its expected emit; work the
rows in scope and report the rest as not audited rather than as passing.

**Platform** — the separator.

1. Path segments are built with `path.join`, so `utilityModuleSegment` produces
   backslashes on Windows and forward slashes elsewhere. Any comparison against
   a hard-coded `/`-joined string is a finding on sight, whichever platform this
   run is on.
2. A green run says nothing about the other platform. State which one this run
   observed, and read the comparison logic for the other rather than claiming
   it. `.claude/rules/release.md` is why CI runs both.

**Coexistence** — two plugins, one tree.

1. Do both still resolve every call in `tests/transformers/coexistence.sample.ts`,
   including a rewritten call nested inside another rewritten call?
2. Does the result hold with the plugin order reversed? Neither should depend on
   running first, and the suite's own comment says the order it uses is
   arbitrary.
3. Is anything left unresolved? A call left as written is what silent
   interference looks like.

**Cache** — the one that invalidates the rest.

1. Is `fsModuleCache` still absent from `vitest.config.mts`? Enabled, every
   assertion in this audit is against output the transformer may no longer
   produce.
2. Did the run actually recompile? A suite passing against a stale `dist/` is
   the same failure wearing a different hat — this is why `npm run build` is a
   prerequisite rather than a suggestion.

**Pairing** — the two halves in one commit.

1. Does a changed runtime signature have the matching transformer change in the
   same diff? Shipping one half is a version where the two disagree, and the
   disagreement reads as a wrong runtime result rather than a build error.
2. Does a change under `transformer/` or `unplugin/` carry fixtures or tests
   alongside it? `.claude/CLAUDE.md` makes that non-negotiable, and its absence
   is a `BLOCKER`.
3. Is the shared machinery being extended, or reimplemented in a package? A
   second copy of call resolution or module identity drifts in exactly the cases
   nobody tested.

### Severity

The same five levels `fulcro-review` and `api-audit` use, so two reports on one
branch read together. No sixth level, no score, no verdict.

| Level     | Means                                                                                                                                              |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKER` | A wrong value ships: a silent decline where no fallback is right, a matcher claiming another package's calls, a transformer change with no fixture |
| `HIGH`    | A consumer feels it: a form that stopped being recognised, an incomplete emit, a hard-coded path separator, a leftover runtime call                |
| `MEDIUM`  | Contained: a form with no fixture, a diagnostic with a message that does not say what to write instead, coexistence unasserted for a new form      |
| `LOW`     | Correct but narrow: a fixture that proves the easy half only, a comment describing an older emit                                                   |
| `NOTE`    | Worth knowing, nobody's fault: a form deliberately unsupported, the platform half this run could not observe                                       |

**A documented decline is not a finding.** Where a form is meant to fall back
and the code or a suite says so, the audit records it in the matrix as expected
and reports nothing. Re-reporting a written-down decision teaches its reader to
skim.

**Duplicates collapse.** One matcher defect showing up across nine call forms is
one row with nine locations and a count.

**Green is not correct.** Every failure this audit exists to catch passes
`npm test`: the decline, the partial emit, the separator, the cache. The suites
and the boundary are independent answers.

## 3. Change

Nothing. No rewriter edited, no fixture added, no assertion relaxed, no
`@ts-expect-error`, no commit. A finding whose fix is one line is reported with
that line described in words.

Above all, nothing is generated to make a case produce output. An unsupported
form is reported as unsupported.

## 4. Verify

The report is verified when each row survives all four:

- **The call form opens.** A `file:line` in a fixture, a suite or a rewriter,
  taken from the file as read.
- **The emit is quoted.** The emitted JavaScript, verbatim, from a compile
  performed this run. A rewrite recalled from a rewriter's source rather than
  read out of an emit is deleted from the report.
- **The command ran.** Every claim came from `npm run build`,
  `npm run typecheck` or a named Vitest project this run. A check that did not
  run appears under `Not audited` with its reason, never with an inferred
  result.
- **The consequence is concrete.** "A consumer calling `defaultOf<Order>()`
  reaches the runtime fallback, which throws, because the transformer no longer
  traces the call across the package boundary" — not "recognition may be
  affected".

`Status: CLEAN` requires that every form in scope was compiled and read. One
that was not makes it `PARTIAL`, whatever the others showed.

## Stop

Halt and hand back when:

- **The build fails.** The fixtures resolve built declarations, and the sources
  are not a substitute. Report `BLOCKED` with the output and stop.
- **Transformer support for a form is incomplete.** That is the finding. Do not
  emit a partial structural test, a placeholder validator or a narrowed type to
  make a case produce something — a known gap turned into a wrong answer is
  worse than the gap, and it is invisible afterwards.
- **A fixture does not compile.** Report it with the diagnostic. Do not edit the
  fixture, and do not add `@ts-expect-error` to walk past it.
- **A suite fails for a reason this audit did not cause.** Report it with the
  output; a failing test is never adjusted to accommodate an audit.
- **A finding needs a change to decide.** Report it open with what would settle
  it — usually the fixture that does not exist yet, described.
- **The request turns into the repair.** Fixing a rewriter is an implementation
  turn; this skill reports and stops.
- **The next step is a human's.** Publishing, pushing and merging are refused by
  the hooks — `.claude/rules/protected-operations.md`.

## Output

The same sections, in this order, every run — including the run that finds
nothing.

```text
Status:        CLEAN | FINDINGS | PARTIAL | BLOCKED
Audited:       each transformer, the forms compiled, and the projects that ran
Not audited:   anything in scope that was not compiled, with why
Matrix:        the table below — one row per call form
Failing:       the first failing case, in full, with its fixture and its emit
Evidence:      the emitted output quoted, expected beside observed
Cause:         the likely root cause of each failure, and what would confirm it
Required:      the runtime and transformer changes each finding calls for
Findings:      the findings table, ordered BLOCKER first
Platform:      which separator this run observed, and which was read rather than run
```

The fixture matrix:

```text
| Call form | Package | Fixture | Expected emit | Observed | Verdict |
```

`Verdict` is one of `resolved`, `declined`, `diagnosed`, `unsupported` or
`missing` — the last meaning no fixture covers the form, which is a finding
rather than a pass.

The findings table:

```text
| # | Severity | Package | Where | Dimension | What happens | Consumer impact |
```

Below it, one paragraph per finding that needs a judgement call: the emit
verbatim on both sides, and the change described rather than applied.

**When nothing is wrong:** `Status: CLEAN`, the matrix with every row filled and
its verdict, the empty sections stated as empty rather than dropped, and the
platform line. Do not end with a question, and do not write that the boundary
looks fine — say which forms were compiled and what came out.

Then the same figures once more, for a workflow reading the run rather than a
person:

```json
{
	"skill": "transformer-audit",
	"status": "FINDINGS",
	"platform": "win32",
	"transformers": [
		{
			"package": "@fulcro/reflect",
			"forms_audited": ["nameOf", "typeOf", "defaultOf", "is", "as"],
			"resolved": ["nameOf", "typeOf", "is", "as"],
			"declined": ["defaultOf"],
			"diagnosed": [],
			"unsupported": [],
			"missing_fixture": ["pathsOf"]
		}
	],
	"coexistence": "unresolved-calls: 0",
	"not_audited": [],
	"findings": []
}
```

`declined` is the list that matters: a form there which is not also a documented
fallback is the report's first finding.

## Commands

From `.claude/CLAUDE.md` and the root `package.json`, spelled as they are there.

```sh
npm run build
npm run typecheck
npx vitest run --project reflect --configLoader native
npx vitest run --project collections --configLoader native
npx vitest run --project transformers --configLoader native
npx vitest run --project entrypoints --configLoader native
git diff --stat main...HEAD -- packages
```

The project names are the ones `vitest.config.mts` declares: `collections`,
`functions`, `parallel`, `reflect`, `entrypoints`, `transformers`, `hooks` and
`claude`. There is no `transform-core` project — its machinery is audited
through the two transformers built on it.

## References

- `.claude/CLAUDE.md` — the project contract, the package table, and the rule
  that a transformer change carries fixtures.
- `.claude/rules/transformers.md` — the runtime and the transformer as one
  feature, claiming only your own calls, and where a fallback would be wrong.
- `.claude/rules/testing.md` — where a suite lives decides what it proves, and
  why the cache stays off.
- `.claude/rules/build-output.md` — why the fixtures resolve `dist/`.
- `.claude/rules/release.md` — why a green run on one platform says nothing
  about the other.
- `.claude/rules/protected-operations.md` — what no skill performs.
- `matrix.md` — the call forms and type shapes, with the emit expected for each.
- `tests/transformers/coexistence.spec.mts` — the two plugins over one tree.
- `tests/entrypoints.spec.mts` — the runtime fallback, with no transformer
  applied.
- `.claude/skills/api-audit/SKILL.md` — the published surface, including the
  `./transformer` and `./unplugin` entry points as surface.
- `.claude/skills/diagnose/SKILL.md` — one defect to its root cause.
- `.claude/skills/verify/SKILL.md` — whether the checks pass.
- `.claude/skills/test-gap/SKILL.md` — the scenarios a unit still owes.
- `.claude/skills/skill-authoring/SKILL.md` — the standard this skill is written
  against.
- `tools/claude/skill-evals/transformer-audit.eval.json` — these examples as
  data.

## Examples

**Use this skill when:**

- "I changed `buildStructuralTest` — is anything still resolving?"
- "`defaultOf` started throwing in a consumer project."
- "`ofType` gained an overload; check the transformer half."
- "CI fails on Windows and passes on Linux for the reflect suite."

**Do not use this skill when:**

- "Is the tree green?" That is `/verify`.
- "Does `@fulcro/reflect` still export everything its entry points promise?"
  That is `/api-audit`, which reads the published surface.
- "Review the branch before I open the pull request." That is `/fulcro-review`.
- "Write the missing `pathsOf` fixture." That is an implementation turn, with
  this report in hand.
