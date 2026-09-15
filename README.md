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
| [`@fulcro/parallel`](packages/parallel)       | A worker pool for CPU-bound work, on browser and Node                              | none                          |

`@fulcro/collections`, `@fulcro/functions` and `@fulcro/parallel` stand alone. `@fulcro/reflect` works
on its own and gets sharper with `@fulcro/transformer`; only `defaultOf` strictly
requires it.

## Documentation

Full guides live in [`docs/`](./docs) — install commands, worked examples and
the scenarios each feature exists for. [`docs/README.md`](./docs/README.md) is
the index, and opens with a table matching a problem to the tool for it.

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

There are six suites — one per package, plus `tests/entrypoints.spec.mts` at
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

**Four of the five packages share one version**, as a `fixed` group in
`.changeset/config.json`. `@fulcro/parallel` is outside it and versions on its
own: nothing binds it to the others the way the group members are bound. A package with no changes of its own is bumped along
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

**A package with no trusted publisher configured fails like this**, and it is
worth knowing by sight, because it reads like a bug in the repository:

```text
E404: Not Found - PUT https://registry.npmjs.org/@fulcro%2fcollections
The requested resource '@fulcro/collections@0.2.0' could not be found or you
do not have permission to access it.
```

npm returns 404 rather than 401 for a scoped package you cannot write to, so
this is what "no credential" looks like. Not a missing package, and not a build
problem — the run has nothing to authenticate with. The fix is on npmjs.com, not
in this repository: open each package's settings page and add the trusted
publisher. The line above about the configuration only surfacing on the run that
uses it applies to a wrong configuration too — the symptom is identical.

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
npm run release           # builds, runs the suite, publishes what is unpublished
git push --follow-tags    # the tags `changeset publish` just created
```

**Two-factor authentication has to be on first.** npm requires it to publish, and
refuses with a 403 that names the requirement rather than a missing code:

```text
E403: Two-factor authentication or granular access token with bypass 2fa
enabled is required to publish packages.
```

That message appears whether the account has 2FA switched off or simply did not
send a code, so check the account before hunting for a CLI flag — `npm profile
get` reports `two-factor auth` plainly. Switch it on under Account settings,
with an authenticator app.

With it on, npm asks for the one-time code during the publish, and
`npx changeset publish --otp=123456` passes one directly if the prompt gets in
the way. A code lasts about thirty seconds, so if four publishes outrun one
code, publishing a package at a time with a fresh code finishes the job.

Then configure the trusted publisher on each published package, and every
release after this one goes through the workflow with nothing to authenticate by
hand.

## Emitted output never belongs beside a source

A build misconfigured on its `rootDir` drops `.js` and `.d.ts` files right next
to the `.ts` they came from. The test runner then resolves the stale copy in
preference to the source, and the failure reads as a broken import rather than
as stale output. `.gitignore` blocks those paths; if imports start failing for
no reason, look for emitted files under `packages/*/src/` first.
