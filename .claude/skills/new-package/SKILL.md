---
name: new-package
description: Creates a new `@fulcro/*` workspace package wired the way the existing ones are — the ownership case made first, the dependency direction checked, the manifest, tsconfigs, Vitest project, entry point coverage, the next free `FULCRO` error range, the README and table rows, and the changeset — and leaves it verified and empty, ready for its first feature. Use when a capability is to get a package of its own under `packages/`.
argument-hint: <package name> — <the capability it will own>
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Write, AskUserQuestion, Agent, Skill, Bash(npm install), Bash(npm run build), Bash(npm run typecheck), Bash(npm run format), Bash(npm run format:check), Bash(npm run lint:md), Bash(npm run validate:claude), Bash(npx vitest run:*), Bash(npx eslint:*), Bash(npm ls:*), Bash(npm view:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git branch:*), Bash(git switch:*)
---

# new-package

A package is the most expensive thing this repository can add. It takes a
name on npm that cannot be given back, an error digit that is never reused, a
row in every table that lists packages, a project in the test harness, and a
first publish that only a human can perform. Each of those fails silently when
it is forgotten: a package with no Vitest project runs no suites and looks
green, a package missing from `tests/entrypoints.spec.mts` ships whatever its
`exports` map happens to say, and a package with no range has nowhere to put
its first error.

This skill is the order those are done in. It first establishes that the
capability deserves a package at all, then plans the whole wiring, shows it,
and only after an answer creates it — empty, verified, and ready for the
first feature to be built into it with `/implement-feature`.

**This skill writes.** It creates and edits files in the working tree and runs
`npm install` to link the workspace. It does not commit, push, publish or
merge, and it never adjusts an existing test to make its own change pass.

## Invocation

`disable-model-invocation: true`. The edits are in git, but two of the effects
are not undone by reverting them: the error digit is assigned for good once
merged, and the package name is claimed on npm by the first publish the
release workflow refuses to make. When those happen is the user's decision.
A message that mentions "a package for this" is a question, not an
instruction to create one.

## When this applies

- A capability is to live in a package that does not exist yet:
  `/new-package perf — the measurement layer F46 describes`.
- A roadmap feature names a new package — F46's `@fulcro/perf`, for instance.

It does not apply when:

- **The capability fits an existing package.** That is
  `.claude/skills/implement-feature/SKILL.md`, in the package that owns it —
  and deciding that is a complete answer from this skill (§2).
- **The request is one helper.** A package around a single function is the hard
  stop below, whatever it would be called.
- **The package is to ship a compile-time transformer.** The scaffold here is a
  runtime package. A `./transformer` or `./unplugin` entry point, its place in
  the `fixed` group and its fixtures are a second change, under
  `.claude/rules/transformers.md`, after this one.
- **A package is to be renamed, split or removed.** Each of those breaks
  consumers and is `.claude/rules/api-design.md`'s proposal first.
- **The question is whether a new package is wired correctly.** That is
  `.claude/skills/verify/SKILL.md`, which checks the four silent failures of a
  new package by reading.

## Arguments

`<package name> — <the capability it will own>`. The name is the directory
under `packages/` and the part after `@fulcro/`. The capability is one
sentence, and it is what §2 judges.

With no argument, or with a name and no capability, ask for what is missing and
stop. The capability is the whole case for the package; a name alone gives §2
nothing to decide.

## Before starting

- `git status --short` is clean, or its changes are the user's and known. Never
  stash, discard or commit them to make room.
- `git branch --show-current` is not `main`. On `main`, branch from `dev` and
  say so; on a branch already carrying an unrelated change, ask for a new one.
- `npm run build` has succeeded on this tree, so the verification in §5 has a
  baseline. If it fails before anything changed, stop — that failure is not
  this skill's.

## 1. Read

| #   | Source                                                   | What it settles                                    |
| --- | -------------------------------------------------------- | -------------------------------------------------- |
| 1   | `.claude/CLAUDE.md` "What this repository is"            | What every existing package owns, and its deps     |
| 2   | Each existing `packages/*/README.md` and its barrel      | Whether the capability already has a home          |
| 3   | `.roadmap/first/MASTER-ROADMAP.md` and the feature spec  | Which features will live in the package — the case |
| 4   | `.roadmap/first/GLOSSARY.md`                             | The canonical name for the concept                 |
| 5   | `.claude/rules/naming.md`, `general.md`, `api-design.md` | What a package name and its first surface must be  |
| 6   | `tools/eslint/coded-errors.mjs` `PACKAGE_RANGES`         | The digits taken, and so the next one              |
| 7   | `packages/functions/` — manifest, tsconfigs, LICENSE     | The shape to copy                                  |
| 8   | `vitest.config.mts`, `tests/entrypoints.spec.mts`        | Where the package is registered for the suites     |
| 9   | `.changeset/config.json`, `.changeset/README.md`         | Which packages version together, and why           |
| 10  | `registration.md` beside this file                       | Every registration point known today               |
| 11  | `npm view @fulcro/<name> name`                           | Whether the name is free on the registry           |

