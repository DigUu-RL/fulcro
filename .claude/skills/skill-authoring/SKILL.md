---
name: skill-authoring
description: The engineering standard for skills in this repository — what belongs in a skill rather than a rule or a hook, the frontmatter contract, the thirteen sections a skill body must define, the invocation policy, and the review checklist. Use when writing a new skill, changing an existing one, reviewing a skill someone wrote, or deciding whether a request should become a skill at all.
---

# skill-authoring

A skill is software. It is read by a model instead of a compiler, which means
nothing fails loudly when it is wrong: a vague trigger fires on the wrong
request, a missing stop condition turns a read-only audit into an edit, and a
step that names a command nobody ever ran sends the session off inventing one.
None of that produces an error. It produces a plausible transcript.

So a skill is held to what any other file here is held to: it states what it
does, it says how it knows it worked, and it says when to stop. This document
is the standard. `checklist.md` is the same standard as a list to run against a
diff, and `templates/` has three starting points.

## 0. This skill itself

It takes the name of a skill to write or review, or nothing, in which case it
asks which. It has no prerequisites — it reads `.claude/` and writes only the
skill under discussion, so the model may invoke it: a standard that is only
loaded when someone remembers to type it is not a standard.

Writing one produces the skill's files and the result of §10. Reviewing one
produces `checklist.md` worked through against the diff, a line per box that
did not tick, and no edits until the user has seen that list. It stops where
every skill here stops: a check that fails for a reason it did not cause, or a
request that turns out to belong to `.claude/rules/` or `.claude/hooks/`
instead — §1 is where that is decided, and deciding it is a complete answer.

## 1. Is it a skill?

Three mechanisms live under `.claude/`, and they are not interchangeable.

| Mechanism | Shape                        | Holds when                          |
| --------- | ---------------------------- | ----------------------------------- |
| Rule      | An invariant and its reason  | The model reads it and agrees       |
| Skill     | A procedure, on request      | The model invokes it and follows it |
| Hook      | Code, before or after a tool | Always — the model has no say       |

Ask in this order:

- **Must it hold even if the session argues itself out of it?** Then it is a
  hook. `.claude/rules/protected-operations.md` explains why push and publish
  are hooks and not sentences in a prompt.
- **Is it a fact about the repository that applies whether or not anyone asked
  for it?** Then it is a rule, in `.claude/rules/`, or a line in
  `.claude/CLAUDE.md` if it fits in three.
- **Is it a sequence of steps someone performs on request?** Then it is a
  skill.

A rule does not get turned into a skill so it can be invoked, and a procedure
does not get pasted into `CLAUDE.md` so it is always loaded. `CLAUDE.md` is
read on every session; anything there is paid for by every unrelated task.

Do not create a second command system under `.claude/commands/`. New workflows
are skills.

## 2. Frontmatter

```yaml
---
name: kebab-case-name
description: What it does, and when to use it — in that order.
---
```

| Field                      | When to set it                                        |
| -------------------------- | ----------------------------------------------------- |
| `name`                     | Always. Kebab case, matching the directory name       |
| `description`              | Always. What it does, then the trigger                |
| `allowed-tools`            | When the skill needs fewer tools than the session has |
| `disable-model-invocation` | For side effects and for timing — see §4              |
| `user-invocable`           | `false` for reference-only skills nobody types        |
| `context`                  | `fork` for isolated read-only research — see §4       |
| `argument-hint`            | When the skill takes arguments                        |

A field outside this table is checked against Claude Code's own documentation
before it is used. An invented key is silently ignored, which reads exactly
like a key that works.

**`description` is the only part of a skill that is always in context.**
Everything else is loaded after the decision to invoke has already been made,
so the description is where triggering is won or lost. Write what the skill
does, then when to use it, both concretely:

> **Good.** Audits every package's exports map against
> `tests/entrypoints.spec.mts` and reports drift. Use when a package's public
> surface changed, or before a release.
>
> **Bad.** Helps with API quality. — fires on everything and on nothing.

