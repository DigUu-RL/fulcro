---
name: api-audit
description: Audits a package's published surface as a consumer meets it — the `exports` map, the entry points, the declaration output, the exported names, what a call infers, the overload order, the type/runtime parity and the `files` allowlist — against the last release tag, and reports added, removed and changed API with the bump each one claims. Use when an `exports` map, an exported symbol or an exported type changed, when a package is about to be released, or when asked what a consumer would see.
allowed-tools: Read, Grep, Glob, Bash(npm run build), Bash(npm run typecheck), Bash(npx vitest run:*), Bash(npm pack --dry-run:*), Bash(git tag:*), Bash(git show:*), Bash(git diff:*), Bash(git status:*), Bash(git log:*)
context: fork
argument-hint: '[package name | path | nothing for every package with a changed surface]'
---

# api-audit

What a consumer installs is the tarball, not the branch. They resolve
`@fulcro/collections` through its `exports` map, they read the `.d.ts` that map
points at, and the type their editor shows them is whatever that declaration
says — not whatever the source said before `tsc` erased half of it. Every step
of that chain can move while the suites stay green: an `exports` path that
resolves to a file the build no longer emits, a helper that became reachable
because a barrel re-exported it, a signature that still compiles here and now
infers `unknown` there.

This audit walks that chain in the consumer's direction and reports what moved.
`.claude/rules/api-design.md` is what it reports against: the surface is the
`exports` map, the exported values, the exported types **and what a call
infers**, and a change to any of them is reviewed rather than slipped in.

**This skill is read-only.** It reports; it does not repair, does not edit an
`exports` map, does not write a changeset and does not run the release. Applying
a finding is an ordinary implementation turn with this report in hand.

**There is no score and no grade.** The output is a list of what changed and
what each change costs a consumer. A surface this audit could not read is said
to be unread — "looks compatible" with nothing behind it is the one conclusion
this skill may not reach.

## Invocation

The model may invoke it. It changes nothing, but it is not cheap: a full pass
builds every workspace and reads the emitted declarations, so the description is
narrow deliberately.

The signal is a concrete change surface, not a mood:

- a `packages/*/package.json` whose `exports`, `main`, `types` or `files`
  changed;
- a barrel — `packages/collections/src/index.ts`,
  `packages/collections/src/async.ts`,
  `packages/collections/src/transformer/index.ts`,
  `packages/collections/src/unplugin/index.mts` and their counterparts in the
  other packages — that gained or lost a line;
- an exported signature, overload or exported type that changed;
- a release about to be prepared, or a changeset whose bump is in question.

Not after every edit to a package, and not while a feature is still being
written — mid-implementation the surface has not settled and the audit reports
the parts that are unfinished.

`context: fork` is set: the findings are the only thing the parent session
needs back, and every source is read from the tree or from git rather than from
the conversation. What that costs is the session's own account of intent, so
where a surface change is deliberate — a rename with the old name kept, an
overload added on purpose — say so in the invocation.

## When this applies

It does not apply when:

- **The request is whether the checks pass.** That is
  `.claude/skills/verify/SKILL.md`, which runs the build and the suites and
  reports their output. This skill runs a build to have something to read, and
  reports the surface rather than the exit codes.
- **The request is a review of the whole change.**
  `.claude/skills/fulcro-review/SKILL.md` reads a diff against every contract —
  laziness, concurrency, transformers, tests — and treats the surface as one
  dimension among eight. This skill is only the surface, and goes deeper into
  it: the declarations, the resolution, the inference, the tarball.
- **Something is failing and the cause is unknown.** One defect with a location
  is `.claude/skills/diagnose/SKILL.md`.
- **The request is to design the surface.** Proposing a rename, an added
  overload or a deprecation is `api-design.md`'s territory and a conversation,
  not an audit. This skill reads what is already written.
- **The request is what a unit owes its suites.** That is
  `.claude/skills/test-gap/SKILL.md`. A missing type-level test is reported here
  as one finding; the scenarios inside it are that skill's.
