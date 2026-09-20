# Template — audit skill

For a skill that looks and reports and changes nothing. An audit's value is
that its findings can be trusted without re-checking them, which costs it two
things: it may not write, and it may not claim what it did not observe.

Copy to `.claude/skills/<name>/SKILL.md` and replace everything; delete the
notes as they are answered.

The standard behind each section is `../SKILL.md`; the review pass is
`../checklist.md`.

---

````markdown
---
name: <kebab-case-name>
description: Audits <what> against <the source of truth> and reports <the finding shape>. Use when <the concrete change surface — a directory that changed, a file kind, a release step>.
allowed-tools: Read, Grep, Glob, Bash(<the exact commands, enumerated>)
---

# <name>

(What this audit answers, and what it costs. If it is expensive, say so here
and keep the description narrow enough that it does not run after every edit.)

**This skill is read-only.** It reports; it does not repair. (If a repair
branch is wanted later, it is a separate skill with `side-effect.md`'s
machinery, not a section added here.)

## When this applies

(The change-surface signal that justifies running it: which directory, which
file kind, which command's output. An audit auto-invoked on a mood is an audit
that gets turned off.)

## Arguments

(A scope to narrow to — a package, a path. And what a bare invocation covers:
usually everything, which is the expensive case.)

## Before starting

(What must be true for the audit to mean anything. Most audits here need built
output, because the entry point suites run against `dist/` — `npm run build`.
If a prerequisite is false, say so and stop; an audit over stale output is
worse than no audit.)

## 1. Read

(Every source, named. The command, its flags, and `2>&1` where the interesting
output goes to stderr. Do not stop at the first command that fails — record the
failure and continue, then say in the report which checks did not run.)

## 2. Decide

(What is a finding and what is not. Severity, and what separates one level from
the next. How duplicates across files collapse into one row with a count.

Name the known-benign cases explicitly — the deliberate exceptions this
repository has already argued through. An audit that re-reports a decision
someone documented is training its reader to skim.)

## Stop

(An audit stops rather than widening: a prerequisite that is false; a source it
cannot read; a finding that turns out to need a change to decide. It never
edits to confirm a hypothesis.)

## Output

(The table, with its columns. The one-line summary. And the clean case: say
what was checked, say nothing was found, end — do not ask what to do next when
there is nothing to do.)

```text
| # | Finding | Where | Why it matters | Severity |
```

(Below the table, a short paragraph per finding that needs a judgement call —
the table has no room for reasoning.)

## Commands

(Copied from `.claude/CLAUDE.md` or `package.json`, spelled as they are there.)

## References

(The rules and docs that define what is being audited against.)

## Examples

**Use this skill when:**

- <a request naming the surface>
- <the event that should trigger it>

**Do not use this skill when:**

- <the request that wants a fix, not a report — name the skill that fixes>
- <the near miss>
````
