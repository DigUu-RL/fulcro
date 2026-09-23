# Template — side-effect skill

For a skill that writes, commits, or does anything a later reader would have to
undo. Everything in it beyond an ordinary skill exists for one reason: the user
sees the plan before it happens, and the skill stops rather than improvising
when reality disagrees.

Copy to `.claude/skills/<name>/SKILL.md` and replace everything; delete the
notes as they are answered.

The standard behind each section is `../SKILL.md`; the review pass is
`../checklist.md`. Before writing, check `.claude/rules/protected-operations.md`
— if the skill needs to push, publish, merge or discard uncommitted work, it
cannot be written, and the section there on how a human performs it is the
answer instead.

---

````markdown
---
name: <kebab-case-name>
description: <What it changes.> <When to use it.>
disable-model-invocation: <true, if the effects are irreversible or a human paces the timing — otherwise delete this line>
allowed-tools: Read, Grep, Glob, Edit, Write, Bash(<the exact commands, enumerated>)
---

# <name>

(What it changes, and what it is worth. Then the one sentence that governs the
rest: nothing is modified before the user has seen what would be.)

(If `disable-model-invocation` is set, say here why — "this records a version
bump, and when that happens is the release's business, not an edit's". If it is
not set, the effects are ordinary working-tree edits the user asked for, and
git holds them.)

## When this applies

(The trigger, and the near misses that belong to other skills.)

## Arguments

(What it accepts, and the no-argument case.)

## Before starting

(Prerequisites, each checkable. For a skill that writes, almost always: the
working tree is clean or its changes are the user's own and known; the branch
is not `main`; the build the change will be verified against exists.

If one is false, stop and say which. Do not clean the tree — discarding
uncommitted work is not this skill's to do, nor any skill's.)

## 1. Read

(Everything the plan will be built from. Named commands, named paths.)

## 2. Plan

(Assemble the full set of changes before making any of them: file, what
changes, why. Rank them from trivial to delicate.

Mark each one **sensitive** or not. In this repository, sensitive means at
least: it changes a package's public surface; it edits `package.json`,
`tsconfig*`, or build config; it touches a line carrying a comment that
explains the current decision; it contradicts something written in
`.claude/rules/` or `.claude/CLAUDE.md`; or more than one resolution is
legitimate and the choice is architectural.)

## 3. Ask

(Show the plan as a table, then ask — `AskUserQuestion`, real options, each
saying what it buys and what it costs, one of them always "change nothing".

If the answer is to change nothing: stop. No files, no commit. The plan stands
as the record.

Every sensitive item is its own question when its turn comes, not a footnote to
the first one.)

```text
| # | Change | Where | Why | Sensitive |
```

## 4. Change

(Only after the answer. In the ranked order, one subject at a time, and rerun
that subject's verification before starting the next. A change that does not
produce the intended result was not the change.)

## 5. Verify

(The full battery at the end, with its output shown: what passes now that did
not, and what was left alone by whose decision.)

## Stop

(Halt and hand back when: a test fails — the test is not adjusted to
accommodate the change, ever; a prerequisite turns out false; the plan grows
past what the user approved; or the next step is something
`.claude/rules/protected-operations.md` reserves for a human.)

## Output

(What the user gets before the change — the plan table. What they get after —
what changed, what verified it, what was deliberately not done and why. And the
nothing-to-do case: say what was checked, say there was nothing, end.)

## Commit

(Only if a file actually changed. Read `git log -15 --format=%s%n%b` and match
the repository's style. Append the session's attribution trailer. Never push —
the commit stays local for the user to review; show `git log -1 --stat`.)

## Commands

(Copied from `.claude/CLAUDE.md` or `package.json`.)

## References

(`.claude/rules/protected-operations.md` at minimum, plus whatever defines what
this skill is allowed to change.)

## Examples

**Use this skill when:**

- <a request that must trigger it>
- <another>

**Do not use this skill when:**

- <the request that wants a report, not a change — name the audit that reports>
- <the near miss>
````
