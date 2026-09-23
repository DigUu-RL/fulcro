# The sixteen checks

Each one says what it reads, what counts as a failure, and the decisions this
repository has already argued through so they are not re-reported. `SKILL.md` is
the procedure around them, and its §4 is what turns these verdicts into a status.

Check 1 is the tree the rest are answered over. Checks 2–7 are `/verify full`'s
and are recorded here rather than re-derived. Checks 8–10 are the three audits.
Checks 11–15 are the release itself — the part nothing else in this repository
looks at. Check 16 is the sweep that closes the report.

## 1. Git state

**Reads.** `git status --short`, `git branch --show-current`, and
`git log --oneline origin/main..HEAD`.

The base is `origin/main` and not `main`. A checkout that has only ever worked
on `dev` has no local `main`, and `main..HEAD` fails there with
`unknown revision` — which reads as a broken command rather than as the missing
branch it is.

**A failure** is an uncommitted change to anything that decides what ships:
`packages/*/src/**`, any `package.json`, `package-lock.json`, or `.changeset/`.
The artifacts every later check reads would then have been built from a tree no
commit records, and the release runs over the merge commit rather than over
this. Report `BLOCKED` and name the paths.

**A warning** is uncommitted change anywhere else — a doc, a skill, a workflow.
It is listed, it caps the status at `WARN`, and it is never stashed, committed
or discarded to get a cleaner run. `.claude/rules/protected-operations.md` on
why discarding is not available here even when it would be convenient.

**Not a failure.** Being on `dev` rather than `main`. That is where the work
happens, and the release runs after the pull request merges. The report records
the branch and, when it is not `main`, the commits
`git log --oneline origin/main..HEAD` says a merge would carry — because those
are what the release would publish, and a reader is entitled to see the list.

**Not a failure either.** An untracked file that `.gitignore` covers. `dist/`,
`.roadmap/` and the emitted extensions under `packages/*/src/` are ignored on
purpose; `.claude/rules/build-output.md` explains the last of those, and an
untracked `.js` beside a `.ts` is check 13's business, not this one's.

## 2. Build

**Reads.** `/verify full`'s build step: `npm run build`, which builds
`@fulcro/transform-core` first and then every workspace.

**A failure** is a non-zero exit. There is nothing to judge and nothing below it
to trust — every remaining check reads what this produces.

The build is run in this pass and not assumed from an earlier one. A `dist/`
left over from another session is output nobody watched being produced, and the
report would be describing artifacts rather than observing them.

## 3. Typecheck

**Reads.** `npm run typecheck` — `tsc --noEmit` per package, then
`tsconfig.tests.json`.

**A failure** is a non-zero exit. A release carrying a type error ships
declarations a consumer's editor will disagree with, and check 14 is where that
becomes their problem rather than ours.

## 4. Tests

**Reads.** `npx vitest run --configLoader native`, the whole set of projects.

**A failure** is any failing suite, including one that looks unrelated to what
this release carries. `.claude/skills/verify/SKILL.md` is explicit that a
failure is never downgraded, and a pre-existing failure is reported as a failure
marked `pre-existing`.

The entry point project matters most here and is named separately in the
evidence: it resolves the packages by name against built output, without the
transformers, which is what a consumer gets before wiring anything up.

## 5. Lint

**Reads.** `npx eslint .`, including the local `brace-wrapped-branches` rule.

**A failure** is a non-zero exit. A warning that survives is reported under
`Open` with the file and rule, and `.claude/CLAUDE.md` holds: it is diagnosed,
never silenced, and `/fix-warnings` is the skill that does that with approval.

## 6. Format

**Reads.** `npm run format:check`.

**A failure** is a non-zero exit, and the fix is not performed here. §5 of
`SKILL.md` says why: a tree edited mid-pass is not the tree checks 2 to 4 were
answered over. Name the files and let `npm run format` be a human's next
command.

## 7. Entry points and packages

**Reads.** The `entrypoints` project of `vitest.config.mts`, run against built
output with neither transformer applied.

**A failure** is a suite failure, and it is the one that most directly predicts
a consumer's experience: every path of every `exports` map is imported by name
from the built packages, which is the thing CI's other projects never do.

This check answers whether the entry points _import_. Whether they are the right
ones, and whether the `files` allowlist carries them into the tarball, is
check 14.

## 8. API surface

**Reads.** `/api-audit` with no argument — the `exports` maps, the entry points,
the declaration output, the exported names, what a call infers, the overload
order and the type/runtime parity, all against the last release tag.

**A failure** is a `BLOCKER` from that audit. Its severity is taken as it was
reported and not re-judged; `SKILL.md` §4 says why that rule has no exception.

