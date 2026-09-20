# Rules

Detailed, path-scoped invariants. `.claude/CLAUDE.md` holds the short project
contract and points here; anything longer than a few lines, or that applies to
one area rather than the whole repository, belongs in a file here.

A rule file states an invariant and why it holds. It is not a workflow — a
sequence of steps to follow on request is a skill, under `.claude/skills/`.

## Current rules

| File                | Scope             | Invariant                                          |
| ------------------- | ----------------- | -------------------------------------------------- |
| `build-output.md`   | `packages/*`      | Built output lives in `dist/`, never beside source |

The architecture rules for the library proper arrive with F11; see
`.roadmap/features/F11-architecture-rules.md`.
