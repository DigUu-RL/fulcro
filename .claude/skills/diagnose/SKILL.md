---
name: diagnose
description: Investigates one reported defect — a failing test, a wrong result, a platform-only break, a flake — down to a root cause backed by a reproduction, and reports the cause, the evidence and the candidate fixes without applying any of them. Use when something is failing or behaving wrongly and the cause is not yet established.
allowed-tools: Read, Grep, Glob, Bash(npm run build), Bash(npm run typecheck), Bash(npm run validate:claude), Bash(npx vitest run:*), Bash(npx eslint:*), Bash(node --input-type=module -e:*), Bash(node -e:*), Bash(npm ls:*), Bash(gh run view:*), Bash(gh run list:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git stash list)
---

# diagnose

One defect, taken to its cause. The output is a diagnosis: what was observed,
what it was reproduced by, why it happens, and what could be changed — handed
back before anything is changed.

The failure this exists to prevent is the fast one. An error message is read,
a plausible cause is inferred from its wording, a line is edited, the symptom
moves somewhere else, and nobody can say afterwards what was actually wrong.
Error text names the place that noticed, which is rarely the place that caused
it. A diagnosis that cannot be reproduced is a hypothesis, and this skill says
so in those words rather than promoting it.

**This skill is read-only.** It reports; it does not repair. The repair is the
user's call, and `/fix-warnings` or an ordinary implementation turn carries it
out afterwards with the diagnosis in hand.

## Invocation

The model may invoke it. The trigger is concrete — a named failing check, a
named wrong behaviour — not a mood, and it changes nothing, so the cost of an
unwanted run is the time it takes. It is not cheap: reproducing may mean a
build and a suite. Do not reach for it when the answer is already on screen.

## When this applies

Use it when there is a symptom and no established cause:

- a suite or a case that fails, or fails only sometimes;
- a function that returns something other than what it should;
- a break that appears on one platform, one Node version, or only in CI;
- output that appears only with a transformer applied, or only without one;
- a build or typecheck error whose message points somewhere the code does not.

It does not apply when:

- **The request is a sweep, not a defect.** Every warning in the repository at
  once is `.claude/skills/fix-warnings/SKILL.md`.
- **The cause is already established** and the request is to fix it. Fix it.
- **Nothing is wrong yet** — a review, an audit, a design question. Those read
  code against a standard; this one reads it against an observed failure.
- **The symptom is a question about how something works.** Read the code and
  `docs/` and answer.

## Arguments

The symptom, in the user's own words, and optionally a scope — a package, a
file, a test name. `/diagnose AsyncSequence drains the whole source`.

With no argument, ask for the symptom and stop. There is nothing to
investigate, and guessing at one produces a diagnosis of something nobody
reported.

## Before starting

- `git status --short` and `git diff` — what is uncommitted is the first
  suspect and the last thing to forget. Record it; never discard it.
- `git log -15 --format=%h %s` — a defect that appeared recently usually
  appeared in one of these.
- Whether the symptom involves built output. The entry point suites in
  `tests/` run against `dist/`, so a stale `dist/` is a cause in its own right
  and `npm run build` is a prerequisite for reproducing anything there.
- The symptom is one defect. Two unrelated symptoms are two runs; say so and
  ask which first.

## 1. Read

Gather before concluding anything. Name every source; nothing here is recalled
from memory.

| #   | Source                                | What it settles                                   |
| --- | ------------------------------------- | ------------------------------------------------- |
| 1   | `git status --short`, `git diff`      | What changed and is not committed                 |
| 2   | `git log`, `git show <sha>`           | What changed recently, and in which commit        |
| 3   | The implementation the symptom names  | What the code actually does                       |
| 4   | Its spec file, beside it              | What it was asserted to do                        |
| 5   | `docs/` for that utility              | What consumers were told it does                  |
| 6   | `.claude/CLAUDE.md`, `.claude/rules/` | Whether the behaviour contradicts an invariant    |
| 7   | `vitest.config.mts`                   | Which project a suite runs in, transformer or not |
| 8   | `package.json`, `tsconfig.base.json`  | Scripts and compiler settings as they are today   |