Name a skill for what it does, not for what it is near. Avoid the name of a
bundled skill unless replacing it is the point and the file says so; when a
collision is plausible, prefix it (`fulcro-review`, not `review`).

## 3. The body

Every skill defines these, in whatever headings suit it. They are the
specification, not a template to fill in verbatim — but an absent one is a
missing part of the contract, not a stylistic choice.

1. **Purpose** — one paragraph. What the skill is for and why it exists.
2. **Trigger** — when it applies, and, when the boundary is fuzzy, when it does
   not. The description carries this too; the body is where the edge cases go.
3. **Invocation** — whether the model may invoke it, and if not, why.
4. **Arguments** — what it accepts, what each means, what happens with none.
5. **Prerequisites** — what must be true before step one. A dirty working tree,
   a built `dist/`, a branch that is not `main`.
6. **Read phase** — what to gather, from where, before deciding anything. Name
   the commands and the files. Never guess at a path.
7. **Decision phase** — the criteria. This is the part that makes a skill
   reproducible: what counts as a finding, how findings are ranked, what is out
   of scope. "Use good judgement" is not a criterion.
8. **Modification phase** — for skills that write. What may change, what may
   not, and in what order. Read-only skills say so here and that is the
   section.
9. **Verification phase** — how the skill knows it worked. A command, and the
   output that means success. A change verified by rereading the diff is not
   verified.
10. **Stop conditions** — what makes the skill halt and hand back. At minimum:
    a failing verification the skill did not cause, a prerequisite that turns
    out false, and anything the repository reserves for a human.
11. **Output contract** — what the user gets. The shape of the report, the
    table columns, what is said when there is nothing to report. A skill whose
    output shape drifts run to run cannot be diffed against its last run.
12. **Commands** — the repository commands it uses, copied from
    `.claude/CLAUDE.md` or from `package.json`, not from memory.
13. **References** — the rules, docs, and other skills it depends on, as links.

Then examples: at least one invocation that should trigger the skill and one
that should not. They are the only part of a skill that says where its edge is,
and F04's eval harness reads them.

## 4. Invocation policy

**`disable-model-invocation: true`** when the skill's effects are ones the
repository cannot take back, or when its timing matters rather than its
content: anything that reaches the network, anything that records a release,
anything that runs as part of a sequence a human is pacing. Ordinary edits are
not this — they are in git, and a skill that writes to the working tree on
request is doing what it was asked.

**Expensive read-only skills get a narrow description.** A full build and test
sweep described as "use when checking the project" runs after every edit and is
turned off within a week. Describe the surface that justifies the cost: a
changed exports map, a transformer edit, a release.

**An audit may be auto-invoked only on a concrete change-surface signal** — a
directory, a file kind, a command that ran. Not on a mood.

**`context: fork`** for large read-only investigations whose findings are the
only thing the parent needs: sweeping the tree for a pattern, reading a long
CI log. Not for anything that needs the conversation — a workflow that asks the
user a question, or one whose whole job depends on what was decided ten
messages ago, loses that in a fork and asks again from nothing.

**`user-invocable: false`** for contextual reference material that exists to be
loaded, never typed.

**`allowed-tools`** is narrower for audits than for implementation skills. An
audit that cannot write cannot accidentally write. Never widen shell access for
convenience; name the commands the skill actually runs.

## 5. Language

Skills in this repository are written in **English**, entirely — frontmatter,
prose, examples, criteria, stop conditions, output shapes, references.

- Do not write the same instruction twice in two languages. A bilingual skill
  has two sources of truth and they drift.
- A request may arrive in any language and the skill may answer in that
  language. That is the session's business, not the file's.
- Do not translate commands, identifiers, paths, API names, or code literals to
  satisfy this. `npm run typecheck` is its name.
- Where the same example appears in human documentation that _is_ bilingual
  (`docs/`, see `.claude/CLAUDE.md`), the code must be identical in both — the
  prose is translated, the example is not rewritten.

## 6. Size

Keep `SKILL.md` under about 500 lines. Past that, the model is reading a manual
to answer a question, and the parts that matter are diluted by the parts that
do not.

