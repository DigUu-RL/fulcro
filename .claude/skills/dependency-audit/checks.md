# The eleven checks

The index is in `SKILL.md`. This file is each check: what it reads, what counts
as a finding, and the cases this repository has already argued through so they
are not reported again.

Two things hold across all eleven.

**A published package's `dependencies` are the consumer's install.** Nothing in
`devDependencies` reaches them; everything in `dependencies` does, transitively,
whether they asked for it or not. Which list an edge is in decides its severity
more than its version range does.

**The declaration and the resolution are different sources.** A manifest says
what was asked for; `npm ls` says what is there. A finding names which one it
came from, because a range that admits a bad version and a tree that installed
one are different problems with different fixes.

## 1. Direct dependencies

**Reads.** `git diff -- package.json packages/*/package.json`, then
`npm ls --depth=0` and `npm explain <name>` for anything the diff touched.

A finding when:

- a package gained a runtime `dependencies` edge — every consumer now installs
  it, and the question the report has to answer is what it replaced;
- something is imported but not declared. It resolves today from the workspace
  root or from a transitive install and breaks the first time the tree changes.
  `eslint` is exactly this shape here: `eslint.config.mjs` is in the tree and
  `npx eslint .` is in the contract's command table, while the root declares
  `eslint-config-prettier`, `eslint-plugin-simple-import-sort` and
  `typescript-eslint` and never `eslint` itself — `npm explain eslint` shows it
  arriving as their peer. Report it at `MEDIUM` and say which declaration is
  missing, not which version to add;
- a declared edge is imported nowhere. Dead weight in `devDependencies`, a
  published install in `dependencies`;
- a range loosened to `*`, `latest` or a git URL. A published package cannot
  reproduce an install it does not bound.

**Not a finding.** A devDependency bump inside its declared range with the
suites green. A `typescript7` style alias declared deliberately to hold a second
compiler line for testing — the root does this on purpose and the reason is the
peer range in check 10.

## 2. Peer dependencies

**Reads.** The `peerDependencies` and `peerDependenciesMeta` of all five
manifests, and `npm explain <name>` for the peer in question.

Three packages declare `typescript` as `>=5.3.3 <7`, optional through
`peerDependenciesMeta`: `@fulcro/collections`, `@fulcro/reflect` and
`@fulcro/transform-core`. Optional because the runtime fallback works without a
compiler — `tests/entrypoints.spec.mts` is what proves that — and only the
transformer entry points need one.

A finding when:

- **a peer range narrows.** Every consumer resolving outside the new range
  breaks on install. This is a major, and `.claude/rules/api-design.md` owns it
  before a version number does: the range is public surface;
- **a peer range widens** without evidence that the new edge compiles. Widening
  is additive only in appearance; it is a promise to support a compiler nobody
  ran;
- **the three ranges disagree.** A consumer installing `@fulcro/collections`
  gets `@fulcro/transform-core` too, and two different `typescript` demands in
  one tree resolve to a warning the consumer has to adjudicate;
- **an optional peer is relied on unconditionally.** `optional: true` means the
  code path that needs it has to survive its absence.

## 3. Workspace relationships

**Reads.** The `dependencies` of each manifest, the `workspaces` field of the
root, and `npm ls --depth=1`.

`@fulcro/collections` and `@fulcro/reflect` each depend on
`@fulcro/transform-core` at `^0.9.0`. `@fulcro/functions` and `@fulcro/parallel`
depend on nothing.

A finding when:

- **the range cannot admit the version that will publish.** `^0.9.0` does not
  admit `0.10.0` under semver's zero-major rule. A `transform-core` minor
  therefore has to move the dependents' ranges in the same change, and
  Changesets is what does it — `npm run changeset`, never an edited `version`
  field. `.claude/rules/release.md`;
- **a new edge appears between two packages.** `@fulcro/collections` depending
  on `@fulcro/reflect` would be a `BLOCKER`: the contract says neither
  transformer knows the other exists, and each claims only the calls it can
  trace back to its own package;
- **a cycle appears**, in any direction;
- **a workspace package is reached by a path other than its name** — a relative
  import across `packages/`, a deep path into another package's `src`. What one
  module needs from another travels by an internal path _within_ a package;
  across packages it travels through the barrel.

