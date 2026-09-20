# Rules

Detailed, path-scoped invariants. `.claude/CLAUDE.md` holds the short project
contract and points here; anything longer than a few lines, or that applies to
one area rather than the whole repository, belongs in a file here.

A rule file states an invariant and why it holds. It is not a workflow — a
sequence of steps to follow on request is a skill, under `.claude/skills/`.

A rule that applies to one area of the tree says so in a `paths` block in its
frontmatter, and is loaded when a session touches a file that matches. A rule
with no `paths` is loaded always, and is therefore short. Every path-scoped
rule carries a fixture under `tools/claude/rule-fixtures/` naming a file it
must load for and a file it must not, because a glob that matches nothing
scopes the rule to nothing and does it in silence.

## Current rules

| File                         | Scope                                | Invariant                                                 |
| ---------------------------- | ------------------------------------ | --------------------------------------------------------- |
| `general.md`                 | every source file                    | Names, errors, comments and when to abstract              |
| `git.md`                     | every session                        | Branch model, commit shape, changesets                    |
| `testing.md`                 | the suites                           | Behaviour and performance, and performance is counted     |
| `api-design.md`              | the public surface                   | Inference is part of it, and a change to it is reviewed   |
| `build-output.md`            | `packages/*`                         | Built output lives in `dist/`, never beside source        |
| `collections-performance.md` | `packages/collections/src`           | Laziness, one traversal, bounded memory, early exit       |
| `transformers.md`            | `transformer/`, `unplugin/`          | Runtime and transformer are one feature                   |
| `concurrency.md`             | `packages/parallel`, async sequences | Cancellation, bounds and release under failure            |
| `release.md`                 | what reaches `main`                  | The built output is what ships, and Claude never sends it |
| `protected-operations.md`    | every session                        | Push, publish, merge and discard are a human's to run     |
