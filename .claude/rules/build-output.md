# Build output never sits beside source

**Scope:** `packages/*`

Every package compiles `src/` into `dist/`, via `rootDir: "./src"` and
`outDir: "./dist"` in its `tsconfig.json`. `tsconfig.build.json` extends that
and only excludes the tests.

A build whose `rootDir` is wrong drops `.js` and `.d.ts` files next to the
`.ts` they came from, and the test runner then resolves the stale copy in
preference to the source. The failure reads as a broken import, not as stale
output, which is why the emitted extensions under `packages/*/src/` are
gitignored.

## What follows from it

- Never commit a `.js`, `.mjs`, `.d.ts` or `.d.mts` under `packages/*/src/`.
- If one appears after a build, the `rootDir`/`outDir` pair is the bug. Fix the
  tsconfig; do not delete the file and move on.
- Do not widen the gitignore exception. It exists for one real case:
  `@fulcro/parallel` loads a worker task module from disk at runtime with no
  build step between, so `packages/*/src/**/fixtures/*.{js,mjs}` are source and
  are tracked. A fixture goes in a `fixtures/` directory or it is not a
  fixture — that ignore rule once swallowed exactly such a file, and thirteen
  tests failed on the next clean checkout.
- Nothing is emitted from the repository root. `tsconfig.tests.json` sets
  `noEmit`.
