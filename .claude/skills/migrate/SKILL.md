---
name: migrate
description: Carries one agreed API change across the whole repository — an exported name renamed, moved to another entry point or package, its signature reshaped, or a deprecated name finally removed — with an inventory of every use in source, suites, transformers, error texts, documentation in both languages and `.claude/`, the compatibility path kept, mechanical edits applied apart from semantic ones, and the residue reported by site. Use when an export of a `@fulcro/*` package is to change its name, place or shape and every use of it has to follow.
argument-hint: <old> -> <new> | remove <name> | <the change, described>
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Edit, Write, AskUserQuestion, Agent, Skill, Bash(npm run build), Bash(npm run typecheck), Bash(npm run format), Bash(npm run format:check), Bash(npm run lint:md), Bash(npm run validate:claude), Bash(npx vitest run:*), Bash(npx eslint:*), Bash(npm ls:*), Bash(git status:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git tag:*), Bash(git grep:*), Bash(git ls-files:*), Bash(git branch:*), Bash(git switch:*), Bash(git mv:*), Bash(git add:*), Bash(git commit:*)
---

# migrate

A public name in this repository lives in more places than the compiler can
see. The declaration and its callers are the easy half: `npm run typecheck`
finds every one it missed. The rest is text — a transformer that recognises a
call by a string and a directory segment, an error message that names the
operation, a page and its `pt-BR` counterpart, an example in a README, a skill
that tells a session which utility to reach for. None of those fails when it is
left behind. The transformer declines and the runtime fallback answers instead,
the page goes on documenting a name that no longer exists, and every suite
stays green.

This skill is the order a migration is done in: the contract agreed first, an
inventory of every use with its kind, the compatibility path kept, the
mechanical edits made and verified apart from anything that changes behaviour,
and what could not be migrated reported by site rather than guessed at.

**This skill writes.** It edits and moves files across packages and commits
each step. It does not push, publish or merge, and it never edits an assertion
to make its own change pass.

## Invocation

`disable-model-invocation: true`. Two reasons. A migration touches files in
every package that uses the name, and the size of that diff is the user's to
choose to take on. And its central decision — whether the old name stays as a
deprecated alias or is removed — is a release decision: removal is a major
version for every consumer, and `.claude/rules/api-design.md` does not let it
happen as a side effect of tidying. A message that mentions a better name is a
question, not an instruction to migrate.

## When this applies

- An export is renamed: `/migrate takeWhile -> takeUntilFalse`.
- An export moves — to another entry point, or another package.
- A signature changes shape and every call site has to follow: positional
  parameters become an options object, an overload is retired.
- A deprecated name is removed in a major: `/migrate remove someName`.

It does not apply when:

- **Nothing outside the package uses the change.** An internal rename is an
  ordinary edit; the inventory here costs more than it finds.
- **The change is a new capability.** Adding a name with no predecessor is
  `.claude/skills/implement-feature/SKILL.md`.
- **The question is what a change would break.** That is
  `.claude/skills/api-audit/SKILL.md`, which reports and edits nothing.
- **The rename is of an error code.** A code is never renumbered
  (`.claude/rules/errors.md`); only its wording moves, and that is a decision
  per code, not a migration.
- **The request is to rename a package.** That breaks every install, not every
  call, and is a proposal under `api-design.md` before any procedure.

## Arguments

- `<old> -> <new>` — a rename. Each side may carry a package or an entry point:
  `@fulcro/functions:switchFor -> @fulcro/functions:select`.
- `remove <name>` — the removal of a name already deprecated.
- A sentence — a signature change or a move, described.

With no argument, ask which change to migrate and stop. With an argument that
names only one side, ask for the other: the contract is the whole input, and a
skill that invents half of it migrates to a name nobody chose.

## Before starting

- `git status --short` is clean, or its changes are the user's and known. Never
  stash, discard or commit them to make room.
- `git branch --show-current` is not `main`. On `main`, branch from `dev` and
  say so. On a branch already carrying an unrelated change, ask for a new one —
  a migration that cannot be reverted alone cannot be reviewed alone.
- `npm run build`, `npm run typecheck` and `npx vitest run --configLoader
native` pass on this tree. A migration is verified by its suites staying
  exactly as green as they were, so a red baseline leaves nothing to compare
  against. If any fails before anything changed, stop — that failure is not
  this skill's.

## 1. The contract

Before any search, write the contract down:

