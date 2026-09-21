---
name: verify
description: Runs the checks a change actually needs — build, typecheck, the affected Vitest projects, formatting, ESLint, and the specialised suites for transformers, entry points, performance and the `.claude` tree — and reports status, evidence, and every check that was skipped with its reason. Use when a change is ready to be checked — before a commit, before opening a pull request, or when asked whether the tree is green.
allowed-tools: Read, Grep, Glob, Bash(npm run build), Bash(npm run typecheck), Bash(npm run format:check), Bash(npm run lint:md), Bash(npm run validate:claude), Bash(npx vitest run:*), Bash(npx eslint:*), Bash(npm ls:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*)
---

# verify

The authoritative local verification pass. It reads what changed, decides which
checks that change can actually break, runs them, and reports what passed, what
failed and what was not run — with the output that says so.

Verification means evidence, not inspection. A diff that looks right is not a
verified diff; `docs/testing.md` says the same thing about performance, which
is why this repository counts work rather than reading the clock. The failure
this skill exists to prevent is the confident summary: a report that says the
suites pass when the suites were never started, or that calls a red check a
warning because the change "obviously" did not cause it.

**This skill is read-only.** It runs checks and reports them. It does not fix
what it finds, does not reformat, does not touch a test. The repair is
`/fix-warnings` for a body of warnings, `/diagnose` for one defect with no
established cause, or an ordinary implementation turn — each with this report
in hand.

**This project owns `/verify` deliberately.** Claude Code's own verification
workflow is written for applications: start it, click through it, watch it
behave. Nothing here is an application. The evidence that a change to
`@fulcro/collections` is sound is a counted assertion in a Vitest project with
a transformer wired into it, and that is what this skill runs.

## Invocation

The model may invoke it. It changes nothing, so an unwanted run costs time
rather than work — but it costs real time: a full pass is a build, four package
projects and four root projects. The description is narrow on purpose.

Do not invoke it after every edit. The signal is a change that is finished: a
commit about to be made, a pull request about to be opened, a question about
whether the tree is green. Mid-implementation, run the one targeted command
instead; §1 names them.

## When this applies

Use it when the request is the state of the tree as a whole:

- a change is complete and about to be committed or pushed by the user;
- a pull request is about to be opened;
- the request is "is this green", "did I break anything", "check it";
- a broad change — a config, a tsconfig, a dependency — whose blast radius is
  not obvious.

It does not apply when:

- **Something is already failing and the cause is unknown.** That is one defect
  with a location: `.claude/skills/diagnose/SKILL.md`.
- **The request is the warnings as a body of work** — list them, explain them,
  clear them. That is `.claude/skills/fix-warnings/SKILL.md`, which also asks
  before changing anything.
- **The request is one check.** `npm run format:check` is a command, not a
  workflow. Run it.
- **The change has not been built yet.** Building it is
  `.claude/skills/implement-feature/SKILL.md`, whose §4 invokes this skill once
  the work is done.
- **Nothing has changed since the last run.** Say what the last run found.

## Arguments

An optional scope: a package (`/verify collections`), a path, or `full` to skip
the selection in §2 and run everything.

With no argument, the scope is the working tree — everything uncommitted, plus
what is on this branch and not on `main`. That is the common case and the one
the workflow below is written for.

## Before starting

- `git status --short` and `git diff --stat` decide the scope. If both are
  empty, compare against the base: `git diff --stat main...HEAD`.
- If the scope is still empty, there is nothing to verify. Say so and stop.
- The entry point suites in `tests/` run against `dist/`, so they mean nothing
  over a stale build. Where they are in scope, `npm run build` is a
  prerequisite and not an optional first check.
- Uncommitted work is never stashed, discarded or committed to get a cleaner
  run. It is part of what is being verified.

## 1. Read

Establish the changed surface before choosing a single check. Name every
source; nothing here is recalled from memory.

| #   | Source                                    | What it settles                        |
| --- | ----------------------------------------- | -------------------------------------- |
| 1   | `git status --short`                      | What is uncommitted                    |
| 2   | `git diff --name-only`                    | Which files, unstaged                  |
| 3   | `git diff --name-only --cached`           | Which files, staged                    |
| 4   | `git diff --name-only main...HEAD`        | What this branch adds over the base    |
| 5   | `vitest.config.mts`                       | Which project a path belongs to        |
| 6   | `package.json`                            | The scripts, spelled as they are there |
| 7   | `.github/workflows/ci.yml`                | What CI will run over the same change  |
| 8   | `.github/workflows/release-readiness.yml` | What a pull request additionally needs |

Then map each changed path to its surface. The table is the decision, and a
path that matches more than one row takes every check those rows name.