**What this check adds** is the comparison with the bump: an audit reporting a
removed export or a loosened inference claims a major, and check 12 reads what
the manifests actually say. A break shipped as a patch is a blocking finding of
_this_ check even when the audit itself found nothing else.

`.claude/rules/api-design.md` owns the call before the number does. A surface
change nobody proposed is reported as review territory and the release waits.

## 9. Documentation

**Reads.** `/docs-sync --all` — the documented surface, the signatures and fences
against built output, the behaviour claims, the READMEs, and the bilingual pair
with its language links.

**Not release-blocking**, and this is the only check with that property. A wrong
page breaks nobody's install. But `.claude/CLAUDE.md` makes documentation part of
a finished change, and a release carrying drift ships a promise the code does not
keep — so every finding is reported in full and the status is capped at `WARN`.

**The exception that does block.** A page telling a consumer to import a name the
barrel no longer exports is a module error they will hit, reported by whichever
of check 8 or 9 found it first, and it blocks.

## 10. Dependencies

**Reads.** `/dependency-audit` with no argument — the direct, peer and workspace
edges, duplicate resolutions, engines, licences, advisories, and what the tarball
now pulls into a consumer's install.

**A failure** is a `BLOCKER` from that audit: a narrowed peer range, a duplicate
`typescript`, a `sideEffects` field added to `@fulcro/collections`, an advisory
whose path reaches a published runtime dependency.

**What this check adds** is the workspace half at release versions. The internal
ranges have to admit the versions that are about to publish, and
`.changeset/config.json` sets `updateInternalDependencies` to `patch` — so a
range left behind by a bump is a consumer installing two versions of
`@fulcro/transform-core` and getting two module identities of the compiler
plumbing.

## 11. Changesets

**Reads.** `.changeset/` for files other than `README.md` and `config.json`,
`.changeset/config.json` for the `fixed` group, and
`git diff --name-only origin/main...HEAD` for what shipped.

Three distinct states, and they are not the same failure:

- **Shipped source changed and no changeset describes it.** A blocking failure.
  The bump is the claim being made to consumers and there is none.
  `npm run changeset` is what a human runs.
- **A changeset is pending and the manifests have not moved.** Blocking _for the
  pull request to `main`_, and ordinary on `dev`.
  `.github/workflows/release-readiness.yml` compares the declared versions across
  the diff, not the presence of a changeset file, so merging in this state fails
  the gate — and if it did not, `changeset publish` would skip every version and
  the release would report success having published nothing. The fix is to
  dispatch `Prepare release`, which runs `npm run version-packages` and pushes
  the bump to `dev`.
- **The manifests moved and the changeset was consumed.** What a release-ready
  tree looks like. The report names the versions and check 12 takes it from
  there.

**Not a failure.** A change that ships nothing carrying no changeset — tests,
`.claude/`, tooling, documentation. `.claude/rules/git.md` is explicit that
adding one there publishes a version with an empty diff.

**A blocking mismatch** is a changeset naming a package whose source did not
change, or shipped source in a package no changeset names, when the
`fixed` group of `.changeset/config.json` does not account for it. Four of the
five packages move together and `@fulcro/parallel` moves alone; a bump that looks
partial may be exactly right, and only the `fixed` list settles it.

## 12. Package versions

**Reads.** `npm pkg get name version --workspaces --json`, `git tag --list`, and
`npm view <name> version` for each package. All three, and the check is
meaningless without all three.

**The blocking failure** is a version in the manifests that already exists on the
registry. `changeset publish` skips it in silence, the workflow goes green, and
the change never reaches anybody. This is the single failure the whole skill was
written around, and no other check in this repository looks for it.

**A blocking failure too** is a version already carried by a tag when the source
has moved since: the tree would publish over a version somebody can already
install, or fail on `E409 Cannot publish over previously staged version` — which
`.github/workflows/release.yml` records having happened.

**A warning** is a version in the manifests with no tag on the remote and no
entry on the registry, where a release has run since. The publish may well have
succeeded and the record of which commit it was built from is missing; the
workflow's own last step checks the same thing and says so in the same words.

**Not a failure.** A version that is not the newest of its line, or a package
whose version did not move because nothing in it shipped.

## 13. `dist` output

**Reads.** Each package's `dist/` after check 2, each `tsconfig.json` for its
`rootDir` and `outDir` pair, and `git status --short` for emitted extensions
under `packages/*/src/`.

**A blocking failure** is a `.js`, `.mjs`, `.d.ts` or `.d.mts` beside a `.ts` in
`src/`. `.claude/rules/build-output.md` is the whole story: the `rootDir`/`outDir`
pair is the bug, the file is not deleted, and the test runner resolving the stale
copy in preference to the source is why this fails hours later as a broken import.