```text
Old:            @fulcro/<package>[/<entry>] <name> — its signature
New:            @fulcro/<package>[/<entry>] <name> — its signature
Kind:           rename | move | reshape | removal
Semantics:      identical | changed — and if changed, exactly how
Compatibility:  deprecated alias until the next major | removed now
Bump:           minor | major, per package
Glossary:       the new name's entry, or the entry to propose
```

What each line requires:

- **Semantics.** A rename, a move and a removal are `identical`: every call
  that compiled before does the same thing after, or no longer compiles. A
  reshape is `changed` the moment any call could behave differently — a
  default that moved, an overload that now selects a different signature, an
  inferred type that loosened. `api-design.md` counts the inference as surface.
- **Compatibility.** The default is the alias: the new name is the
  declaration, the old one is kept pointing at it with a doc comment carrying
  `@deprecated` and the new name, and the bump is a minor. `removed now` is
  allowed only for `Kind: removal`, and only for a name whose deprecation is
  already in a released version — `git tag` and the package's `CHANGELOG.md`
  say whether it is. Anything else asks for an explicit decision, as its own
  question.
- **Glossary.** The new name follows `.claude/rules/naming.md` and is in
  `.roadmap/first/GLOSSARY.md`, or the contract proposes its entry.

## 2. Read

| #   | Source                                                   | What it settles                                     |
| --- | -------------------------------------------------------- | --------------------------------------------------- |
| 1   | The declaration of the old name and its barrel           | What it is today, and where it is exported from     |
| 2   | The package's `package.json` `exports` map               | Which entry point a consumer imports it through     |
| 3   | `.claude/rules/api-design.md`, `naming.md`, `general.md` | What the contract may be                            |
| 4   | `.roadmap/first/GLOSSARY.md`                             | Whether the new name is agreed                      |
| 5   | `surfaces.md` beside this file                           | Every place a name lives, and the search for each   |
| 6   | `git tag`, the package's `CHANGELOG.md`                  | Whether a deprecation has shipped, for a removal    |
| 7   | `.changeset/config.json` and pending `.changeset/*.md`   | Which packages version together; bumps already made |

Then run every search in `surfaces.md` for the old name. Run them all, even
where a surface looks unlikely: the transformer recognition and the error
values are strings, and a search skipped there is a use the inventory never
lists and the build never reports.

## 3. Inventory

One row per use, from the searches and nothing else:

```text
| # | Site (path:line) | Package | Surface | Kind | Class |
```

- **Surface** is the row of `surfaces.md` that found it.
- **Kind** is what the site does with the name: `declaration`, `export`,
  `internal call`, `sibling consumer` (another `@fulcro/*` package importing
  it), `test call`, `test assertion`, `transformer recognition`, `error value`,
  `doc example`, `doc prose`, `skill or rule`, `history`.
- **Class** is one of:
  - `mechanical` — the edit is the name or the path and nothing else, and the
    code around it means the same afterwards;
  - `semantic` — the site has to be rewritten because what it does changes: a
    reshape, a default, a test whose expected value differs under the new
    contract;
  - `kept` — the old name stays on purpose: the deprecated alias, the suite
    that proves the alias, a `CHANGELOG.md` entry, an error code;
  - `manual` — the use cannot be resolved by reading: a name built from a
    string, a computed property access, a re-export under a third name, a
    snippet in prose whose intent is unclear.

A site that cannot be classified is `manual`. It is never folded into the
nearest class to keep the table tidy.

**Public consumers in the repository** are the `sibling consumer` rows. Name
each package that has one: it is a consumer of the change, and its own
changeset row follows from it.

## 4. Plan

```text
Contract:     as in §1, agreed
Inventory:    counts per package and class, with the table
Order:        the steps of §6, with the sites each covers
Transformer:  whether the name is recognised by one, and how both spellings
              stay recognised while the alias lives
Errors:       each error value or template naming the old name, and whether
              its wording changes
Changeset:    one row per package, with its bump and why
Semantic:     one row per semantic change, each a separate step
Manual:       the sites left to the user, and why each could not be resolved
Review:       the architecture-reviewer memo, for a move between packages
```

Delegate to the `architecture-reviewer` subagent when the change moves a name
between packages or adds a dependency edge between them; its memo goes to the
user beside the plan, unedited, and a finding it marks blocking is a stop.
When the old name is recognised by a transformer, delegate the plan's
`Transformer` row to the `transformer-reviewer` subagent the same way.

Sensitive, in this skill: any `package.json`, any `tsconfig*`, a transformer's
`functionName` or `moduleSegment`, the wording of an error template, a removal,
and every semantic row.