| Changed path                               | Surface        | Checks it requires                                            |
| ------------------------------------------ | -------------- | ------------------------------------------------------------- |
| `packages/*/src/**/*.ts` (not a spec)      | runtime        | build, typecheck, that package's project, eslint, changeset   |
| `packages/*/src/**/*.spec.ts`              | tests          | typecheck, that package's project                             |
| `packages/*/src/**/*.performance.spec.ts`  | performance    | that package's project, performance files first               |
| `packages/*/transformer/**`, `unplugin/**` | transformer    | build, `transformers` project, both affected package projects |
| `packages/*/package.json`, `exports`       | public surface | build, `entrypoints` project, changeset                       |
| `tests/*.spec.mts`                         | entry points   | build, `entrypoints` project                                  |
| `tests/transformers/**`                    | transformer    | `transformers` project                                        |
| `tests/hooks/**`, `.claude/hooks/**`       | hooks          | `hooks` project, `npm run validate:claude`                    |
| `.claude/**`, `tools/claude/**`            | control plane  | `npm run validate:claude`, `claude` project                   |
| `tests/claude/**`                          | control plane  | `claude` project                                              |
| `docs/**`, any `*.md`                      | documentation  | `npm run lint:md`, `npm run format:check`                     |
| `tsconfig*.json`, `vitest.config.mts`      | configuration  | everything                                                    |
| `eslint.config.*`, `.prettierrc*`          | configuration  | eslint, `npm run format:check`                                |
| root `package.json`, `package-lock.json`   | configuration  | everything                                                    |
| `.changeset/**`                            | release        | `npm run format:check`                                        |
| `.github/workflows/**`                     | CI             | nothing runnable locally — reported as such                   |
| a `packages/` directory that is new        | new package    | everything, plus the new-package checks below                 |

The targeted commands, spelled as they are run. Always `2>&1`, and never stop
at the first failure: record it and continue, so one broken check does not hide
the state of the rest.

```sh
npm run build
npm run typecheck
npx vitest run --project collections --configLoader native
npx vitest run --project entrypoints --configLoader native
npx vitest run --project transformers --configLoader native
npx vitest run --project hooks --project claude --configLoader native
npx vitest run performance --project collections --configLoader native
npx eslint packages/collections/src/take.ts
npm run format:check
npm run lint:md
npm run validate:claude
```

The full pass, when §2 escalates — the build first and then the suites, which
is what CI does and what `npm test` would do with a second build in front of
it:

```sh
npm run build
npm run typecheck
npx vitest run --configLoader native
npx eslint .
npm run format:check
npm run lint:md
npm run validate:claude
```

## 2. Decide

The selection rules, in order. They are what makes a second run over the same
diff land on the same set of checks.

- **Baseline first.** Typecheck, the affected suites, `npm run format:check`
  and ESLint run for any change that touches a tracked file. Formatting and
  lint are cheap and their failures are the ones a reviewer sees first.
- **Build when anything is read from `dist/`.** Runtime source, transformers,
  a package manifest, or any entry point suite in scope. The build is not
  skipped because the last one was recent — a stale `dist/` reads as a broken
  import, and `.claude/rules/build-output.md` is where that failure is written
  down.
- **A suite runs as its own project.** `vitest.config.mts` defines eight of
  them; a path belongs to exactly one, and running the wrong one proves
  nothing. A package project applies both transformers, the `entrypoints`
  project deliberately applies neither.
- **Escalate to the full pass** when the change touches a tsconfig, the Vitest
  config, the root manifest, the lockfile, or more than three packages — and
  whenever the mapping in §1 leaves a changed path unclassified. An unclassified
  path is the case the selection was not written for, and guessing narrow there
  is how a regression ships.
- **A new package is verified as wiring before it is verified as code.** Four
  things are checked by reading, and each one fails silently when it is absent:
  the package is registered as a project in `vitest.config.mts` — otherwise its
  suites never run and the absence looks like a clean pass; its `tsconfig.json`
  sets `rootDir` to `./src` and `outDir` to `./dist`, which is
  `.claude/rules/build-output.md`; its `exports` map is covered by
  `tests/entrypoints.spec.mts`; and it carries a changeset, since its first
  version is a release. Then the full pass.
- **A public surface change is marked, not judged.** An altered `exports` map,
  an added export, a changed exported type: the report says so and names it
  review territory under `.claude/CLAUDE.md`. Verification does not approve it.
- **A shipped source change with no version bump is a failure of the release
  gate**, not a warning. `.github/workflows/release-readiness.yml` fails the
  pull request for it. Check for a file under `.changeset/` other than
  `README.md` and `config.json`; where there is none, report it with
  `npm run changeset` as the recommended next step.
- **Performance is counted.** Where an algorithm changed, the performance files
  of that package are part of the required set, and their assertions are
  counted work — elements pulled, projections invoked. A duration is not
  evidence; `docs/testing.md` is the standard.
- **Windows and Linux are one matrix, and this machine is half of it.** A
  transformer change verified here is verified on one path separator. The
  report says which half was covered.

Severity, and it has exactly two levels:

| Level     | Means                                                           |
| --------- | --------------------------------------------------------------- |
| `failure` | A check exited non-zero, or a required check could not be run   |
| `warning` | A check passed and printed something a person should still read |

**A failure is never downgraded.** Not because it looks unrelated to the
change, not because it was already failing before, not because a cheaper check
passed. A failure that predates the change is reported as a failure and marked
`pre-existing`, with the commit that shows it — `git stash list` is not
consulted and nothing is stashed to find out.

## 3. Change

