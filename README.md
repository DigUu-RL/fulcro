<h1 align="center">
  <img src="icon.png" alt="fulcro" width="180" height="180" />
</h1>

<p align="center">
  <a href="https://github.com/DigUu-RL/fulcro/actions/workflows/ci.yml">
    <img
      src="https://github.com/DigUu-RL/fulcro/actions/workflows/ci.yml/badge.svg"
      alt="CI"
    />
  </a>
</p>

Development root for the `@fulcro` packages. Private — nothing is published from
here; the packages under `packages/` are.

| Package                                             | What it is                                                                 | Runtime deps                           |
| --------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| [`@fulcro/collections`](packages/collections)       | Lazily evaluated sequences, and runtime validation derived from your types | `@fulcro/transform-core`               |
| [`@fulcro/reflect`](packages/reflect)               | `nameOf`, `typeOf`, `defaultOf`, with their transformer in the box         | `@fulcro/transform-core`               |
| [`@fulcro/functions`](packages/functions)           | `switchFor` and `tryCatch` — control flow as values                        | none                                   |
| [`@fulcro/transform-core`](packages/transform-core) | Shared machinery behind the transformers. Installed for you, not by you    | `unplugin`, optional peer `typescript` |
| [`@fulcro/parallel`](packages/parallel)             | A worker pool for CPU-bound work, on browser and Node                      | none                                   |

`@fulcro/functions` and `@fulcro/parallel` stand alone. `@fulcro/collections`
and `@fulcro/reflect` each ship **their own compile time transformer**, behind a
separate entry point — so one install gets you everything, and a runtime-only
bundle still pulls in none of the compiler machinery. Neither knows the other
exists; each rewrites only the calls it can trace back to itself.

Wiring a transformer up is optional everywhere except `defaultOf`, which throws
without it because a default it cannot compute would be a lie. `nameOf` and
`typeOf` degrade, and every operator in `@fulcro/collections` works untouched.

**What the plugin buys in `@fulcro/collections` is worth knowing about**, since
it is easy to miss under "sequences": `cast<T>()` becomes a validator for
untrusted data derived from the type you already wrote.

```ts
// `response.json()` hands back `any`. This is the last place it is unchecked.
const orders = SequenceCollection.from(await response.json())
	.cast<Order>()
	.toArray();
```

An interface has no runtime form to point at, so the transformer writes the
check out — every property, nested objects, every element of an array, unions,
`Date` by `instanceof`. Anything it cannot write out completely it refuses
loudly rather than half-checking, because a check that answers yes to the wrong
thing is worse than no check at all.

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

`npm test` builds before running, and has to: the harness loads both
transformers from the built output of the packages that ship them, each compile
fixture resolves its package through `node_modules` the way a consumer would,
and the entry point suite runs entirely against the built packages.

There are five suites — one per package that has tests, plus
`tests/entrypoints.spec.mts` at the root. That last one exists because every
other suite reaches into a package
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
suites only mean something with its transformer applied — `defaultOf` throws
without it — and the plugins are a build time concern. Wiring them once in
`vitest.config.mts`, as one project per package, keeps them out of the manifest
of every package that only needs them while its own tests run. Both plugins are
applied to every project and do not interfere: each claims only the calls whose
declarations it can trace back to its own package.

**Each library owns its own transformer.** `@fulcro/reflect` publishes one at
`@fulcro/reflect/transformer` and `@fulcro/collections` one at
`@fulcro/collections/transformer`; `@fulcro/transform-core` holds only the part
that belongs to neither — following a call to its declaration, walking a file,
keeping a program for the bundlers that have no checker.

That replaced a single `@fulcro/transformer` installed as a peer dependency,
which failed in both available directions: npm installs peers and Yarn does not,
so a project could get the utilities with nothing to resolve them, quietly; and
`reflect@0.3` with `transformer@0.2` was an installable, broken pair. What a
call means and what it compiles to now ship together because they are one
package.

**Each compile fixture imports its package by name.** It resolves into that
package's built declarations rather than into a sibling source file, so the
suite exercises call recognition across a real package boundary. A rewriter
identifies a call by the module that declares it, and a same-tree relative
import would never have covered the case that actually ships.

That matters most in `@fulcro/collections`, where the calls are **methods**:
`ofType` is not imported by anyone, so it is claimed by following the method
symbol back to the `Sequence` declaration.

## Branches

Work happens on **`dev`**. `main` is what has been released, and it is only ever
written to by merging a pull request from `dev`.

```text
dev  ──┬── CI on every push
       │
       ├── Prepare release ── version bump pushed back to dev
       │
       └── pull request ──▶ main ── CI ──▶ Release ──▶ npm
              │
              └── Release readiness: refuses shipped changes with no bump
```

## Releasing

Changes that should reach a release are described with
[changesets](https://github.com/changesets/changesets), on `dev`:

```sh
npx changeset   # describe what changed and how far it moves
```

When it is time to cut a release, run the **Prepare release** workflow from the
Actions tab. It applies the pending changesets to the manifests, refreshes the
lockfile and pushes the result to `dev`, then prints the resulting versions and
a link to open the pull request.

Open that pull request yourself. **This matters:** anything done with
`GITHUB_TOKEN` does not trigger further workflows — GitHub refuses, to stop a
run from setting itself off forever — so a pull request opened by the workflow
would run neither CI nor `Release readiness`. A person opening it is what makes
the checks run.

**Merging it publishes**, once CI has passed on `main`.

`npm run version-packages` still does the same thing locally, for when that is
easier.

Publishing is irreversible — a name is taken for good and a version can never be
reused — so automating it needs a reason to be safe, and there is one:
`changeset publish` only publishes versions that are **not already on the
registry**. A merge carrying no version bump publishes nothing. What decides
whether a release happens is the version in the manifests, reviewed in the pull
request like any other change, and not the act of merging.

The release waits on the **whole CI matrix**, not on its own test run: two Node
lines and two operating systems, because a failure on one of them has been
Windows-only before now. It then builds and runs the suite again itself, so that
reaching the publish step never depends on having read another workflow's status
correctly.

**A pull request that changes shipped code without moving a version is
refused**, by the `Release readiness` check. That combination is the one way the
automatic release fails without failing: everything goes green and npm never
sees the change.

**Four of the five packages share one version**, as a `fixed` group in
`.changeset/config.json`. `@fulcro/parallel` is outside it and versions on its
own: nothing binds it to the others the way the group members are bound. A
package with no changes of its own is bumped along with the rest, and that is
deliberate: a rewriter recognises a call by the folder its declaration sits in
inside the published output of the library it belongs to. Reorganising those
folders breaks nothing that library exports, so nothing would push its major
version up — yet the transformer silently stops rewriting and the runtime
fallbacks take over. Versioning them as one makes that combination impossible to
install. `.changeset/README.md` has the longer version, including what would
have to change before the group could be split.

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