## 4. Duplicate versions

**Reads.** `npm ls <name> --all` for each dependency the change touched, and
`npm explain <name>` for each copy.

A duplicate is two resolutions of one name in the tree. `npm ls typescript
--all` is the one to run first, because it is the case that matters here.

A finding when:

- **`typescript` resolves twice.** The transformers hold a `ts.Program` and pass
  nodes across the compiler API. Two copies are two module identities, and the
  failure reads as a node that is the wrong kind rather than as a duplicate
  install. `BLOCKER` when both copies are reachable from a transformer entry
  point;
- **a runtime dependency of a published package resolves twice.** The consumer
  installs both. `unplugin` is the only non-workspace runtime dependency in the
  whole tree, which makes it the only one this can happen to;
- **a devDependency resolves twice with state in it.** Two `vitest` copies, two
  registries.

**Not a finding.** A duplicate confined to `devDependencies` with no shared
state — the resolver deduplicating imperfectly costs disk and nothing else.

## 5. Engine compatibility

**Reads.** The `engines` of all six manifests, the matrix in
`.github/workflows/ci.yml`, `npm view <name> engines`, and `node --version`.

Every manifest declares `node >=22`. CI runs 22 and 24, on `ubuntu-latest` and
`windows-latest`.

A finding when:

- **a dependency requires a Node above the floor.** The floor moves for every
  consumer, which is a major, and the report says so rather than editing
  `engines`;
- **a manifest's floor moved** without the matrix moving with it, or the matrix
  gained a line the floor does not admit;
- **the lowest matrix entry is no longer a supported release line.** The comment
  in `ci.yml` is where that was last decided, and it is quoted rather than
  re-reasoned.

## 6. Licence changes

**Reads.** `npm view <name>@<version> license`, the `license` field of the six
manifests, and `LICENSE`.

Everything here is ISC, and a transitive licence ships with the install even
though no file in this repository names it.

A finding when:

- **a runtime dependency's licence changed**, at any version. `HIGH` when the
  new licence is copyleft or bespoke, because the consumer inherits the
  obligation and nothing in their install tells them;
- **a licence is missing or `UNLICENSED`** on anything reachable at runtime;
- **a devDependency's licence became one that restricts commercial use.** Lower,
  but it binds whoever builds the repository.

State the licence as the registry reports it, with the version it was read at. A
licence recalled rather than read is not evidence.

## 7. Known security advisories

**Reads.** `npm audit --json`, and `npm explain <name>` for each advisory's
path.

The registry answer changes without the repository changing, so an advisory is
reported with the date it was read and nothing else is inferred from it.

A finding when an advisory's path reaches a published package's runtime
dependencies. Severity follows the reach, not the registry's own label:

| Reach                                             | Severity     |
| ------------------------------------------------- | ------------ |
| Runtime dependency of a published package         | `BLOCKER`    |
| Optional peer, used only by a transformer         | `HIGH`       |
| `devDependencies`, reachable during build or test | `MEDIUM`     |
| `devDependencies`, reachable only in tooling      | `LOW`/`NOTE` |

Two prohibitions, both from `.roadmap/features/F17-dependency-audit.md`:

- **Never bump a dependency to quiet a warning.** This skill writes nothing, so
  the failure shape is subtler: reporting a bump as the fix when the advisory's
  path does not reach anything this repository runs. Report the path first.
- **Never claim a vulnerability is fixed without current evidence.** A fix is
  claimed only from an `npm audit` run in this session, quoted. An advisory
  believed fixed by a bump nobody re-audited goes under Risks as unverified.

When the registry is unreachable, the whole check is reported as not run, with
the error. An audit that says nothing was found because nothing was asked is the
one output this skill may not produce.

## 8. Bundle and runtime implications

**Reads.** The `exports`, `main`, `types`, `files`, `type` and `sideEffects`
fields of the manifests, and `npm pack --dry-run --workspace <package>`.

A finding when:

- **a runtime edge was added to a published package.** Say what the tarball now
  pulls in and why it could not be a devDependency or an optional peer;