What moves out, into supporting files beside `SKILL.md`:

- Long tables, catalogues of cases, message-by-message references.
- Worked examples longer than a few lines.
- Anything only one branch of the skill needs — link it from that branch and
  let it be read only when that branch is taken.

Every supporting file a skill names must exist. F04 validates this, and the
failure mode without it is a skill confidently following a step that points at
nothing.

Dynamic context injection — pulling command output into the skill at load —
is for deterministic, relevant snapshots only: a version, a file list, a
status. Not for anything expensive, and not for anything whose value changes
what the skill decides without the user seeing it.

## 7. Honesty

Two rules with no exceptions, because both failures are invisible in a
transcript that otherwise reads well:

- **Never claim a tool result that was not observed.** Not a test that was not
  run, not a file that was not read, not a passing build inferred from a clean
  diff. If something was skipped, the output says it was skipped.
- **Never invent a path or a command.** Read `package.json` before naming a
  script; read the directory before naming a file. A plausible wrong path costs
  more than an admitted gap.

## 8. Anti-patterns

- **"Act as a senior engineer."** A role with no operational criteria produces
  confident prose and no reproducibility. Say what to look at and what counts
  as a finding.
- **"Fix all issues."** Unconditional repair with no triage and no approval
  step. Every skill that changes something sensitive asks first — see
  `fix-warnings` for the shape.
- **Changing a test so it passes.** A skill never adjusts a test to accommodate
  its own edit. A test that fails is a stop condition, and it goes back to the
  user with what broke.
- **Broad shell permissions for convenience.** `Bash(*)` because enumerating
  was tedious is how an audit acquires the ability to push.
- **Silencing instead of diagnosing.** `eslint-disable`, `@ts-ignore`,
  `@ts-expect-error`, `skip` — each needs explicit approval and a comment
  saying why. `.claude/CLAUDE.md` states this for the repository; a skill does
  not get to relax it.
- **A skill per command.** `/run-tests` wraps something that is already one
  line. Skills are for procedures with judgement in them.

## 9. Writing one

1. Answer §1. If it is a rule or a hook, stop and write that instead.
2. Copy the closest template from `templates/`:
   - `skill.md` — the general shape.
   - `audit.md` — read-only, reports findings, changes nothing.
   - `side-effect.md` — writes, commits, or touches anything outside the
     working tree; carries the approval and stop machinery.
3. Write the description first, and the examples second. If the two negative
   examples are hard to write, the trigger is not yet precise enough to ship.
4. Fill in §3's thirteen sections. Delete the template's commentary as you go —
   a shipped skill contains no instructions to its own author.
5. Run the verification in §10.

## 10. Verification

Before a skill is finished:

- [ ] `checklist.md`, every box.
- [ ] Every command the skill names exists in `package.json` or in
      `.claude/CLAUDE.md`'s table, spelled as it is there.
- [ ] Every file and skill the skill references exists.
- [ ] `npm run format:check` and `npx --yes markdownlint-cli2` pass — a skill
      is a file in this repository like any other.
- [ ] The skill was invoked once, on one of its own positive examples, and did
      what the output contract says.

## References

- `.claude/CLAUDE.md` — the project contract and the canonical command table.
- `.claude/rules/README.md` — what belongs in a rule instead.
- `.claude/rules/protected-operations.md` — what belongs in a hook instead, and
  what no skill may do.
- `checklist.md` — this standard as a review pass.
- `templates/` — the three starting points.

## Examples

**Use this skill when:**

- "Write a skill that audits the exports maps."
- "Review `.claude/skills/diagnose/SKILL.md` before I commit it."
- "Should `/verify` be able to run without me asking?"
- "This skill keeps firing on unrelated edits."

**Do not use this skill when:**

- The request is to _run_ an existing skill. Invoke that skill.
- The request is to write library documentation under `docs/`. That is
  bilingual prose for humans and has its own standard.
- The request is to add an invariant that must always hold. That is a rule or a
  hook — §1 is the whole of this skill's involvement.
