# Changesets

Every change that should reach a release is described by a changeset: a small
Markdown file in this folder saying which packages moved and how far.

```sh
npx changeset          # describe a change
npx changeset version  # apply every pending changeset to the manifests
```

`version` consumes the files here, bumps the manifests, writes the changelogs
and leaves the result staged as an ordinary commit for review.

## The transformer-bound packages version as one

`config.json` puts `@fulcro/collections`, `@fulcro/reflect` and
`@fulcro/transform-core` in a single `fixed` group, so they always carry the
same version and are always released together — a package with no changes of
its own is bumped alongside the rest. Every other package versions on its own.

That is deliberate, and the reason is a coupling the compiler cannot check. A
transformer recognises a call by the folder its declaration sits in inside the
published output of the library it serves. Reorganising those folders is not a
breaking change to anything that library exports, so nothing would force its
major version up — yet it silently stops the transformer from rewriting, and the
runtime fallbacks quietly take over. A consumer would see `defaultOf` start
throwing, with two packages that both claim to be compatible.

Versioning them as one makes that combination impossible to install. The
transformer suites catch the breakage here; nothing would catch it on a machine
that had mixed two independently versioned releases.

A package joins the group when a transformer starts recognising its calls, and
not before. `@fulcro/functions`, `@fulcro/parallel`, `@fulcro/types` and
`@fulcro/errors` are read by no transformer, so a major of one of them moves
that package alone.

Splitting the group later is possible, but it needs the transformer to stop
depending on a layout — matching an exported marker instead of a path segment,
for instance — rather than just a change of configuration.