- **`sideEffects` was added to `@fulcro/collections`.** It is deliberately
  omitted, and the `//sideEffects` field in its manifest says why: the barrels
  run `bootstrapCollections()` on load to plug the concrete classes into the
  factory registry, so a bundler treating the package as side effect free drops
  the call and breaks `groupBy`, `orderBy` and `orderByDescending`. `BLOCKER`,
  and the field is quoted rather than paraphrased;
- **a dependency is CommonJS-only where the consumer is not.**
  `@fulcro/parallel` is `"type": "module"`; the others are not, and a dependency
  that resolves differently between them is a finding against the entry point it
  reaches;
- **`files` stopped covering an `exports` target.** That is
  `.claude/skills/api-audit/SKILL.md`'s territory in detail; here it is reported
  as a consequence of the dependency change and handed over.

**Not a finding.** The absence of `sideEffects` on `@fulcro/collections`, ever.
It is the documented decision above.

## 9. Node support implications

**Reads.** The imports of `node:` builtins under `packages/*/src`, the `engines`
floor, and `npm view <name> engines`.

`@fulcro/parallel` is the package this bites: it runs on Node and in the
browser, selects between them through the `browser` condition of its `exports`
map, and reaches a Node builtin on one side of that fork only.

A finding when:

- a dependency reaches a `node:` builtin on a path the browser condition can
  resolve to;
- a dependency needs a Node API newer than the floor — a finding against
  `engines`, not against the dependency;
- a change makes a builtin reachable from the browser entry point, which the
  suites catch only if one of them imports that entry point. Say which suite
  would have to.

## 10. TypeScript compatibility

**Reads.** The peer ranges of check 2, the root `devDependencies`, and
`npm ls typescript --all`.

The root holds two compiler lines on purpose: `typescript` at `^5.3.3`,
resolving to 5.9.3, and `typescript7`, an alias for `typescript@^7.0.2`. The
peer range is `>=5.3.3 <7`, so the second line is held for testing and is not
yet promised to anyone.

A finding when:

- **the compiler the repository builds with moves outside the peer range.**
  Either the range is wrong or the build is testing something the package does
  not support. Both are findings; which one is the fix is the proposal's
  business;
- **a compiler bump changes the emitted declarations.** `npm run build` then
  `npm run typecheck`, and the `.d.ts` files under `dist` are what the consumer
  reads. A declaration that widened to `any` or `unknown` is
  `.claude/rules/api-design.md`'s breaking change with every name intact, and
  `/api-audit` is what reads it properly;
- **the alias moved** — a new `typescript7` resolution is a new compiler API,
  and check 11 is what that obliges.

## 11. Transformer compiler API compatibility

**Reads.** `packages/transform-core/src` where it touches the compiler API,
`packages/*/src/transformer/**`, `packages/*/src/unplugin/**`, and `unplugin`'s
declared range.

`@fulcro/transform-core` is the shared machinery behind both transformers. It
depends on `unplugin` at `^3.3.0` — the one non-workspace runtime dependency in
the tree — and on `typescript` as an optional peer.

A finding when:

- **the compiler API surface the transformers use changed between the old and
  new compiler.** Name the API, the version it changed in, and the file that
  calls it. A compiler major is a `BLOCKER` until the transformer fixtures run
  against it;
- **`unplugin` moved a major.** Its plugin shape is what both `./unplugin`
  entry points expose, and that shape is public surface;
- **a transformer change arrived without fixtures.** The contract requires
  fixtures or tests alongside any change under `transformer/` or `unplugin/`,
  and `.claude/rules/transformers.md` is why. A dependency bump that changes
  what the transformer emits is such a change;
- **only one path separator was exercised.** The transformers recognise a call
  by matching path segments built with `path.join`, so they see backslashes on
  Windows and forward slashes elsewhere. A compiler or `unplugin` bump validated
  on one platform is `PARTIAL`, and the report says which platform ran.

Anything here that needs the emitted output compared rather than the manifests
read is handed to `.claude/skills/transformer-audit/SKILL.md`, which is built for
it. This check's job is to notice that the bump obliges that audit, and to say
so.
