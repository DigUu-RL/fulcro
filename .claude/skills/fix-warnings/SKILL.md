---
name: fix-warnings
description: Sweeps the whole repository for warnings (build, typecheck, tests, lint, formatting, markdown, dependencies, CI), explains the cause and the recommended fix of each one, and then asks whether to fix them. Use when asked to list, clean up, resolve or understand the project's warnings, or before opening a pull request.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Write, AskUserQuestion, Bash(npm run build), Bash(npm run typecheck), Bash(npm run format), Bash(npm run format:check), Bash(npm run lint:md), Bash(npm run validate:claude), Bash(npm run changeset), Bash(npx vitest run:*), Bash(npx eslint:*), Bash(npm ls:*), Bash(gh run:*), Bash(git log:*), Bash(git status:*), Bash(git diff:*), Bash(git add:*), Bash(git commit:*)
---

# fix-warnings

Raise **every** warning in the repository, explain each one, and only then ask
whether to fix them. Nothing is modified before the user has seen what would be.

A warning is not noise: it is a notice someone wrote because the code says one
thing and does another. The value of this skill is in the diagnosis — the
reason — not in making the message disappear. Silencing (`eslint-disable`,
`@ts-ignore`, `@ts-expect-error`, `skip`) is always the last option and always
needs the user's explicit approval.

## Invocation

`disable-model-invocation: true`. Not because the edits are irreversible — they
are working-tree edits and git holds them — but because of the timing and the
cost. The sweep is a full build, a full test run and a CI log read; auto-invoked
after an ordinary edit it would run several times an hour and be switched off
within a week. When the sweep happens is the user's to pace, and the sweep ends
in a question only they can answer.

## When this applies

Use it when the request is about the warnings as a body of work: list them,
explain them, clear them, or find out whether the tree is clean before a pull
request.

It does not apply when:

- **A check is failing, not warning.** A red test or a type error is a defect
  with a location; diagnose that one thing instead of sweeping everything.
- **The request is to implement something.** Warnings introduced by work in
  progress belong to that work.
- **The request is one check.** `npm run format:check` on its own is a command,
  not a procedure.

## Arguments

A scope, optionally: a package name, a directory, or a check to limit the sweep
to (`lint`, `markdown`, `dependencies`). With no argument the sweep is the whole
repository, which is the normal case. A scope narrows step 1's table and nothing
else — triage, the question and verification are unchanged, and the report says
which checks were skipped.

## Before starting

- `git status --short` — the working tree's state is recorded before anything
  runs, so the diff at the end is attributable. Uncommitted work is not an
  obstacle and is never discarded; it is noted, because a warning may belong
  to it.
- The current branch is not `main`. If it is, say so and stop; work reaches
  `main` through a pull request.
- `package.json` at the root is read before any command from the table below is
  run. A script that was renamed is used under its current name.

## 1. Collect

Run from the workspace root, always with `2>&1` — that is where nearly every
warning goes. Do not stop at the first command that fails: a broken build also
hides the warnings of the steps after it, so record the failure and carry on
with what still runs.

| #   | Command                                        | What it reveals                                                                               |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | `npm run build`                                | `tsc` under every tsconfig flag, `tsc-alias`, transformer notices                             |
| 2   | `npm run typecheck`                            | the same checks without emit, plus `tsconfig.tests.json`                                      |
| 3   | `npx vitest run --configLoader native`         | runner and Vite warnings, config hints, `console.warn` from the suites, Node API deprecations |
| 4   | `npx eslint .`                                 | the rules in `eslint.config.mjs`, including the local `local/brace-wrapped-branches`          |
| 5   | `npm run format:check`                         | files outside Prettier's format                                                               |
| 6   | `npm run lint:md`                              | `markdownlint-cli2` under `.markdownlint-cli2.jsonc`                                          |
| 7   | `npm run validate:claude`                      | the `.claude` tree: skill frontmatter, dangling references, eval coverage                     |
| 8   | `npm ls --all` and the output of `npm install` | `deprecated`, unsatisfied peer dependencies, `EBADENGINE`                                     |
| 9   | `gh run view <id> --log` for the latest CI run | warnings that only appear on Linux or on another Node version                                 |