- **Nothing on the surface changed.** Say so and stop.

## Arguments

| Argument       | What is audited                                                    |
| -------------- | ------------------------------------------------------------------ |
| none           | Every package whose surface this branch changed, against its tag   |
| a package name | That package alone — `collections`, or `@fulcro/collections`       |
| a path         | The package that owns the path                                     |
| `full`         | Every package, changed or not, against its last tag                |
| `tree`         | The surface as it stands now, with no baseline — for a new package |

A bare invocation is the common case and the cheap one: it builds once and reads
only the packages the branch touched. `full` is for a release. `tree` is for a
package that has never been tagged, where there is nothing to compare against
and saying so is the answer.

## Before starting

- **The build has to be current.** The declarations and the `exports` targets
  are read from `dist/`, so an audit over a stale build describes a release that
  already happened. `npm run build` runs first, always, and a build that fails
  is a stop condition — not a reason to read the source instead.
- **The baseline is a git tag.** Releases are tagged per package
  (`@fulcro/collections@0.9.0`). `git tag --list '@fulcro/<name>@*'` gives them;
  the highest version is the baseline. A package with no tag has no baseline,
  and its surface is reported as new rather than as unchanged.
- **Nothing is stashed, committed or discarded** to get a cleaner comparison.
  Uncommitted work is part of the surface being audited.
- The audit never installs, never packs a real tarball and never reaches the
  network. `npm pack --dry-run` lists; it does not publish, and
  `.claude/rules/protected-operations.md` holds regardless.

## 1. Read

Every source is named. A path is read before it is described, and a command's
output is observed before it is reported — `.claude/skills/skill-authoring/SKILL.md`
§7 is why.

| #   | Source                                              | What it settles                           |
| --- | --------------------------------------------------- | ----------------------------------------- |
| 1   | `git status --short`, `git diff --stat main...HEAD` | Which packages the branch touched         |
| 2   | `npm run build`                                     | That `dist/` describes the current tree   |
| 3   | `packages/*/package.json`                           | `exports`, `main`, `types`, `files`       |
| 4   | `git tag --list '@fulcro/*'`                        | The baseline version per package          |
| 5   | `git show <tag>:packages/<name>/package.json`       | The `exports` map as it shipped           |
| 6   | `git diff <tag>..HEAD -- packages/<name>/src`       | What changed in the surface since         |
| 7   | the barrels the `exports` map points at             | Which names are reachable, and from where |
| 8   | `packages/<name>/dist/**/*.d.ts`                    | What a consumer's editor actually reads   |
| 9   | `tests/entrypoints.spec.mts`                        | Which entry points are already asserted   |
| 10  | `npm pack --dry-run --workspace @fulcro/<name>`     | What the tarball would contain            |
| 11  | `.changeset/`                                       | The bump this change already claims       |
| 12  | `docs/<page>.md` and its `pt-BR` counterpart        | Which pages describe the old surface      |

The barrels, spelled as this repository has them: `.` is `dist/index.js`,
`@fulcro/collections` adds `./async`, `@fulcro/parallel` adds `./worker`, and
`@fulcro/collections`, `@fulcro/reflect` and `@fulcro/transform-core` carry
`./transformer` and `./unplugin`. Those two are public surface like any other —
`api-design.md` says a helper exposed there is a helper the package now
supports.

Do not stop at the first command that fails. Record it, continue, and say in
the report which checks did not run.

## 2. Decide

A finding needs three things, and one missing any of them is dropped rather than
softened: a **location** a reader can open, a **consumer consequence** stated in
their terms, and the **evidence** that was observed — a declaration line, a
resolved path, a tarball listing.

### The dimensions

Worked in this order, so that the failures nothing else catches are found before
the ones a test would.

**Resolution** — does the map still point at files that exist?