## 5. Ask

Show the contract, the inventory and the plan, then ask with
`AskUserQuestion`: migrate as planned, change something named, or migrate
nothing. Each sensitive row is its own question when its turn comes, and each
semantic row is approved on its own — approving the rename is not approving
the behaviour change carried with it.

If the answer is to migrate nothing, stop. The inventory stands as the record.

## 6. Change

In this order, one step at a time, with the step's check run before the next
one starts:

1. **The provider.** The new declaration; the old name kept as the agreed
   compatibility path — an alias whose doc comment says `@deprecated` and names
   the replacement, exported from the same entry point it always was. A file
   or directory named for the utility moves with `git mv`, and so do its suites
   under the package's `src/tests/` — `<name>.spec.ts` and
   `<name>.performance.spec.ts`: one file per utility, named for it.
   Check: `npm run build`, `npm run typecheck`.
2. **The transformer**, when one recognises the name — the `functionName`, the
   `moduleSegment` when the directory moved, and whatever keeps the alias
   recognised while it lives, with a fixture for each spelling in the same
   commit (`.claude/rules/transformers.md`). Check:
   `npx vitest run --project transformers --project <package> --configLoader native`.
3. **Internal calls and sibling consumers.** Mechanical rows only. Check:
   `npm run build`, `npm run typecheck`.
4. **Suites.** A `test call` row changes its name and nothing else on the line;
   a `test assertion` row is never edited — when an expected value would have
   to change, the row was semantic and belongs to step 7. The alias gets one
   case in the provider's spec asserting it is the new export, and
   `tests/entrypoints.spec.mts` lists both names. Check: the affected projects,
   then `npx vitest run --configLoader native`.
5. **Error values and texts**, as the plan said — a value that passes the
   operation's name changes with it; a template's wording changes only where
   the user approved it, in `packages/errors/src/catalog/` and both language
   pages at once. The code stays.
6. **Documentation and `.claude/`.** Every EN page with its `pt-BR` counterpart
   in the same step, with the code of each example identical in both; package
   READMEs; skills and rules that name the old one. A `CHANGELOG.md` is
   history and is not edited.
7. **Each semantic row**, separately, with the behaviour and performance cases
   the change owes (`.claude/rules/testing.md`) written before the code, and its
   own check.
8. **The changeset.** `npm run changeset` is an interactive prompt this skill
   cannot answer; the file it would produce is written directly, one row per
   package the plan named.

Commit after step 6 — the mechanical migration, a state the tree can be checked
out at — and after each semantic row, each on its own. Stage by name, never
with `git add -A`; match the subjects of `git log -15 --format=%s` and close
with the session's attribution trailer. Never push.

What may not change:

- **An assertion, to make the migration pass.** A suite that goes red after a
  mechanical step means the step was not mechanical. That is a stop.
- **Compatibility code**, without the explicit removal decision of §1.
- **A `kept` or `manual` row.** Kept is the plan; manual is the user's.
- **Anything outside the inventory.** A neighbouring name that would read
  better renamed too is a second migration.

## 7. Verify

1. **Residue.** Rerun every search of `surfaces.md` for the old name. Every hit
   is a `kept` or `manual` row of the inventory; any other hit is a site the
   migration missed, and is migrated or reported before going on.
2. `npm run build`, `npm run typecheck`, `npx vitest run --configLoader native`,
   `npx eslint .`, `npm run format:check`, `npx --yes markdownlint-cli2`;
   `npm run validate:claude` when `.claude/` changed.
3. **`/api-audit <package>`** for each provider package. The added, removed and
   changed rows it reports must be exactly the contract — the new name added,
   the old one kept or removed as agreed — and the bump it derives must match
   the changeset.
4. **`/transformer-audit`**, when a transformer recognised the name: both
   spellings rewritten while the alias lives.
5. **`/docs-sync`** over the pages the migration touched, and over the ones it
   should have — the pages naming either name.

When the `Skill` tool refuses one of these, it is reported as not run and named
as the user's next command — never assumed to have passed.

## Stop

Halt and hand back when:

- **The contract is incomplete** — one side missing, or the semantics unknown.
- **The new name conflicts** with `naming.md` or the glossary, or is already
  exported by the package.
- **A removal is asked for a name whose deprecation never shipped.** Report the
  release it would have to ship in first.
- **A blocking finding** in the `architecture-reviewer` or
  `transformer-reviewer` memo.
