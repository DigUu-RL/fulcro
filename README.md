# fulcro

[![CI](https://github.com/DigUu-RL/fulcro/actions/workflows/ci.yml/badge.svg)](https://github.com/DigUu-RL/fulcro/actions/workflows/ci.yml)

Development root for the `@fulcro` packages. Private — nothing is published from
here; the packages under `packages/` are.

| Package                                       | What it is                                                         | Runtime deps                  |
| --------------------------------------------- | ------------------------------------------------------------------ | ----------------------------- |
| [`@fulcro/collections`](packages/collections) | Lazily evaluated sequences with a composable query operator set    | none                          |
| [`@fulcro/reflect`](packages/reflect)         | `nameOf`, `typeOf`, `defaultOf`                                    | none                          |
| [`@fulcro/transformer`](packages/transformer) | Compile-time resolution of those three, for `tsc` and for bundlers | `unplugin`, peer `typescript` |

`@fulcro/collections` stands alone. `@fulcro/reflect` works on its own and gets
sharper with `@fulcro/transformer`; only `defaultOf` strictly requires it.

## Working on it

```sh
npm install     # links the workspaces
npm run build   # every package
npm test        # builds first, then runs all three suites
npm run typecheck
npm run format
npx eslint .
```

`npm test` builds before running, and has to: the test harness loads the
transformer from `@fulcro/transformer`'s built output, the transformer fixture
resolves `@fulcro/reflect` through `node_modules` the way a consumer would, and
the entry point suite runs entirely against the built packages.

There are four suites — one per package, plus `tests/entrypoints.spec.mts` at
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

## Emitted output never belongs beside a source

A build misconfigured on its `rootDir` drops `.js` and `.d.ts` files right next
to the `.ts` they came from. The test runner then resolves the stale copy in
preference to the source, and the failure reads as a broken import rather than
as stale output. `.gitignore` blocks those paths; if imports start failing for
no reason, look for emitted files under `packages/*/src/` first.
