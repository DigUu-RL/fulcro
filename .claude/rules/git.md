# Branches, commits and the changeset that follows them

**Scope:** every Claude Code session in this repository

`.claude/CLAUDE.md` states the branch model in a line: `dev` is the working
branch, `main` is the release branch, and work reaches `main` only through a
pull request. This file is what that means while a session is actually
committing.

## Where work happens

Never commit to `main`. A session that finds itself on `main` branches first,
from `dev`, and says so.

One branch is one change. A branch carrying two unrelated fixes cannot be
reverted, cannot be reviewed in one pass, and cannot be released without
shipping both.

## What a commit says

The subject is one line in the imperative, under about seventy characters, with
no trailing period and no type prefix: `Take one defect to its cause before
anything is edited`, not `fix(diagnose): cause first`. The log of this
repository reads as a sequence of decisions, and a prefix taxonomy adds a
column that nothing downstream consumes.

The body says why the change was needed and what a reader would otherwise have
to reconstruct. It does not narrate the session, list the files touched, or
restate the diff.

A commit is a state the tree can be checked out at. Formatting, generated
output and unrelated tidying are their own commits, so the one commit that
changes behaviour stays readable.

## What a commit must not carry

Secrets, tokens, `.env` files and anything under `.roadmap/`, which
`.gitignore` keeps local on purpose. Built output belongs in `dist/` and is
ignored — if a `.js` or `.d.ts` turns up under `packages/*/src/`, read
`build-output.md` before staging anything.

Never stage with `git add -A` from the root. Name the paths; that is the step
where the unrelated file is noticed.

## A shippable change carries a changeset

A pull request that touches `packages/*/src/**` needs a changeset, recorded
with `npm run changeset`, or the release-readiness workflow fails it. The
version bump is the claim being made to consumers: patch for a fix, minor for
an addition, major for a break — and a break is `api-design.md`'s territory
before it is a version number's.

Changes that ship nothing — tests, `.claude/`, tooling, documentation — need no
changeset, and adding one publishes a version with an empty diff.

## Pushing, merging and publishing are not the agent's

Claude commits and says the branch is ready; a human pushes, merges and lets
the release workflow publish. The hooks refuse the commands rather than trust
the model to remember, and `protected-operations.md` says how a human performs
each one.