1. Every path in `exports`, and `main` and `types`, resolves to a file present
   in `dist/` after the build. A `types` condition pointing at a missing `.d.ts`
   is a consumer whose editor shows `any` and whose suite stays green —
   `.claude/rules/release.md` names this as the failure to look for.
2. Each condition's extension matches what it is: `./unplugin` resolves to
   `.d.mts`/`.mjs` in the packages that ship it that way, and a `.d.ts` served
   under an ESM condition is a resolution failure on the consumer's side.
3. Nothing resolves outside `dist/`. A target beside the source is
   `.claude/rules/build-output.md`'s failure, and the bug is the
   `rootDir`/`outDir` pair rather than the file.
4. `./package.json` is still exported. Tooling reads it and its removal breaks
   consumers who never imported anything.

**Names** — what is reachable, and what was reachable before.

1. Diff the exported names of each entry point against the baseline tag's. Added,
   removed, renamed; a rename is a removal and an addition unless the old name
   was kept pointing at the new one, which is what `api-design.md` asks for.
2. Is a symbol exported because a sibling module needed it rather than because a
   consumer does? An internal helper reachable from a barrel is surface the
   package now supports, and `tests/entrypoints.spec.mts` exists partly to
   assert the internals stay unexported.
3. Does every exported symbol carry a doc comment? That text is what a consumer
   reads in their editor, and `.claude/rules/general.md` makes it part of the
   surface.

**Inference** — the dimension no runtime suite can see.

1. For each changed signature, state what a call infers before and after, from
   the declaration in `dist/`, not from the source. `Sequence<unknown>` where it
   was `Sequence<User>` breaks every consumer with no name changed and nothing
   failing.
2. A widened parameter is additive; a narrowed one is a break. A widened return
   is a break; a narrowed one is usually not, and is stated either way.
3. Did a type parameter's default, constraint or order change? Each of the three
   changes what an explicit type argument means at an existing call site.
4. Is there a type-level test for the inference that changed? Its absence is its
   own finding — the runtime suite passes throughout.

**Overloads** — order is behaviour.

1. A new overload inserted ahead of an existing one changes which signature an
   existing call selects. `api-design.md` calls it a break wearing an addition's
   clothes, and it is one whether or not anything stops compiling.
2. An overload appended after the existing ones is additive.
3. Does the implementation signature stay unexported? Its shape is not a promise.

**Type and runtime agree** — the two halves are shipped together.

1. Every name the declaration exports is a name the emitted `.js` exports, and
   the reverse. A value exported only from the types is a runtime `undefined`; a
   value exported only from the runtime is invisible to a consumer in
   TypeScript.
2. A type-only export is spelled `export type`, so a bundler does not try to
   resolve a value that was erased.
3. Where a transformer is what makes a call correct, the runtime fallback still
   answers — `tests/entrypoints.spec.mts` imports the built packages without the
   transformers precisely to prove what a consumer gets before wiring one up.

**Packaging** — what is in the tarball.

1. `files` still covers every path the `exports` map names. `files: ["dist"]` and
   an `exports` target outside `dist/` is a package that resolves here and fails
   on `npm install`.
2. Nothing unintended is added: sources, fixtures, `.tsbuildinfo`, test output.
3. `main`, `types`, `engines`, `peerDependencies` and their `Meta` entries match
   what the package actually requires. A peer that became mandatory is a break
   even though no exported name moved.

**Coverage of the surface** — who would have caught this.

1. Is every entry point in the `exports` map asserted by
   `tests/entrypoints.spec.mts`? An entry point nobody imports from `dist/` is
   one nobody will notice breaking.
2. Is a new entry point added to that suite in the same change?

**The claim** — the bump, and the documentation.

1. Does a change under `packages/*/src/**` carry a changeset at all? Without one
   the release-readiness workflow fails the pull request, and that is a
   `BLOCKER` before it is a version number.
2. Does the recorded bump match what this audit found? Major if anything above
   stops compiling for somebody, minor for an addition, patch for neither.