Nothing. This skill does not edit, does not run `npm run format`, does not add
a changeset, does not commit. A check that would pass after a one-character fix
is reported with that fix described, and the fix is someone else's turn.

## 4. Verify

The report is verified when every claim in it came from output this run
observed:

- Each check in `Checks executed` has its command and its exit status, taken
  from the run, not inferred.
- Each check in `Checks skipped` has the reason it was not needed — a surface
  the change does not touch — or the reason it could not run.
- `Status: PASS` requires that every required check ran and exited zero. One
  required check unrun makes it `PARTIAL`, whatever the others did.
- Evidence for a failure is verbatim: the message, the file and line, the
  assertion's expected and actual, the exit code. Paraphrased output cannot be
  compared against the next run.

## Stop

Halt and hand back when:

- **A required check cannot run.** A missing script, a build that will not
  complete, a `dist/` that cannot be produced. Report `BLOCKED`, name the
  check, and stop rather than substituting a cheaper one.
- **A failure is unrelated to the change.** Report it, mark it `pre-existing`,
  and do not investigate — that is `/diagnose`, and it is a separate run the
  user chooses.
- **The scope is empty**, or the working tree holds nothing this skill knows
  how to classify and the user has not said `full`.
- **A check demands a change to proceed** — a formatting rewrite, a regenerated
  lockfile, an added changeset. Describe it; do not perform it.
- **The next step is reserved for a human.** Push, publish, merge and
  discarding uncommitted work are not this skill's. The hooks refuse them and
  `.claude/rules/protected-operations.md` says why.

A failing test is never adjusted, never skipped, and never re-run until it
passes. A suite re-run to establish a ratio is a flake investigation, which
belongs to `/diagnose`.

## Output

The same seven sections, in this order, every run — including the run where
everything passes.

```text
Status:          PASS | FAIL | PARTIAL | BLOCKED
Changed surface: the surfaces from §1, with the paths that put each one in scope
Checks executed: one row per check — command, exit status, what it covered
Checks skipped:  one row per check — which, and why it was not needed or not runnable
Failures:        verbatim output, each with the command that produced it
Warnings:        what passed but should be read, each with its source
Evidence:        the counted assertions and coverage the run actually observed
```

`Checks executed` and `Checks skipped` are both tables, and neither is dropped
because it would be short. A skipped check with no reason beside it is the
thing this contract exists to make impossible.

**When everything passes:** `Status: PASS`, the two tables, `Failures: none`,
the warnings if any, and the evidence. Do not end with a question — there is
nothing to decide — and do not offer to fix what did not fail.

Then the same figures once more, for a workflow reading the run rather than a
person:

```json
{
	"skill": "verify",
	"status": "PASS",
	"surface": ["runtime", "tests"],
	"executed": [
		{ "check": "build", "command": "npm run build", "exit": 0 },
		{
			"check": "collections",
			"command": "npx vitest run --project collections --configLoader native",
			"exit": 0
		}
	],
	"skipped": [
		{
			"check": "entrypoints",
			"why": "no exports map or package manifest changed"
		}
	],
	"failures": [],
	"warnings": [],
	"public_surface_changed": false,
	"changeset_present": true,
	"platforms": ["win32"]
}
```

`exit` is recorded for a command this run actually ran. A check that was not
run appears under `skipped` with its reason; it is never given an exit status
it was not observed to produce.

## Commands

From `.claude/CLAUDE.md` and the root `package.json`:

- `npm run build`
- `npm run typecheck`
- `npx vitest run --configLoader native`
- `npx eslint .`
- `npm run format:check`
- `npm run lint:md`
- `npm run validate:claude`

`npm test` is the same suites with a build in front of them; this skill runs
the two separately so a build failure is reported as a build failure.

## References

- `.claude/CLAUDE.md` — the project contract, the canonical command table, and
  what counts as public API.
- `.claude/rules/build-output.md` — why a stale or misplaced `dist/` reads as a
  broken import, and why the build is not an optional check.
- `.claude/rules/protected-operations.md` — what no skill performs.
- `docs/testing.md` — the testing standard: behaviour and performance, counted
  rather than timed.
- `vitest.config.mts` — the eight projects, and why each one exists.
- `.github/workflows/ci.yml` — the same checks as CI runs them.
- `.github/workflows/release-readiness.yml` — the changeset gate on a pull
  request.
- `.claude/skills/diagnose/SKILL.md` — one defect, taken to its cause.
- `.claude/skills/fix-warnings/SKILL.md` — the sweep, and the repair.
- `.claude/skills/skill-authoring/SKILL.md` — the standard this skill is
  written against.
- `tools/claude/skill-evals/verify.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "I'm done with the `takeWhile` change — is it green?"
- "Check everything before I open the pull request."
- "I bumped TypeScript in the root manifest. Did anything break?"
- "Verify the transformer change."

**Do not use this skill when:**

- "The reflect suite fails on `defaultOf` — find out why." A known failure with
  no established cause is `/diagnose`.
- "Clean up every warning in the project." That is `/fix-warnings`, which asks
  before it changes anything.
- "Run the formatter." One command, not a workflow.
