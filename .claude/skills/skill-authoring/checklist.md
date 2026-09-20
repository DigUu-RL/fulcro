# Skill review checklist

Run this against a skill's diff before it ships. `SKILL.md` in this directory
is the standard and says why each of these holds; this file is the pass.

A box that cannot be ticked is either a change to the skill or an argued
exception written into the skill itself. It is not a box to leave blank.

## Placement

- [ ] It is a procedure, not an invariant — an invariant is a rule in
      `.claude/rules/`, and one that must hold regardless of the prompt is a
      hook in `.claude/hooks/`.
- [ ] It does not duplicate an existing skill, and where it overlaps one, it
      says which owns what.
- [ ] It lives in `.claude/skills/<name>/SKILL.md`, and the directory name
      matches `name`.

## Frontmatter

- [ ] `name` is kebab case and matches the directory.
- [ ] `name` does not shadow a bundled skill by accident; where collision was
      plausible it is project-prefixed.
- [ ] `description` says what it does, then when to use it.
- [ ] `description` names a concrete surface — a directory, a file kind, a
      command, an event — and not a mood.
- [ ] Every frontmatter key exists in Claude Code's documented set.
- [ ] `allowed-tools` is as narrow as the skill's real work, and narrower for
      an audit than for an implementation skill.
- [ ] No shell wildcard granted for convenience.

## Invocation

- [ ] `disable-model-invocation: true` if the effects are irreversible or the
      timing is a human's to pace; and if it is set, the skill says why.
- [ ] `user-invocable: false` if it is reference material nobody types.
- [ ] `context: fork` only for read-only investigation whose findings are all
      the parent needs — never for a workflow that asks the user anything or
      depends on the conversation so far.
- [ ] If it is expensive and read-only, its description is narrow enough that
      it does not fire after every edit.
- [ ] If it is an audit that may be auto-invoked, the trigger names a concrete
      change-surface signal.

## Body

The thirteen, each present or deliberately answered:

- [ ] Purpose.
- [ ] Trigger, including where it does not apply.
- [ ] Invocation policy, stated in the body and matching the frontmatter.
- [ ] Arguments, including the no-argument case.
- [ ] Prerequisites.
- [ ] Read phase — sources named, nothing guessed.
- [ ] Decision phase — criteria a second run could reproduce.
- [ ] Modification phase, or an explicit statement that the skill is read-only.
- [ ] Verification phase — a command, and what its output must show.
- [ ] Stop conditions — at minimum an unrelated failing check, a false
      prerequisite, and anything reserved for a human.
- [ ] Output contract, including the nothing-to-report case.
- [ ] Repository commands, copied from `package.json` or `.claude/CLAUDE.md`.
- [ ] References, as working links.

## Examples

- [ ] At least one invocation that must trigger the skill.
- [ ] At least one that must not.
- [ ] At least one edge case — the near miss that shows where the boundary is.

## Language

- [ ] English throughout, frontmatter included.
- [ ] No instruction written twice in two languages.
- [ ] No command, identifier, path, API name or literal translated.

## Engineering

- [ ] `SKILL.md` is under about 500 lines; anything longer moved to a
      supporting file and linked from the branch that needs it.
- [ ] Every supporting file, script and skill it names exists.
- [ ] Dynamic context injection, if any, is deterministic, cheap and relevant.
- [ ] Read-only where it can be.
- [ ] No step claims a tool result the skill has not observed.
- [ ] No invented path or command.

## Anti-patterns

- [ ] No role-play without operational criteria.
- [ ] No unconditional "fix everything" branch.
- [ ] No step that edits a test to make it pass.
- [ ] No silencing (`eslint-disable`, `@ts-ignore`, `@ts-expect-error`, `skip`)
      without explicit approval and a reason written at the site.
- [ ] No step that pushes, publishes, merges, or discards uncommitted work.
      `.claude/rules/protected-operations.md` holds regardless; a skill that
      names one of those is written against a wall it will hit.

## Repository hygiene

- [ ] `npm run format:check` passes.
- [ ] `npx --yes markdownlint-cli2` passes.
- [ ] The skill was invoked once, on one of its own positive examples, and
      produced what its output contract describes.
