# Fulcro — project contract

Durable facts and invariants for every Claude Code session in this repository.
Procedures do not live here: they live in `.claude/skills/`, and detailed
invariants in `.claude/rules/`.

## What this repository is

A private npm workspace root. Nothing publishes from the root; the packages
under `packages/` do.

| Package                  | What it is                                                      | Runtime deps                           |
| ------------------------ | --------------------------------------------------------------- | -------------------------------------- |
| `@fulcro/collections`    | Lazily evaluated sequences, plus `cast<T>()` runtime validation | `@fulcro/transform-core`               |
| `@fulcro/reflect`        | `nameOf`, `typeOf`, `defaultOf`, `sizeOf`, transformer included | `@fulcro/transform-core`               |
| `@fulcro/functions`      | `switchFor`, `tryCatch` — control flow as values                | none                                   |
| `@fulcro/transform-core` | Shared machinery behind the transformers                        | `unplugin`, optional peer `typescript` |
| `@fulcro/parallel`       | Worker pool for CPU-bound work, browser and Node                | none                                   |
| `@fulcro/types`          | Numeric types with a declared range and layout, `Decimal`       | none                                   |

`@fulcro/collections` and `@fulcro/reflect` each ship their own compile time
transformer behind a separate entry point (`./transformer`, `./unplugin`).
Neither knows the other exists; each claims only the calls it can trace back to
its own package.

## Canonical commands

Run from the repository root. These are the scripts that exist today — read
`package.json` before trusting any command that is not on this list.

| Command                                   | What it does                                                |
| ----------------------------------------- | ----------------------------------------------------------- |
| `npm run build`                           | Builds `@fulcro/transform-core` first, then every workspace |
| `npm run typecheck`                       | `tsc --noEmit` per package, then `tsconfig.tests.json`      |
| `npm test`                                | Builds, then runs Vitest                                    |
| `npx vitest run --configLoader native`    | The suites without rebuilding                               |
| `npx eslint .`                            | Lint, including the local `brace-wrapped-branches` rule     |
| `npm run format:check` / `npm run format` | Prettier check / write                                      |
| `npx --yes markdownlint-cli2`             | Markdown lint (`.markdownlint-cli2.jsonc`)                  |
| `npm run validate:claude`                 | Structural validation of the `.claude` tree                 |
| `npm run changeset`                       | Records a version bump for a shipped change                 |

Each package builds with `tsc -p tsconfig.build.json && tsc-alias -p tsconfig.build.json`.

`npm test` builds first on purpose: the harness loads the transformers from
`dist`, and the entry point suite runs entirely against built output.

## Build output

Built output goes to each package's `dist/` and never beside its source. A
`.js` or `.d.ts` appearing next to a `.ts` in `src/` is a misconfigured
`outDir`, not something to commit.

## Branches and releases

- `dev` is the working branch. `main` is the release branch.
- Work reaches `main` only through a pull request.
- Releases are tagged and published from `main` only, by Changesets.
- **Pushing and publishing stay human-controlled.** Never push, never run
  `npm publish` or `changeset publish`, and never merge. This one is enforced
  rather than trusted: the hooks in `.claude/hooks/` refuse those commands
  before they run. A refusal is not a puzzle to solve — see
  `.claude/rules/protected-operations.md` for how a human performs them.
- A pull request that changes `packages/*/src/**` must carry a changeset, or
  the release-readiness workflow fails it. It would otherwise merge green and
  never reach npm.
- A green tree is not a releasable tree. `/release-check` is the pass before
  the pull request to `main`: it runs `/verify`, `/api-audit`, `/docs-sync` and
  `/dependency-audit`, and then reads the part nothing else looks at — the
  changesets, the versions against the registry and the tags, the `dist`
  output, the `exports` and `files` lists, and what the release workflows
  assume. It releases nothing.

## Testing

Testing is owned by the root, not by each package: `vitest.config.mts` wires
both transformers into every package project, because `@fulcro/reflect`'s
suites are meaningless without its transformer applied.

Two kinds of suite, and they are not interchangeable:

- **Source tests** — `packages/*/src/**/*.spec.ts`, run per package project,
  with the transformers applied and the `@/*` alias resolved from that
  package's tsconfig.
- **Built-package entrypoint tests** — `tests/*.spec.mts`, run from the
  repository root against the published surface, deliberately _without_ the
  transformers, so they assert the runtime fallback a consumer gets before
  wiring anything up. `tests/transformers/**` is its own project again, for the
  two plugins walking one tree together.

Every feature carries a behaviour suite **and** a performance suite; one
without the other is unfinished. Performance is asserted by counting work —
elements pulled, projections invoked, comparisons made — not by reading the
clock. The clock is allowed only for ratios measured in the same run and for
generous smoke ceilings. The full standard is `docs/testing.md`.

One file per utility, tests included. Never group specs by theme.

Do not enable Vitest's `fsModuleCache`: it keys on source content while the
transformer that rewrites that content lives in this repository, so a broken
transformer goes on passing against cached output. This was measured.

## Transformers

A change under a package's `transformer/` or `unplugin/` directory requires
transformer fixtures or tests alongside it. The transformer recognises calls by
matching path segments built with `path.join`, so it sees backslashes on
Windows and forward slashes elsewhere — which is why CI runs both.

## Public API

A change to a package's public surface — its `exports` map, exported types, or
the behaviour a consumer can observe — is deliberate review territory. Propose
it and say what breaks; do not slip it in alongside an implementation change.

## Warnings

A warning is diagnosed, never merely silenced. `eslint-disable`, `@ts-ignore`,
`@ts-expect-error` and `skip` are last resorts and each needs explicit
approval. See the `fix-warnings` skill.

## Performance claims

Any claim that something got faster needs deterministic evidence: a counted
assertion, or a baseline measured in the same run on the same machine. A bare
duration is not evidence — it describes the machine.

## Documentation

Nothing imports prose, so every check in this file can pass over a page that is
wrong. A change under `packages/*/src/**` is therefore not finished when its
suites are green: it is finished when `/docs-sync` has been run over the pages
describing it and reports what it found — whether or not the change edited a
page. The `implement-feature` skill runs it as a verification step, and where a
page and the code disagree the report says which one is wrong rather than
editing the page to agree.

## Language

- Claude Code skill instructions are written in **English**, always.
- Library documentation is **bilingual**: English is the default and canonical
  version; every public page must have a maintained `pt-BR` counterpart, and
  the two must link to each other.

## Navigation

- `.claude/rules/` — detailed invariants, path-scoped by a `paths` block in
  the frontmatter; `tools/claude/rule-fixtures/` proves each scope loads where
  it says it does.
- `.claude/hooks/` — the invariants a session cannot talk its way out of,
  enforced by Claude Code itself; `tests/hooks/` is their suite.
- `.claude/skills/` — workflows.
- `tools/claude/` — the validators of everything above, the eval suites in
  `tools/claude/skill-evals/` and the rule fixtures in
  `tools/claude/rule-fixtures/`; `tests/claude/` is their suite. They run on a
  bare checkout, with no dependency beyond Node.
- `.roadmap/` — the implementation plan, and not part of the checkout:
  `.gitignore` keeps it local. `.roadmap/MASTER-ROADMAP.md` is the ordering,
  `.roadmap/CHECKLIST-MASTER.md` the state, `.roadmap/features/` one spec per
  feature.
- `docs/` — library documentation, `docs/testing.md` for the testing standard.
