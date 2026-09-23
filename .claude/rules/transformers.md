---
paths:
  - packages/*/src/transformer/**/*.ts
  - packages/*/src/unplugin/**/*.mts
  - packages/transform-core/src/**/*.ts
  - tests/transformers/**/*.ts
  - tests/transformers/**/*.mts
---

# The transformer and the runtime are one feature

**Scope:** the `transformer/` and `unplugin/` directories of every package,
`@fulcro/transform-core`, and `tests/transformers`

`@fulcro/collections` and `@fulcro/reflect` each ship a compile-time
transformer behind its own entry point, and neither knows the other exists.
What they share is the machinery in `@fulcro/transform-core` and a failure
mode: a transformer that stops recognising a call does not throw, it declines,
and the runtime fallback answers instead. The build stays green and the answer
is worse.

## They change together, in one commit

A runtime signature that gains a parameter, a call shape that gains an
overload, an entry point that moves: each is a change to what the transformer
has to recognise. Changing one half and leaving the other for later ships a
version where the two disagree, and the disagreement reads as a wrong result at
runtime rather than as a build error.

`.claude/CLAUDE.md` makes the test side of this non-negotiable: a change under
a `transformer/` or `unplugin/` directory carries fixtures or tests alongside
it.

## Use the machinery that is already there

Call resolution, module identity, diagnostic emission and the plugin plumbing
live in `@fulcro/transform-core`. A second implementation of any of them in a
package's own transformer is a second thing to fix when the compiler API moves,
and the two drift in exactly the cases nobody tested.

If the shared machinery does not do what a package needs, extend it there. That
is what it is for, and the other transformer gets the fix as well.

## Claim only your own calls

A transformer claims a call when it can trace the imported symbol back to its
own package. Matching on the name alone claims a consumer's unrelated
`nameOf`, and rewrites code the package has no business touching.

Path segments are built with `path.join`, so the matcher sees backslashes on
Windows and forward slashes elsewhere. Never compare against a hard-coded
`/`-joined string, and never assume a source-relative import: a consumer
resolves the package through `node_modules`, a workspace link or a path alias,
and all three have to arrive at the same answer. CI runs both platforms for
this reason.

## Fail loudly where a fallback would be wrong

Some syntax cannot be traced at compile time. Where a runtime fallback gives
the same answer more slowly, decline quietly and let it. Where no fallback can
give the right answer — a type that only exists at compile time, an inference
the runtime cannot reconstruct — emit a diagnostic that names the file, the
call and what to write instead. Silence there ships a wrong value.

## Test the boundary a consumer crosses

A fixture compiled from a source file next door proves the easy half. What
breaks in the field is the package boundary: the import specifier, the entry
point, the resolution. `tests/transformers` runs the two plugins over one tree
for that reason, and `tests/entrypoints.spec.mts` checks the built surface with
no transformer applied at all.
