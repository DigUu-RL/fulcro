# Changesets

Every change that should reach a release is described by a changeset: a small
Markdown file in this folder saying which packages moved and how far.

```sh
npx changeset          # describe a change
npx changeset version  # apply every pending changeset to the manifests
```

`version` consumes the files here, bumps the manifests, writes the changelogs
and leaves the result staged as an ordinary commit for review.

## The four packages version as one

`config.json` puts every `@fulcro/*` package in a single `fixed` group, so they
always carry the same version and are always released together — a package with
no changes of its own is bumped alongside the rest.

That is deliberate, and the reason is a coupling the compiler cannot check.
`@fulcro/transformer` recognises a call by the folder its declaration sits in
inside the published output of `@fulcro/reflect`. Reorganising those folders is
not a breaking change to anything `reflect` exports, so nothing would force its
major version up — yet it silently stops the transformer from rewriting, and the
runtime fallbacks quietly take over. A consumer would see `defaultOf` start
throwing, with two packages that both claim to be compatible.

Versioning them as one makes that combination impossible to install. The compile
fixture in `@fulcro/transformer` catches the breakage here; nothing would catch
it on a machine that had mixed two independently versioned releases.

Splitting the group later is possible, but it needs the transformer to stop
depending on a layout — matching an exported marker instead of a path segment,
for instance — rather than just a change of configuration.