- **A check fails.** Report it verbatim. One that was red before step 1 is not
  this skill's; one that turned red after a mechanical step means that step
  changed behaviour — the assertion is not touched, and the cause goes to
  `/diagnose` if it is not plain.
- **The inventory grows** past what the user approved: a surface the plan did
  not list, a sibling package nobody named.
- **The next step is a human's**: pushing, publishing, merging. The hooks refuse
  them; `.claude/rules/protected-operations.md` says how a human performs each.

## Output

Every run, including the one that stops at the contract:

```text
Status:        MIGRATED | PARTIAL | BLOCKED | DECLINED | AWAITING-APPROVAL
Contract:      old -> new, kind, semantics, compatibility, bump
Inventory:     per package — mechanical / semantic / kept / manual counts
Changed:       one row per step of §6 — the sites it covered, its check
Semantic:      each semantic row, approved and done, or not
Compatibility: the alias and its deprecation note, or the removal and its basis
Changeset:     the file, with its row per package
Residue:       every remaining hit, each tied to a kept or manual row
Manual:        site, why it could not be resolved, what the user must decide
Verification:  build, typecheck, suites, lint, format, and the /api-audit,
               /transformer-audit and /docs-sync reports, each with its status
               or "not run"
Commits:       the subjects, in order
Next step:     what is left, and whose it is
```

`DECLINED` is the run whose inventory found nothing outside the package, or
whose contract the user declined: `Changed: nothing`, and the inventory as the
record. `Manual: none` is written out, never left blank.

Then, for a workflow reading the run:

```json
{
	"skill": "migrate",
	"status": "MIGRATED",
	"contract": {
		"old": "@fulcro/functions:switchFor",
		"new": "@fulcro/functions:select",
		"kind": "rename",
		"semantics": "identical",
		"compatibility": "deprecated-alias"
	},
	"inventory": { "mechanical": 41, "semantic": 0, "kept": 3, "manual": 1 },
	"changeset": [{ "package": "@fulcro/functions", "bump": "minor" }],
	"manual": [{ "site": "docs/functions.md:88", "reason": "name in prose" }],
	"verification": [
		{ "check": "suites", "status": "PASS", "observed": true },
		{ "check": "api-audit", "status": "not run", "observed": false }
	],
	"blocked_on": null
}
```

`observed` is `true` only for a check that ran in this session.

## Commands

From `.claude/CLAUDE.md` and the root `package.json`:

- `npm run build`
- `npm run typecheck`
- `npx vitest run --configLoader native`
- `npx eslint .`
- `npm run format` / `npm run format:check`
- `npx --yes markdownlint-cli2`
- `npm run validate:claude`
- `npm run changeset`

Plus `git grep` and `git ls-files` for the searches, `git tag` for the
deprecation history, and `git mv`, `git add` and `git commit` for the change.

## References

- `surfaces.md` — every place a name lives, with the search for each.
- `.claude/rules/api-design.md` — the proposal, the alias, additive overloads.
- `.claude/rules/naming.md` — what the new name may be.
- `.claude/rules/transformers.md` — why the recognition changes in the same
  commit.
- `.claude/rules/errors.md` — codes stay; wording is a decision.
- `.claude/rules/testing.md` — what a semantic row owes.
- `.claude/rules/git.md` — one change per branch, commit shape, changesets.
- `.claude/rules/protected-operations.md` — what stays a human's.
- `.claude/agents/architecture-reviewer.md`,
  `.claude/agents/transformer-reviewer.md` — the reviews §4 delegates.
- `.claude/skills/api-audit/SKILL.md`,
  `.claude/skills/transformer-audit/SKILL.md`,
  `.claude/skills/docs-sync/SKILL.md` — the checks §7 runs.
- `tools/claude/skill-evals/migrate.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "/migrate switchFor -> select"
- "Move `defaultOf` from `@fulcro/reflect` into `@fulcro/types`, and update
  everything that uses it."
- "/migrate remove someName — its deprecation shipped in 2.1."

**Do not use this skill when:**

- "What would renaming `switchFor` break?" That is `/api-audit`, and nothing is
  edited.
- "Rename this private helper in `sequence.collection.ts`." Nothing outside the
  package sees it; an ordinary edit.
- "Add a `chunkBy` operator." A new name with no predecessor is
  `/implement-feature`.
- "Rename `@fulcro/functions` to `@fulcro/flow`." A package rename is a
  proposal under `.claude/rules/api-design.md` first.
