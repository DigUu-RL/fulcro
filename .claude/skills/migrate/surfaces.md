# Where a name lives

Every surface a public name of this repository appears on, with the search
that finds it. `SKILL.md` §2 runs all of them for the old name, and §7 runs
them again for the residue. `<name>` is the old name; `<package>` is the
directory under `packages/` that declares it.

A surface that is not here and turns up in a search is added to this file in
the same change, so the next migration searches it from the start.

## The searches

| #   | Surface                    | Search                                                                                                                          | Why the compiler misses it                                 |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1   | Declaration and barrel     | `git grep -nw <name> -- packages/<package>/src`                                                                                 | It does not — this is the anchor the rest are checked from |
| 2   | Sibling packages           | `git grep -nw <name> -- 'packages/*/src/*' ':!packages/<package>'`                                                              | It does not, once built — but only after `npm run build`   |
| 3   | Utility directory and file | `git ls-files 'packages/*/src/*<name>*'`                                                                                        | A path is not a symbol                                     |
| 4   | Transformer recognition    | `git grep -nE "'<name>'\|\"<name>\"" -- 'packages/*/src/transformer/*' 'packages/*/src/unplugin/*' packages/transform-core/src` | `functionName` and `utilityModuleSegment(...)` are strings |
| 5   | Transformer fixtures       | `git grep -nw <name> -- tests/transformers`                                                                                     | Samples are compiled by the suite, not by `typecheck`      |
| 6   | Entry point suite          | `git grep -nw <name> -- tests/entrypoints.spec.mts`                                                                             | It lists exports by name to assert the built surface       |
| 7   | Error values and templates | `git grep -nw <name> -- packages/errors/src/catalog`                                                                            | An operation name travels as a value                       |
| 8   | Error pages                | `git grep -nw <name> -- docs/errors docs/pt-BR/errors`                                                                          | Prose                                                      |
| 9   | Library pages              | `git grep -nw <name> -- docs ':!docs/errors' ':!docs/pt-BR/errors'`                                                             | Prose and examples nothing compiles                        |
| 10  | READMEs                    | `git grep -nw <name> -- README.md 'packages/*/README.md'`                                                                       | Prose and examples                                         |
| 11  | `.claude/` and tooling     | `git grep -nw <name> -- .claude tools`                                                                                          | Instructions to a session, and lint rules matching names   |
| 12  | Pending changesets         | `git grep -nw <name> -- .changeset`                                                                                             | A release note about to ship naming the old name           |
| 13  | Changelogs                 | `git grep -nw <name> -- 'packages/*/CHANGELOG.md'`                                                                              | History — found to be `kept`, never edited                 |
| 14  | Roadmap                    | `Grep <name>` under `.roadmap/`                                                                                                 | Gitignored, so `git grep` does not see it                  |

`-w` matches the whole word, so `takeWhile` does not find `takeWhileAsync`.
Run each search a second time without `-w` and read the extra hits: a name
inside a longer one is a sibling to decide about, not a use to migrate.

## What each surface asks of the migration

- **1–3.** The provider step. A directory named for the utility moves with
  `git mv`, and its suites under `src/tests/` are renamed with it — search 3
  lists both.
- **4–5.** A transformer finds its call by following the symbol to a
  declaration under `functions/utils/<name>` (`utilityModuleSegment` in
  `packages/transform-core/src/shared/index.ts`) and comparing the function
  name. Renaming either half without the other is a call the transformer
  silently stops rewriting. While the alias lives, a call through the old name
  must still be rewritten — or the plan says, and a fixture proves, that it
  falls back to the runtime.
- **6.** The new name is added to the list and the old one stays while its
  alias does. Removing the old one from this list is the removal itself.
- **7–8.** Codes never change. A value naming the operation follows the rename;
  a template's wording changes only by the user's decision, in the catalog and
  both pages together.
- **9–10.** Each EN hit has a `pt-BR` twin. The code of an example is
  identical in both; only the prose around it is translated.
- **11.** A skill or rule naming the old name is updated in the same
  migration; a validator fixture asserting it is a `test assertion`.
- **12.** A pending changeset's text is updated only if it has not been
  released; read `git log` for it.
- **13.** Always `kept`.
- **14.** Local to this checkout. The glossary entry is updated when the
  contract proposed one; other roadmap prose is reported, not edited.
