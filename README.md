# fulcro

[![CI](https://github.com/DigUu-RL/fulcro/actions/workflows/ci.yml/badge.svg)](https://github.com/DigUu-RL/fulcro/actions/workflows/ci.yml)

Development root for the `@fulcro` packages. Private — nothing is published from
here; the packages under `packages/` are.

| Package                                       | What it is                                                                         | Runtime deps                  |
| --------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------- |
| [`@fulcro/collections`](packages/collections) | Lazily evaluated sequences with a composable query operator set                    | none                          |
| [`@fulcro/reflect`](packages/reflect)         | `nameOf`, `typeOf`, `defaultOf`                                                    | none                          |
| [`@fulcro/functions`](packages/functions)     | `switchFor` and `tryCatch` — control flow as values                                | none                          |
| [`@fulcro/transformer`](packages/transformer) | Compile-time resolution of the `@fulcro/reflect` utilities, for `tsc` and bundlers | `unplugin`, peer `typescript` |

`@fulcro/collections` and `@fulcro/functions` stand alone. `@fulcro/reflect` works
on its own and gets sharper with `@fulcro/transformer`; only `defaultOf` strictly
requires it.

## Working on it

```sh
npm install     # links the workspaces
npm run build   # every package
npm test        # builds first, then runs every suite
npm run typecheck
npm run format
npx eslint .
```

`npm test` builds before running, and has to: the test harness loads the
transformer from `@fulcro/transformer`'s built output, the transformer fixture
resolves `@fulcro/reflect` through `node_modules` the way a consumer would, and
the entry point suite runs entirely against the built packages.

There are five suites — one per package, plus `tests/entrypoints.spec.mts` at
the root. That last one exists because every other suite reaches into a package
through its internal `@/*` alias: a wrong `main`, a typo in `exports` or a
`files` list that forgets a folder would leave all of them green and break the
first consumer to install. So it resolves the packages by name instead, checks
that everything the manifests point at is actually shipped, and asserts that the
internals — the factory registry, the two classes with private constructors,
`resolveCallableId` — stay out of the public surface.

## Layout

Each package owns a `src/` with an `@/*` alias onto it, a `tsconfig.json` used
for typechecking, and a `tsconfig.build.json` that excludes the tests. Nothing
is shared between packages except the compiler options in `tsconfig.base.json`.

Two structural decisions are worth knowing before changing anything.

**Testing is owned by the root, not by each package.** The `@fulcro/reflect`
suites only mean something with the transformer applied — `defaultOf` throws
without it — but making the package depend on `@fulcro/transformer` to test
itself would tie the two together in both directions, since the transformer
already depends on `@fulcro/reflect` for its compile fixture. Wiring the plugin
once in `vitest.config.mts`, as one project per package, keeps that edge
single and lets each published package declare only what its consumers need.

**The transformer fixture imports `@fulcro/reflect` by name.** It resolves into
that package's built declarations rather than into a sibling source file, so the
suite exercises call recognition across a real package boundary. The rewriters
identify a call by the module that declares it, and a same-tree relative import
would never have covered the case that actually ships.

## Releasing

Changes that should reach a release are described with
[changesets](https://github.com/changesets/changesets):

```sh
npx changeset              # describe what changed and how far it moves
npm run version-packages   # apply the pending changesets to the manifests
git commit -am "Release"   # review the diff first
```

Then run the **Release** workflow from the Actions tab. It is manual on purpose:
publishing is irreversible — a name is taken for good and a version can never be
reused — so it is never something a merge does on its own. The workflow builds,
runs the whole suite, and only then publishes.

**The four packages share one version**, as a `fixed` group in
`.changeset/config.json`. A package with no changes of its own is bumped along
with the rest, and that is deliberate: `@fulcro/transformer` recognises a call
by the folder its declaration sits in inside the published output of
`@fulcro/reflect`. Reorganising those folders breaks nothing `reflect` exports,
so nothing would push its major version up — yet the transformer silently stops
rewriting and the runtime fallbacks take over. Versioning them as one makes that
combination impossible to install. `.changeset/README.md` has the longer
version, including what would have to change before the group could be split.

### Authentication

There is no npm token anywhere, and there should not be one. The release
workflow authenticates through **trusted publishing**: GitHub mints a short
lived OIDC token, npm verifies it came from this repository and this workflow
file, and grants publish rights for that run alone. Nothing to store, rotate, or
leak.

It is configured once per package on npmjs.com — repository `DigUu-RL/fulcro`,
workflow `release.yml`. npm does not validate that configuration when it is
saved, so a mistake in it only surfaces on the run that uses it.

#### The first publish cannot use it

A trusted publisher is configured on a package's own settings page, and a
package only exists once something has been published to it. npm has no way to
declare one in advance — unlike PyPI, where this is allowed — so the first
version of each package has to be published another way, and the workflow can
only take over afterwards.

Done from a machine rather than from CI, so that no token is created, stored as
a secret, or has to be remembered and revoked later:

```sh
npm login                 # interactive, through the browser
npm run release           # builds, runs nothing else, publishes all four
git push --follow-tags    # the tags `changeset publish` just created
```

With two-factor authentication on the account, npm asks for the one-time code
during the publish; `npx changeset publish --otp=123456` passes it directly if
the prompt gets in the way.

Then configure the trusted publisher on each of the four packages, and every
release after this one goes through the workflow with nothing to authenticate by
hand.

## Emitted output never belongs beside a source

A build misconfigured on its `rootDir` drops `.js` and `.d.ts` files right next
to the `.ts` they came from. The test runner then resolves the stale copy in
preference to the source, and the failure reads as a broken import rather than
as stale output. `.gitignore` blocks those paths; if imports start failing for
no reason, look for emitted files under `packages/*/src/` first.
