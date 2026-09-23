# Template — general skill

Copy to `.claude/skills/<name>/SKILL.md` and replace everything. The
parenthetical notes are addressed to the author and are deleted as they are
answered — a shipped skill contains no instructions to whoever wrote it.

The standard behind each section is `../SKILL.md`; the review pass is
`../checklist.md`.

---

```markdown
---
name: <kebab-case-name>
description: <What it does.> <When to use it — name the surface: a directory, a file kind, a command, an event.>
---

# <name>

(One paragraph: what this is for, and what goes wrong without it. Not a
restatement of the description — the reason.)

## When this applies

(The trigger, concretely. Then the near misses: the requests that look like
this one and belong to another skill, with that skill named.)

## Arguments

(What it accepts. What each one means. What happens with none — a default, or
a question to the user. Delete the section if it takes none, and say so above.)

## Before starting

(Prerequisites, each one checkable: a clean working tree, a built `dist/`, a
branch that is not `main`, a file that must exist. Say what to do when one is
false — usually stop and say which.)

## 1. Read

(What to gather, and from where. Name the commands and the paths. Read
`package.json` before naming a script. Nothing here is recalled from memory.)

## 2. Decide

(The criteria. What counts, what does not, how findings are ordered, what is
out of scope. Written so a second run on the same input reaches the same
conclusions — that is the test for this section.)

## 3. Change

(What may be modified and in what order, and what may not be touched. If the
skill changes nothing, replace this section with one sentence saying it is
read-only, and use `audit.md` instead of this template.)

## 4. Verify

(The command that proves it worked, and the output that means success. A
change confirmed by rereading the diff is not verified.)

## Stop

(What makes the skill halt and hand back. At minimum: a check that fails for a
reason the skill did not cause; a prerequisite that turns out false; anything
`.claude/rules/protected-operations.md` reserves for a human.)

## Output

(What the user gets: the report's shape, the table's columns, the summary line.
And what is said when there is nothing to report — that case is not an
afterthought, it is the common one.)

## Commands

(The repository commands this skill runs, spelled as `.claude/CLAUDE.md` and
`package.json` spell them.)

## References

(Links to the rules, docs and skills this one depends on.)

## Examples

**Use this skill when:**

- <a request that must trigger it>
- <another, differently phrased>

**Do not use this skill when:**

- <a request that must not trigger it, and what handles it instead>
- <the near miss — the edge case that shows where the boundary is>
```