Then reproduce, narrowest first. Always `2>&1`:

```sh
npx vitest run packages/collections/src/take.spec.ts -t "drains" --configLoader native
npm run build
npm run typecheck
npx eslint packages/collections/src/take.ts
node --input-type=module -e "import { take } from './packages/collections/dist/take.js'; console.log([...take([1,2,3], 2)]);"
```

A symptom that only CI has seen is read from CI — `gh run list` for the run,
`gh run view <id> --log` for the output. The matrix is Node 22/24 × Linux and
Windows, and this repository exists partly because behaviour differs across
those; a Windows-only or Linux-only failure is a finding about path separators
or about the transformer's `path.join` matching far more often than it is a
coincidence.

Capture the evidence **verbatim** — the message, the file and line, the
assertion's expected and actual, the exit code. Paraphrased evidence cannot be
compared against the next run.

For a suspected flake, run the case repeatedly and record the ratio:
`npx vitest run <file> -t "<name>" --repeat 20 --configLoader native`. "Passed
17 of 20" is evidence; "it's flaky" is not.

## 2. Decide

Trace from the captured evidence to a cause. The rules that make a second run
land in the same place:

- **Facts and hypotheses are separate**, and labelled. A fact is something a
  command printed or a file says. Everything else is a hypothesis until a
  reproduction turns it into one.
- **A cause is the line whose behaviour explains every piece of captured
  evidence.** One that explains the message but not the assertion's actual
  value is not the cause yet.
- **Error text is a witness, not the accused.** Read the code it points at,
  then read what called it.
- **Check the invariants before blaming the code.** A surprising behaviour may
  be a documented decision: built output resolving over source
  (`.claude/rules/build-output.md`), a suite that is meaningless without its
  transformer, the deliberate absence of `sideEffects: false` on
  `@fulcro/collections`, Vitest's `fsModuleCache` deliberately off. A defect
  that turns out to be a decision is reported as such, with the reference.
- **A performance symptom is counted, not timed.** Elements pulled,
  projections invoked, comparisons made — `docs/testing.md` is the standard,
  and a duration on one machine is not evidence of anything.
- **Search for the abstraction that already exists** before describing a cause
  as missing behaviour. `Grep` the package; this repository has one file per
  utility and the neighbour often already solves it.

Then state confidence, in one of exactly three words:

| Confidence  | Means                                                                 |
| ----------- | --------------------------------------------------------------------- |
| `confirmed` | Reproduced, and the cause was verified by observing it directly       |
| `probable`  | Reproduced, and one explanation fits all the evidence — none verified |
| `unproven`  | Not reproduced, or more than one explanation still fits               |

`unproven` is a legitimate result and is reported as one. It is never upgraded
because the investigation took a long time.

## 3. Change

Nothing. This skill does not write to the repository, does not create a
scratch file in it, and does not run a command that alters state.

Where the minimal reproduction needs to exist as a file, it is **given in the
report** for the user to create — its contents and where it would go — and the
skill stops there. Writing a reproduction into the tree leaves a file behind
that looks like a test and was never reviewed as one.

## 4. Verify

A diagnosis is verified when the reproduction is deterministic and the cause
explains it:

- The reproduction command was **run and observed**, and its output is in the
  report. Not inferred, not remembered.
- Re-running it produces the same failure — or, for a flake, the same ratio
  across the same number of runs.
- Every candidate fix names the file and the line it would change; a fix that
  cannot be located is a direction, and is labelled as one.

Nothing is confirmed by reading the diff. If the reproduction did not run, the
status is `NOT-REPRODUCED` and the report says which step blocked it.

## Stop

Halt and hand back when:

- **The symptom cannot be reproduced** and the evidence does not establish a
  cause. Report what was tried, what each attempt produced, and what would
  settle it. A guess handed over as a root cause is worse than an admitted gap.
- **The cause is in a dependency or outside the repository.** Say which, with
  the version, and stop.
