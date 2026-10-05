# Where a package is registered

Every place in the repository that knows the list of packages, as it stands
today. `SKILL.md` §1 sweeps for these again with `Grep` before planning, because
this file goes stale the day somebody adds a seventh list. A place found by the
sweep and missing from here is added to the plan and to this file.

`<name>` is the directory under `packages/`, `<digit>` the error range chosen in
§2. The sibling to copy from is `packages/functions`, the smallest package with
the standard shape: one entry point, `@fulcro/errors` as its only dependency, no
transformer.

## The package itself

| Path                                  | What goes in it                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/<name>/package.json`        | The sibling's manifest with `name`, `description`, `keywords`, `repository.directory` and `homepage` changed. `version` is `0.0.0`: the changeset moves it. `@fulcro/errors` at the range its siblings declare (`npm ls @fulcro/errors`). `exports` is `"."` and `"./package.json"` and nothing else, `files` is `["dist"]`, `sideEffects` is `false` unless importing the package does something, and then the reason is in the plan. The three `scripts` unchanged. |
| `packages/<name>/tsconfig.json`       | Copied. `rootDir: "./src"`, `outDir: "./dist"`, `paths: { "@/*": ["./src/*"] }` — `.claude/rules/build-output.md`.                                                                                                                                                                                                                                                                                                                                                    |
| `packages/<name>/tsconfig.build.json` | Copied: extends `./tsconfig.json`, excludes `src/tests/**/*`.                                                                                                                                                                                                                                                                                                                                                                                                         |
| `packages/<name>/LICENSE`             | Copied unchanged.                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `packages/<name>/README.md`           | What the package is, enough to decide whether you want it, the install line, and a link to the guide under `docs/` once one exists. `docs/README.md` "What belongs where" is the standard.                                                                                                                                                                                                                                                                            |
| `packages/<name>/src/index.ts`        | The barrel. A doc comment saying what the package owns, then `export {};` so the file is a module, and nothing exported yet — the first export is the first feature's, under `.claude/rules/api-design.md`.                                                                                                                                                                                                                                                           |

## The workspace

| Path                           | What changes                                                                                                                                                                                                                                                                                          |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package-lock.json`            | Written by `npm install`, never by hand. It links the package into `node_modules`, which is how the entry point suite and every sibling resolve it by name.                                                                                                                                           |
| `package.json` (root)          | Usually nothing: `workspaces` is `packages/*`. The `build` script changes only when the new package depends on a sibling other than `errors` and `transform-core` that `npm run build --workspaces` would reach after it — that order is alphabetical by directory, not by dependency. **Sensitive.** |
| `vitest.config.mts`            | `project('<name>')` in the `projects` list, in alphabetical order. A project of its own shape, like `workerPool()`, only with the measured reason written above it.                                                                                                                                   |
| `tests/entrypoints.spec.mts`   | `'@fulcro/<name>'` in `PACKAGE_NAMES`, alphabetical. That alone runs the generic manifest, `exports` and tarball assertions against it. A `describe` of its own arrives with its first export.                                                                                                        |
| `.changeset/<name>-package.md` | `'@fulcro/<name>': minor` and `'@fulcro/errors': minor`, with one paragraph a consumer can read: `Introduce @fulcro/<name>: …`. The errors package moves because its catalog gained a range, which is an addition.                                                                                    |
| `.changeset/config.json`       | Nothing. A package joins the `fixed` group when a transformer starts recognising its calls, and `.changeset/README.md` says why that is never at creation.                                                                                                                                            |

## The error range

The range is permanent from the moment it is merged — `.claude/rules/errors.md`.
All of these move together, in one change, or the lint rule, the catalog and the
pages disagree about who owns the digit.

| Path                                        | What changes                                                                                                                                                      |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/eslint/coded-errors.mjs`             | `'<name>': '<digit>'` in `PACKAGE_RANGES`.                                                                                                                        |
| `tests/eslint/coded-errors.spec.mts`        | The same entry in the expected map of `the ranges`. A row is added; no existing row is touched.                                                                   |
| `packages/errors/src/catalog/<name>.ts`     | `export const <camelName>Catalog = {} as const satisfies RangeCatalog<'<digit>'>;`, with the doc comment its siblings carry. Empty until the first error is born. |
| `packages/errors/src/catalog/index.ts`      | The import and the spread, alphabetical.                                                                                                                          |
| `packages/errors/src/tests/catalog.spec.ts` | The import and the row `['@fulcro/<name>', '<digit>', <camelName>Catalog]`. Added, never altered.                                                                 |
| `docs/errors/FULCRO<digit>xxx.md`           | The range page, with no codes yet, saying which package owns it. Modelled on the shortest sibling page.                                                           |
| `docs/pt-BR/errors/FULCRO<digit>xxx.md`     | Its counterpart, linked both ways.                                                                                                                                |
| `docs/errors.md`, `docs/pt-BR/errors.md`    | The row in the range table.                                                                                                                                       |
| `.claude/rules/errors.md`                   | The range list in "A code belongs to one package, forever".                                                                                                       |
| `.roadmap/**/F50-error-codes.md`            | The range table, **if the file exists** — `.roadmap/` is local to a checkout, so its absence is reported, not a stop.                                             |

## The documentation that lists packages

| Path                                     | What changes                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `README.md` (root)                       | The row in the package table, and the sentence after it if it names which packages stand alone.   |
| `.claude/CLAUDE.md`                      | The row in "What this repository is". A three-line contract change, so it is shown in the plan.   |
| `docs/README.md`, `docs/pt-BR/README.md` | The guide row, once a guide exists — it is the first feature's page, and `/docs-sync` reports it. |

## Only when the plan says so

| Path                                             | When                                                                                                        |
| ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `.claude/rules/<name>.md`                        | The package has an invariant no existing rule states — a platform constraint, a lifecycle, a cost contract. |
| `tools/claude/rule-fixtures/<name>.fixture.json` | With the rule, always: a file it must load for and one it must not.                                         |
| `.claude/rules/README.md`                        | The rule's row in "Current rules".                                                                          |
