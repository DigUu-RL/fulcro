# Surfaces and the audits they owe

`SKILL.md` §2 classifies the merge diff with this file. Each changed path is
matched against every row of the path table, and then every signal of the
signal table is checked against the diff text. A path or a signal that matches
more than one row owes every audit those rows name; the audit set is the union,
never the best single match.

`/verify` and `/fulcro-review` are owed by every merge and are not repeated in
the tables.

## By path

Paths are relative to the repository root, and `src` means
`packages/<name>/src`. "Non-spec" excludes `*.spec.ts`, `*.spec.mts` and
everything under `src/tests/`.

| #   | Changed path                                                            | Surface        | Owes                                                                     |
| --- | ----------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------ |
| P1  | `src/**/*.ts`, non-spec                                                 | runtime        | `/test-gap <path>`, `/docs-sync <package>`                               |
| P2  | `src/**/*.spec.ts`, `src/tests/**`                                      | tests          | `/test-gap <path>`                                                       |
| P3  | `src/**/*.performance.spec.ts`                                          | performance    | `/perf-regression <path>`                                                |
| P4  | `src/index.ts`, any barrel `index.ts`, `src/@types/**`                  | public surface | `/api-audit <package>`                                                   |
| P5  | `packages/*/package.json`: `exports`, `files`, `types`, `main`          | public surface | `/api-audit <package>`                                                   |
| P6  | `packages/*/package.json`: any `*dependencies` field                    | dependencies   | `/dependency-audit <package>`                                            |
| P7  | root `package.json` dependency fields, `package-lock.json`              | dependencies   | `/dependency-audit`                                                      |
| P8  | `src/transformer/**`, `src/unplugin/**`                                 | transformer    | `/transformer-audit <collections or reflect>`, `transformer-reviewer`    |
| P9  | `packages/transform-core/src/**`                                        | transformer    | `/transformer-audit` (both), `transformer-reviewer`                      |
| P10 | `tests/transformers/**`                                                 | transformer    | `/transformer-audit`                                                     |
| P11 | `packages/collections/src/**`, non-spec                                 | performance    | `/perf-regression <path>`                                                |
| P12 | `packages/parallel/src/**`, non-spec                                    | concurrency    | `/concurrency-audit <path>`, `/perf-regression <path>`                   |
| P13 | `packages/collections/src/**/async/**`, `async.ts`, `**/concurrency/**` | concurrency    | `/concurrency-audit <path>`                                              |
| P14 | `docs/**`, `packages/*/README*`                                         | documentation  | `/docs-sync <page>`                                                      |
| P15 | `.changeset/**`                                                         | release        | `/docs-sync` (it reads the changesets against the diff)                  |
| P16 | a `packages/<name>/` directory absent at the base                       | new package    | everything in this table for that package, `architecture-reviewer`       |
| P17 | `tsconfig*.json`, `vitest.config.mts`, `eslint.config.*`                | configuration  | nothing beyond `/verify`, which escalates to its full pass               |
| P18 | `.claude/**`, `tools/claude/**`, `tests/claude/**`, `tests/hooks/**`    | control plane  | nothing beyond `/verify`, which runs `validate:claude` and both projects |
| P19 | `.github/workflows/**`                                                  | CI             | nothing runnable locally; a `NOTE` naming the workflow                   |
| P20 | `tests/*.spec.mts`                                                      | entry points   | `/api-audit` for each package the suite imports                          |

A changed path that matches no row is unclassified. It owes every
conditional audit whose surface it could plausibly touch, and the report
names it under `Classification` — `SKILL.md` §2 is why narrow is never the
default there.

## By signal

Read from `git diff -U0 <base>...HEAD -- packages`. A hunk header is the
`@@ … @@` line, and after the second `@@` git prints the enclosing top-level
line, which for a TypeScript module is the declaration the hunk sits inside.

| #   | Signal in the diff                                                                                                | Owes                                           |
| --- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| S1  | An added or removed line under a non-spec `src` file starting with `export`                                       | `/api-audit <package>`, `/docs-sync <package>` |
| S2  | A hunk header naming an `export` declaration, in a non-spec `src` file                                            | `/api-audit <package>`, `/docs-sync <package>` |
| S3  | S1 or S2 in `packages/reflect/src` or `packages/collections/src`                                                  | `/transformer-audit <that package>`            |
| S4  | An added or removed line with `await`, `Promise`, `AbortSignal` or `setTimeout` in a non-spec `src` file          | `/concurrency-audit <path>`                    |
| S5  | A non-spec `src` file whose module is imported by an existing `*.performance.spec.ts`                             | `/perf-regression <path>`                      |
| S6  | Changes under `src` of two or more packages, or a dependency between `@fulcro/*` packages added, removed or moved | `architecture-reviewer`                        |
| S7  | A new non-spec file under `src` exported from a barrel                                                            | `architecture-reviewer`                        |

S5 is answered with `Grep` over `packages/<name>/src/tests/**/*.performance.spec.ts`
for the changed module's file name. S2 exists because a change to a parameter
on the second line of a signature has no `export` on any line it touches, and
S1 alone would call it internal.

## Why S3 is there

A transformer recognises a call by its function name and a directory segment,
both strings. A runtime signature that moves under `packages/reflect/src` or
`packages/collections/src` can leave the matcher pointing at a shape that no
longer exists, and the build stays green: the call declines to the runtime
fallback. `.claude/rules/transformers.md` calls the two halves one feature,
which is why a runtime-only diff can still owe the transformer audit.