- **The investigation needs a change to proceed** — an added log line, an
  edited fixture, a widened type. Ask; do not edit to confirm a hypothesis.
- **Two defects turn out to be entangled.** Report the first with what is
  known, name the second, and let the user choose the order.
- **A prerequisite turns out false**: a named script is gone, `dist/` cannot
  be built, `gh` is not authenticated.
- **The next step is reserved for a human.** Push, publish, merge and
  discarding uncommitted work are not this skill's; the hooks refuse them and
  `.claude/rules/protected-operations.md` says why.

A failing test is never adjusted, and a failing test encountered on the way is
part of the evidence, not something to clear.

## Output

The same nine sections, in this order, every run — including the run that
finds nothing.

```text
Status:              DIAGNOSED | PARTIAL | NOT-REPRODUCED | BLOCKED
Symptom:             the report, in the user's words, plus the scope
Observed evidence:   verbatim output, each item with the command that produced it
Root cause:          the line and why, with the confidence word
Minimal reproduction: the command, or the file contents for the user to create
Affected surface:    files, packages, and whether the public API is involved
Candidate fixes:     each with file:line, what it buys, what it costs
Recommended next step: one action
Unknowns:            what was not established, and what would settle it
```

`Observed evidence` separates the two kinds explicitly: facts first, each with
its command, then hypotheses under their own heading. A hypothesis never
appears in `Root cause` without its confidence word beside it.

`Candidate fixes` are described, never applied, and never ranked by ease alone
— a fix that changes a package's public surface is marked as such, because
that is review territory under `.claude/CLAUDE.md` whatever its size.

**When nothing reproduces:** `Status: NOT-REPRODUCED`, the evidence collected,
the attempts and what each produced, `Root cause: unproven`, and `Unknowns`
carrying what would settle it. The sections are still all there; none is
dropped because it would be empty.

Then the same figures once more, for a workflow reading the run rather than a
person:

```json
{
	"skill": "diagnose",
	"status": "DIAGNOSED",
	"symptom": "AsyncSequence drains the whole source",
	"confidence": "confirmed",
	"reproduction": {
		"command": "npx vitest run packages/collections/src/take.spec.ts -t \"drains\" --configLoader native",
		"deterministic": true,
		"observed": true
	},
	"cause": { "where": "packages/collections/src/take.ts:31", "why": "…" },
	"surface": { "files": ["packages/collections/src/take.ts"], "public": false },
	"fixes": [{ "where": "packages/collections/src/take.ts:31", "cost": "…" }],
	"unknowns": []
}
```

`observed` is `true` only for a command this run actually ran. A step that was
skipped is reported as skipped; it is never assumed to have passed.

## Commands

From `.claude/CLAUDE.md` and the root `package.json`:

- `npm run build`
- `npm run typecheck`
- `npx vitest run --configLoader native`
- `npx eslint .`
- `npm run validate:claude`

## References

- `.claude/CLAUDE.md` — the project contract, the command table, and what
  counts as public API.
- `.claude/rules/build-output.md` — why an emitted file beside its source is a
  tsconfig bug, and why a stale `dist/` reads as a broken import.
- `.claude/rules/protected-operations.md` — what no skill performs.
- `docs/testing.md` — the testing standard, and why a performance symptom is
  counted rather than timed.
- `.claude/skills/fix-warnings/SKILL.md` — the sweep, for when the request is
  every warning rather than one defect.
- `.claude/skills/skill-authoring/SKILL.md` — the standard this skill is
  written against.
- `tools/claude/skill-evals/diagnose.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "The reflect suite is failing on `defaultOf` — find out why."
- "`take` drains the whole source instead of stopping. What's going on?"
- "The transformer works here and fails on the Linux CI leg."
- "`entrypoints.spec.mts` passes locally and fails on Node 24."

**Do not use this skill when:**

- "List every warning in the project." That is the sweep — `fix-warnings`.
- "Add a `takeWhile` operator to `@fulcro/collections`." Nothing is failing.
- "We know the cache is stale — clear it and rerun." The cause is established;
  this skill would re-establish it and change nothing.