Then sweep for the lists `registration.md` may have missed:

```text
Grep "@fulcro/types" and "'types'" outside node_modules, packages/*/src and CHANGELOGs
```

`@fulcro/types` is the most recent runtime package, so every place that
enumerates packages names it. Each hit is either in `registration.md`, a
mention in prose that needs no row, or a registration point to add to the plan
and to that file.

## 2. Decide

**Does it deserve a package?** It does when all of these hold, each with its
evidence written into the plan:

- **No existing package owns it.** Read against row 1 and 2: the capability is
  not what one of them already says it is. Where it fits one, stop and name it.
- **A coherent ownership boundary.** More than one capability will live there —
  two roadmap features, or a feature with several public utilities — and they
  change for the same reason (`.claude/rules/general.md`, single
  responsibility). One helper is not a boundary.
- **A reason it cannot join its nearest sibling**: a runtime dependency that
  sibling must not acquire, a platform it must not require, or a consumer who
  should be able to install one without the other. "It would be tidier" is not
  one.

**Dependency direction.**

- It depends on `@fulcro/errors`, always, at the range its siblings declare.
- It may depend on a sibling below it; nothing that exists starts depending on
  it in this change. A sibling that needs it is a later feature, after the
  package has a surface to depend on.
- No cycle: walk the `dependencies` of each sibling it names, transitively.
- Not `@fulcro/transform-core` — that is the transformer case, out of scope.
- A sibling other than `errors` and `transform-core` that sorts after it
  alphabetically means the root `build` script needs it first. Mark it.

**The name.** `@fulcro/<name>`: kebab case, spelled out, the concept rather
than the mechanism, and in the glossary or proposed for it in the plan
(`.claude/rules/naming.md`). Free on the registry, by row 11 of §1 — a name
taken by somebody else is a stop, not a variant to invent.

**The range.** The lowest digit absent from `PACKAGE_RANGES`. Ranges are one
digit — `CodeRange` in `packages/errors/src/definition/index.ts` — so there
are nine. When none is free, stop: widening the code scheme is a decision for
every package, not a side effect of this one.

**Review.** Delegate the plan to the `architecture-reviewer` subagent before
showing it — adding a package is the first of its triggers. Its memo goes to
the user beside the plan, unedited; a finding it marks blocking is a stop.

Then write the plan:

```text
Package:      @fulcro/<name> — the capability, in one line
Case:         who owns it today (nobody), the boundary, why not the sibling
Depends on:   @fulcro/errors, and any sibling, with the cycle check
Range:        FULCRO<digit>xxx
Files:        one row per path from registration.md, marked sensitive or not
Changeset:    @fulcro/<name> minor, @fulcro/errors minor
Review:       the architecture-reviewer memo
Human steps:  the first publish, after the first feature merges
Out of scope: the first export, any transformer, any sibling depending on it
```

Sensitive, in this skill: the root `package.json`, any `tsconfig*`, the
`.claude/CLAUDE.md` table, a new rule under `.claude/rules/`, and a
`sideEffects` other than `false`.

## 3. Ask

Show the plan and the memo, then ask with `AskUserQuestion`: create it as
planned, change something named, or create nothing. Each sensitive row is its
own question when its turn comes.

If the answer is to create nothing, stop. The plan stands as the record.

## 4. Change

In this order, running the narrow check after each step:

1. **The package** — the six files under "The package itself". Then
   `npm install`, and `npm ls @fulcro/<name>` shows it linked.
2. **The workspace** — `vitest.config.mts`, `tests/entrypoints.spec.mts`, the
   root `build` script if the plan said so. Then `npm run build` and
   `npx vitest run --project <name> --configLoader native --passWithNoTests`.
3. **The error range** — every row of that table in `registration.md`. Then
   `npx vitest run --project errors --project eslint --configLoader native`.
4. **The documentation** — the README rows, the range pages in both languages,
   the package README.
5. **The rule**, only if the plan carried one, with its fixture.
6. **The changeset.** `npm run changeset` is an interactive prompt this skill
   cannot answer; the file it would produce is written directly.

What may not change:

- **An existing test row.** The catalog, range and entry point suites are
  closed lists that a new package extends by one row. Adding that row is the
  registration; altering any other row is not this skill's to do.
- **An export.** The barrel ships with a doc comment and nothing else. The
  first export is the first feature's proposal.
- **Anything outside the plan.** A sibling's manifest, a version field by hand,
  `dist/`, a `.js` beside a source — `.claude/rules/build-output.md`.

Code written here follows the house style of the files it is copied from, the
local lint rules included: arrow functions, braces around anything longer than
a line, no `else` where a ternary or an early return says it.

## 5. Verify

1. `npm run build`, `npm run typecheck`, `npx eslint .`, `npm run format:check`,
   `npx --yes markdownlint-cli2`; `npm run validate:claude` when a rule was
   added.
2. **`/verify`**, which treats a new `packages/` directory as the full pass
   plus its four wiring checks. Its `Status` is carried as it came.
3. **`/api-audit <name>`**, in `tree` mode: the surface is the empty barrel and
   `"./package.json"`, and anything else it finds is a deviation.