3. Does a changed surface leave its `docs/` page describing the old one, and does
   the `pt-BR` counterpart still exist and still link back?

### Severity

Five levels, the same vocabulary `fulcro-review` uses, so two reports on one
branch can be read together. No sixth level, no total, no verdict.

| Level     | Means                                                                                                                       |
| --------- | --------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKER` | It cannot ship: an `exports` target that does not exist, a break with no major bump, a shipped change with no changeset     |
| `HIGH`    | A consumer feels it: a lost inference, a removed name, an overload inserted ahead of another, a `files` list missing a path |
| `MEDIUM`  | Contained: an internal reachable from a barrel, an entry point the suite does not assert, an undocumented export            |
| `LOW`     | Correct but narrow: a type-only export spelled as a value, a doc comment describing the old signature                       |
| `NOTE`    | Worth knowing, nobody's fault: a package with no tag to compare against, a platform half not covered                        |

**A documented exception is not a finding.** Where this repository has argued a
case through, the audit says nothing: the tracked fixtures under
`packages/*/src/**/fixtures/` that `build-output.md` names; the omitted
`sideEffects` field in `@fulcro/collections`, which its own manifest explains;
`./package.json` in every `exports` map. Re-reporting a written-down decision
teaches its reader to skim.

**Duplicates collapse.** One violation across six entry points is one row with
six locations and a count.

**Green is not compatible.** Every failure this audit exists to catch passes
`npm test` — a missing declaration, a loosened inference, a `files` list that
forgot a folder. The suites and the surface are independent answers.

## 3. Change

Nothing. No edit to an `exports` map, no added export, no changeset, no
reformat, no commit. A finding whose fix is one line is reported with that line
described in words, and applying it is someone else's turn.

## 4. Verify

The report is verified when each row survives all four:

- **The location opens.** A `file:line` in the tree or in `dist/`, taken from the
  file as read.
- **The before and after are quoted.** The declaration line, the `exports`
  fragment, the tarball entry — verbatim, from the tag on one side and the build
  on the other. A signature recalled rather than read is deleted from the report.
- **The command ran.** Every claim about resolution, packaging or types came
  from `npm run build`, `npm run typecheck`, `npm pack --dry-run` or a file read
  this run. A check that did not run appears under `Not audited` with its
  reason, never with an inferred result.
- **The consequence is concrete.** "A consumer importing `@fulcro/collections/async`
  resolves a `.d.ts` that is not emitted and sees `any`" — not "this is risky".

`Status: CLEAN` requires that every entry point in scope was resolved and read.
One that was not makes it `PARTIAL`, whatever the others showed.

## Stop

Halt and hand back when:

- **The build fails.** There is no `dist/` to audit and the source is not a
  substitute. Report `BLOCKED` with the build output and stop.
- **There is no baseline** and no `tree` argument — a package never tagged.
  Report the surface as new, `NOTE` it, and do not invent a previous version.
- **A surface cannot be read** — a declaration the build did not emit, a tag
  whose tree is gone. Say which, audit what remains, report `PARTIAL`.
- **A finding needs a change to decide.** Report it open with what would settle
  it. The audit never edits to confirm a hypothesis and never adjusts a test.
- **The request turns into a surface proposal.** Deciding what the API should
  become is `api-design.md`'s conversation; this skill reports and stops.
- **The next step is a human's.** Publishing, pushing and merging are refused by
  the hooks — `.claude/rules/protected-operations.md`.

## Output

The same sections, in this order, every run — including the run that finds
nothing.

```text
Status:        CLEAN | FINDINGS | PARTIAL | BLOCKED
Audited:       each package, its baseline tag, and the entry points resolved
Not audited:   anything in scope that was not read, with why
Added:         exports, names and overloads that are new
Removed:       exports and names that are gone, and whether an alias carries them
Changed:       signatures and overload order, before and after
Types:         inference and declaration changes, including what no runtime test sees
Runtime:       behaviour a consumer can observe that changed under an unchanged name
Packaging:     exports resolution, files allowlist, engines and peers
Findings:      the table below, ordered BLOCKER first
Bump:          per package — what the audit found, what the changeset claims
```

The table:

```text
| # | Severity | Package | Where | Dimension | Change | Consumer impact |
```

Below it, one paragraph per finding that needs a judgement call: the evidence
verbatim from both sides, and the action described rather than applied.

**When nothing changed:** `Status: CLEAN`, the `Audited` list with each baseline
tag named, the empty sections stated as empty rather than dropped, and the bump
line. Do not end with a question, and do not write that the change looks
compatible — say which entry points were resolved and what was compared.

Then the same figures once more, for a workflow reading the run rather than a
person:

```json
{
	"skill": "api-audit",
	"status": "FINDINGS",
	"packages": [
		{
			"name": "@fulcro/collections",
			"baseline": "@fulcro/collections@0.9.0",
			"entrypoints": [".", "./async", "./transformer", "./unplugin"],
			"added": ["chunk"],
			"removed": [],
			"changed": ["map"],
			"bump_found": "major",
			"bump_claimed": "minor"
		}
	],
	"not_audited": [],
	"findings": []
}
```

`bump_found` is what the dimensions above showed. `bump_claimed` is what
`.changeset/` records, read this run; where there is no changeset it is `null`
and the mismatch is a `BLOCKER` row.

## Commands

From `.claude/CLAUDE.md` and the root `package.json`, spelled as they are there.

```sh
npm run build
npm run typecheck
npx vitest run --project entrypoints --configLoader native
npm pack --dry-run --workspace @fulcro/collections
git tag --list '@fulcro/collections@*'
git show '@fulcro/collections@0.9.0':packages/collections/package.json
git diff '@fulcro/collections@0.9.0'..HEAD -- packages/collections/src
```

`npm pack --dry-run` lists what the tarball would hold and writes nothing.
Publishing, in every spelling, belongs to the release workflow and to a human.
`npm run changeset` is named in a recommendation here and run by someone else.

## References

- `.claude/CLAUDE.md` — the project contract, the package table, and what counts
  as public API.
- `.claude/rules/api-design.md` — the surface, inference included, and how a
  change to it is proposed.
- `.claude/rules/release.md` — what is checked before a release goes, and why the
  declarations are part of it.
- `.claude/rules/build-output.md` — why an `exports` target beside the source is
  a tsconfig bug.
- `.claude/rules/general.md` — names, and the doc comment every exported symbol
  carries.
- `.claude/rules/git.md` — the changeset, and which bump a change claims.
- `.claude/rules/protected-operations.md` — what no skill performs.
- `tests/entrypoints.spec.mts` — the suite that resolves the packages the way a
  consumer does.
- `.claude/skills/verify/SKILL.md` — whether the checks pass.
- `.claude/skills/fulcro-review/SKILL.md` — the whole change against every
  contract, with the surface as one dimension.
- `.claude/skills/test-gap/SKILL.md` — the scenarios a unit still owes its
  suites.
- `.claude/skills/skill-authoring/SKILL.md` — the standard this skill is written
  against.
- `tools/claude/skill-evals/api-audit.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "I changed the `exports` map of `@fulcro/parallel` — what does a consumer see?"
- "Audit the public API before we release collections."
- "Did the `map` refactor change what anything infers?"
- "Is `@fulcro/reflect` still shipping everything its entry points promise?"

**Do not use this skill when:**

- "Is the tree green?" That is `/verify`, which runs the checks.
- "Review the branch." That is `/fulcro-review`, which reads every contract.
- "Should we rename `takeWhile`?" That is a surface proposal under
  `api-design.md`, decided in conversation before anything is written.
- "The entrypoint suite fails on `@fulcro/functions` — why?" That is
  `/diagnose`.