The one exception is tracked and deliberate: `packages/*/src/**/fixtures/*.{js,mjs}`
are source, because `@fulcro/parallel` loads a worker task module from disk at
runtime with no build step between. A fixture outside a `fixtures/` directory is
not covered by it.

**A blocking failure** is also a `dist/` that check 2 did not produce — empty,
partial, or older than the sources. The release publishes `dist`, and
`.claude/rules/release.md` says the built output is what ships rather than what
the tests imported.

## 14. `exports` and `files` lists

**Reads.** Each manifest's `exports` map and `files` array, the files actually
present under `dist/`, and `npm pack --dry-run --workspace <name> --json` for
what the tarball would contain.

**A blocking failure** is any path of any `exports` condition that does not
resolve to a file inside the packed tarball. Two shapes, and the second is the
one that gets missed:

- the target does not exist in `dist/` — a build that emitted a different layout
  than the map claims;
- the target exists and `files` does not carry it. Every package here declares
  `files: ["dist"]`, so a target emitted anywhere else resolves locally, passes
  check 7, and is absent from the consumer's install.

**A blocking failure** is a `types` condition pointing at a `.d.ts` that is not
packed, or at one that does not itself resolve its imports. A declaration that
fails to resolve is a consumer whose editor shows `any`, and
`.claude/rules/release.md` names it precisely because no runtime test notices.

**Checked by reading, not by running.** `./package.json` is exported by every
package and is always in the tarball; the `./transformer` and `./unplugin` entry
points of `@fulcro/collections` and `@fulcro/reflect` are public surface per
`.claude/rules/api-design.md` and are checked like any other path.

**Not a failure.** `@fulcro/collections` carrying no `sideEffects` field. It is
an argued decision with the reason written in the manifest's own `//sideEffects`
field — the barrels run a bootstrap call on load, and a bundler treating the
package as side effect free drops it. Re-reporting a documented decision teaches
the reader to skim.

## 15. Release workflow assumptions

**Reads.** `.github/workflows/release.yml`, `prepare-release.yml`,
`release-readiness.yml` and `ci.yml`, against what the tree actually is.

Five assumptions, and each one has failed somewhere before:

- **Every package already exists on the registry.** The workflow refuses a first
  publish, because a trusted publisher is configured on a package's own settings
  page and that page does not exist until the package does. A package new since
  the last release is therefore **blocking** here: its first version goes from a
  machine with `npm login`, which is a human's and not this session's.
- **The release is cut from `main`.** A dispatch from `dev` publishes `dev`. The
  report records the branch; it does not fail for being on `dev`, because that is
  where the pull request comes from.
- **The publish waits on the whole CI matrix.** Two Node lines and two operating
  systems. A run of this skill covers one of each, and the report says which —
  `.claude/rules/release.md` is why that is a deferral rather than a claim, and
  the transformers matching path segments is why the platform half is not
  cosmetic.
- **npm is new enough for trusted publishing**, 11.5.1 or later, and the node
  floor of the root manifest is `>=22`. Read `node --version` and `npm --version`
  and report what the local pair is; the workflow checks its own and fails
  loudly, so a mismatch here is a warning rather than a failure.
- **The tags can be written.** `changeset publish` writes annotated tags and the
  workflow configures a committer for it. Nothing about that is checkable from
  here, and the report says so rather than passing it silently.

## 16. Unresolved blockers

**Reads.** Everything already collected — the fifteen verdicts, the delegated
reports in full, and any stop condition hit along the way.

**A failure** is any of:

- a `BLOCKER` from a delegated audit that no earlier check has already reported;
- a delegated skill that halted, whose check therefore has no answer;
- a check marked `not run` that `SKILL.md` §4 lists as release-blocking;
- a public surface change that `.claude/rules/api-design.md` says is proposed in
  words and was not.

This check adds nothing new to read. It exists so that a report cannot end with
fifteen rows of evidence and a status that quietly forgot one of them, and it is
what the `Next` section of the output is derived from.

## References

- `SKILL.md` — the procedure, the statuses and the output contract.
- `.claude/rules/release.md` — what is checked before a release goes.
- `.claude/rules/build-output.md` — check 13's invariant in full.
- `.claude/rules/api-design.md` — what counts as a public surface change.
- `.claude/rules/git.md` — the changeset a shippable change carries.
- `.github/workflows/release.yml` — the assumptions of check 15.
- `.github/workflows/release-readiness.yml` — the gate check 11 predicts.
- `docs/testing.md` — what the suites of check 4 are held to.