4. **`/release-check <name>`**. Its check 15 reports the package as never
   published. That is expected and goes into `Human steps`, not into a failure
   of this skill; anything else it reports is carried verbatim.

`/release-check` and `/api-audit` may refuse to be invoked from here. When the
`Skill` tool refuses, the check is reported as not run, and named as the
user's next command — never assumed to have passed.

## Stop

Halt and hand back when:

- **The capability belongs in an existing package**, or is a single helper.
  Name the package, or say there is no boundary. Nothing is created.
- **The name is taken on npm**, or conflicts with the glossary.
- **No error digit is free.**
- **The `architecture-reviewer` memo marks a finding blocking.**
- **A check fails** — the build, a suite, a lint rule. Report it verbatim. A
  failure that was there before step 1 is not this skill's; one that appeared
  after is, and goes to `/diagnose` if its cause is not plain.
- **The plan grows** past what the user approved — a sibling that turns out to
  need editing, a dependency nobody named.
- **The next step is a human's**: the first publish, pushing, merging. The
  hooks refuse them, and `.claude/rules/protected-operations.md` says how a
  human performs each one.

## Output

Every run, including the one that stops at the plan or at §2:

```text
Status:       CREATED | PARTIAL | BLOCKED | DECLINED | AWAITING-APPROVAL
Package:      @fulcro/<name> — the capability
Case:         the three answers from §2, or why there is no package
Plan:         as agreed, with any deviation marked
Changed:      one row per path — what it is, which registration it satisfies
Verification: build, typecheck, lint, format, and the /verify, /api-audit and
              /release-check reports, each with its status or "not run"
Human steps:  the first publish, with what has to merge before it
Next step:    `/implement-feature` for the first capability, on this branch
```

`DECLINED` is the run that found the capability a home or no boundary: `Case`
says which, and `Changed: nothing`. A package with nothing exported is not a
pull request on its own — it ships nothing a consumer can use, and the first
publish would claim the name for an empty version — so `Next step` is always
the first feature, on the same branch.

`Human steps` always says this, because it is the cost nobody sees in the
diff: `.github/workflows/release.yml` refuses to run while **any** workspace
package is missing from the registry. From the moment this package reaches
`main` until a human publishes its first version by hand — the README section
"The first publish cannot use it" — no package of this repository releases.

Then, for a workflow reading the run:

```json
{
	"skill": "new-package",
	"status": "CREATED",
	"package": "@fulcro/perf",
	"range": "7",
	"depends_on": ["@fulcro/errors"],
	"changed": [{ "path": "packages/perf/package.json", "registers": "package" }],
	"review": { "agent": "architecture-reviewer", "blocking": false },
	"verification": [
		{ "check": "verify", "status": "PASS", "observed": true },
		{ "check": "release-check", "status": "not run", "observed": false }
	],
	"human_steps": ["first publish of @fulcro/perf"],
	"blocked_on": null
}
```

`observed` is `true` only for a check that ran in this session.

## Commands

From `.claude/CLAUDE.md` and the root `package.json`:

- `npm run build`
- `npm run typecheck`
- `npx vitest run --configLoader native`
- `npx eslint .`
- `npm run format` / `npm run format:check`
- `npx --yes markdownlint-cli2`
- `npm run validate:claude`
- `npm run changeset`

Plus `npm install`, which links the workspace and writes the lockfile,
`npm ls`, and `npm view`, which reads the registry and writes nothing.

## References

- `registration.md` — every registration point, with what goes in each.
- `.claude/CLAUDE.md` — the package table and the contract.
- `.claude/rules/errors.md` — ranges, and why one is permanent.
- `.claude/rules/naming.md` — what the name may be.
- `.claude/rules/general.md` — single responsibility, and abstraction after the
  second case.
- `.claude/rules/api-design.md` — why the barrel ships empty.
- `.claude/rules/build-output.md` — the `rootDir`/`outDir` pair.
- `.claude/rules/release.md` and `protected-operations.md` — the first publish.
- `.changeset/README.md` — the `fixed` group, and why a new package is not in
  it.
- `.claude/agents/architecture-reviewer.md` — the review §2 delegates.
- `.claude/skills/implement-feature/SKILL.md` — what builds the first
  capability into the package.
- `.claude/skills/verify/SKILL.md`, `.claude/skills/api-audit/SKILL.md`,
  `.claude/skills/release-check/SKILL.md` — the checks §5 runs.
- `tools/claude/skill-evals/new-package.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "/new-package perf — the measurement and benchmarking layer from F46"
- "F46 needs `@fulcro/perf`. Create the package."

**Do not use this skill when:**

- "Add a `chunkBy` operator." It belongs to `@fulcro/collections`;
  `/implement-feature`.
- "Make a package for this one `clamp` helper." One helper is no boundary — the
  hard stop.
- "Is the new package wired up correctly?" That is `/verify`.
- "Rename `@fulcro/functions` to `@fulcro/flow`." A break, and a proposal under
  `.claude/rules/api-design.md` first.