CI (step 9) earns its place: the matrix covers Node 22/24 × Linux/Windows, and
this repository exists partly because behaviour differs between platforms. If
`gh` is not authenticated or there is no run to read, the step is **BLOCKED**
and the report says so — it is not silently dropped.

Each check gets one status, and these are the only four:

| Status    | Means                                                              |
| --------- | ------------------------------------------------------------------ |
| `PASS`    | The check ran and produced nothing                                 |
| `WARN`    | The check ran and produced warnings                                |
| `FAILED`  | The check ran and errored — a compile error, a red test            |
| `BLOCKED` | The check could not run: an earlier failure, a missing tool, no CI |

## 2. Triage

For each warning found, establish before writing anything down:

- **The literal message** and the file:line.
- **Why it is appearing** — read the code it points at. Do not infer it from
  the message. Plenty of warnings point at the symptom while the cause is a few
  lines above.
- **The recommended fix**, concretely: what changes, in which file.
- **Whether it is sensitive.**

An item is **sensitive** when any of these holds:

- it changes a package's public surface — what would break
  `tests/entrypoints.spec.mts`;
- the fix is to silence rather than to resolve;
- it requires a dependency version bump, or edits `package.json`, `tsconfig*`
  or build config;
- it touches a line carrying a comment that explains the current decision; this
  repository documents the why in the code, and a long comment above a line is
  notice that someone already thought about it;
- it contradicts something written in `.claude/CLAUDE.md` or `.claude/rules/`
  (for example: `@fulcro/collections` does not declare `sideEffects: false`;
  Vitest's `fsModuleCache` is deliberately off despite the hint it prints on
  every run — that hint is **not** a warning to clear);
- more than one resolution is legitimate and the choice is taste or
  architecture.

Group identical warnings repeated across files into one item, with the count.

## 3. Report

A table, cheapest item first, most delicate last:

```text
| # | Warning | Where | Why it appears | Recommended fix | Sensitive |
```

Below the table, one short paragraph per sensitive item explaining the dilemma —
the reasoning does not fit in a cell.

Then the summary of §7, always, in the same shape every run.

**If there are no warnings:** say so, show the check table with what was
verified and its status, and stop. Nothing is asked, nothing is committed.

## 4. Ask

With `AskUserQuestion`, exactly two options:

1. **Fix them** — apply the fixes, asking case by case at the sensitive ones.
2. **Leave as is** — nothing is changed; the report stands as the record.

If the answer is to leave it, stop without touching a file and without a commit.

## 5. Fix

Only after the yes. In the order of the table, trivial to sensitive.

- **One subject at a time**, and rerun the check that produced that warning
  before moving to the next. A fix that does not clear the warning was not the
  fix.
- **Every sensitive item becomes its own question**, with the real options
  (including "leave this one"), each saying what it buys and what it costs. The
  user may answer something else entirely — if they do, follow their answer.
- Automatic `--fix` (`npx eslint . --fix`, `npm run format`) is allowed, but
  **read the diff afterwards**. Prettier's and `simple-import-sort`'s rewrites
  are safe; a rule that rewrites logic is not.
- Never silence without explicit approval, and when the user approves
  silencing, write a comment above it saying why.
- If a fix touches `packages/*/src/**`, record a changeset with
  `npm run changeset`; the release-readiness workflow fails a pull request
  without one.

## 6. Verify

At the end, rerun the full battery — steps 1 to 8 of §1, plus step 9 if it was
readable — and show the result: which warnings are gone, which remain, and by
whose decision. Success is every check that was `PASS` still `PASS`, every
`WARN` that was approved for fixing now `PASS`, and nothing newly `FAILED`.

A verification whose only evidence is rereading the diff is not a verification.

## Stop

