# A release is what the built output says it is

**Scope:** every change that reaches `main`

Publishing is the one step this repository cannot take back. A version on npm
stays there, and a consumer installing it gets whatever was in `dist` at the
moment the workflow ran — not what was in `src`, and not what the tests
imported.

## Versions come from changesets

Every shippable change records its bump with `npm run changeset`, and nothing
edits a `version` field by hand. Changesets is what turns the accumulated
intents into the version numbers, the changelog and the publish, in that order
and in one place.

A pull request touching `packages/*/src/**` without a changeset fails the
release-readiness workflow, which is the point: it would otherwise merge green
and never reach npm. `git.md` says which bump a change is claiming.

## Claude does not publish

Not `npm publish`, not `changeset publish`, not `npm run release`, and not the
push to `main` that starts any of them. The hooks refuse these before they run
and `protected-operations.md` says how a human performs them. A refusal here is
the guard working, not an obstacle to route around.

## What is checked before it goes

The release is the built artifacts, so they are what gets inspected:

- `npm run build` from a clean tree, and the built output matches the sources
  that were reviewed;
- every path in each package's `exports` map resolves to a file that exists,
  in `dist` and not beside the source — `build-output.md` on why that is the
  failure to look for;
- the entry point suites in `tests/`, which import the built packages without
  the transformers and so see what a consumer sees;
- the declaration files: a `.d.ts` that fails to resolve is a consumer whose
  editor shows `any`, and no runtime test notices.

## The whole matrix counts

The transformers match path segments, so Windows and POSIX disagree about them
by construction, and a green run on one platform says nothing about the other.
A release goes out when the full matrix is green — not when the fast job is.