Halt and hand back when:

- **A test fails.** Report what broke and stop. A test is never adjusted to
  accommodate a fix — not this skill's to do, not any skill's.
- **A check was already failing before the sweep.** That is a defect, not a
  warning; report it as `FAILED` and do not fix it under this skill's approval.
- **A prerequisite turns out false** — the branch is `main`, a named script is
  gone.
- **The work grows past what the user approved.** A fix that turns out to need
  three others goes back as a question.
- **The next step is reserved for a human.** Push, publish, merge and
  discarding uncommitted work are not this skill's, and the hooks refuse them:
  `.claude/rules/protected-operations.md`.

## 7. Output

Every run produces, in this order: the check table, the warning table, one
paragraph per sensitive item, and the summary. After a fix run, the summary
appears a second time, post-fix, so the two can be diffed.

The summary is deterministic — the same lines in the same order, every run,
including the zero case:

```text
Checks:    9 run — 6 PASS, 2 WARN, 0 FAILED, 1 BLOCKED
Warnings:  14 found — 11 routine, 3 sensitive
Fixed:     11
Remaining: 3 — 2 declined by the user, 1 blocked
Files:     6 changed
Commit:    <sha> | none
```

For an orchestrator reading the run rather than a person, the same figures once
more as JSON, after the lines above:

```json
{
	"skill": "fix-warnings",
	"status": "WARN",
	"checks": [{ "id": "build", "command": "npm run build", "status": "PASS" }],
	"warnings": [
		{
			"id": "no-unused-vars-cast",
			"where": "packages/collections/src/cast.ts:42",
			"sensitive": false,
			"status": "WARN",
			"resolution": "fixed"
		}
	],
	"summary": {
		"found": 14,
		"fixed": 11,
		"remaining": 3,
		"declined": 2,
		"blocked": 1,
		"filesChanged": 6
	},
	"commit": null
}
```

`status` is the worst of the check statuses, ranked `PASS` < `WARN` < `BLOCKED`
< `FAILED`. `resolution` is one of `fixed`, `declined`, `blocked`, `deliberate`
— the last for a notice the repository has already decided about, such as the
`fsModuleCache` hint. Every figure in the JSON is one that was observed; a check
that did not run is `BLOCKED`, never omitted and never assumed.

## 8. Commit

Only if a file actually changed.

Read `git log -15 --format=%s%n%b` and write in the repository's style, which
today is: imperative subject, in English, no conventional-commits prefix, no
full stop; body in prose explaining **why** — what the warning was really
reporting and what the fix now guarantees. One paragraph per subject when there
is more than one.

Append the session's attribution trailer.

Do not push — the commit stays local for the user to review. Show
`git log -1 --stat`.

## Commands

From `.claude/CLAUDE.md` and the root `package.json`:

- `npm run build`
- `npm run typecheck`
- `npx vitest run --configLoader native`
- `npx eslint .`
- `npm run format:check` / `npm run format`
- `npm run lint:md`
- `npm run validate:claude`
- `npm run changeset`

## References

- `.claude/CLAUDE.md` — the project contract, the canonical command table, and
  the repository's position on warnings.
- `.claude/rules/protected-operations.md` — what no skill performs.
- `.claude/rules/build-output.md` — why an emitted file beside its source is a
  tsconfig bug and not a file to delete.
- `docs/testing.md` — the testing standard a fix must not erode.
- `.claude/skills/skill-authoring/SKILL.md` — the standard this skill is
  written against.
- `tools/claude/skill-evals/fix-warnings.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "List every warning in the project and explain each one."
- "Clean up the warnings before I open the pull request."
- "Is the tree clean? I want to know what's still warning."

**Do not use this skill when:**

- "The reflect suite is failing on `defaultOf` — find out why." A failing test
  is an error with a location, not a sweep.
- "Add a `takeWhile` operator to `@fulcro/collections`." That is the feature,
  its behaviour suite and its performance suite.
- "Run Prettier." One command is a command.
