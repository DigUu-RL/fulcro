---
name: dependency-audit
description: Audits a dependency change as a supply-chain and compatibility change rather than a version number — the direct, peer and workspace edges, duplicate resolutions, engines, licences, advisories, what the tarball now pulls into a consumer's install, and whether the TypeScript peer range still admits the compiler API the transformers call — and reports the delta, its motivation, the risks and the bump and documentation it obliges. Use when a `package.json`, `package-lock.json` or the installed tree changed, when a dependency is proposed, or before a release.
disable-model-invocation: true
allowed-tools: Read, Grep, Glob, Bash(npm ls:*), Bash(npm explain:*), Bash(npm audit:*), Bash(npm view:*), Bash(npm outdated:*), Bash(npm pack --dry-run:*), Bash(npm run build), Bash(npm run typecheck), Bash(npx vitest run:*), Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git status:*), Bash(node --version)
argument-hint: '[package name | dependency name | nothing for the dependency change on this branch]'
---

# dependency-audit

A dependency is not a version number; it is a package this repository now ships
to everyone who installs it. `@fulcro/collections` has one runtime edge, to
`@fulcro/transform-core`, which has one of its own, to `unplugin`. That is the
whole non-workspace runtime surface of the library, and a line added to a
`dependencies` field extends it for every consumer without their agreeing to
anything.

The failures this audit exists for are the ones a green suite cannot see,
because the suite runs against the tree that is installed here. A peer range
narrowed by one character breaks installs and compiles nothing differently. A
second `typescript` in the tree gives the transformers two module identities and
fails as a node of the wrong kind. A licence that moved on a transitive
dependency binds the consumer and appears in no file here. A `sideEffects` field
added in good faith drops the bootstrap call `groupBy` needs.

This skill reads the change and says what it costs. `checks.md` is the eleven
checks in full; this file is the procedure around them.

**This skill is read-only.** It does not install, bump, edit a manifest, touch
the lockfile, run `npm audit fix`, or record a changeset. The bump a finding
claims is stated in words and someone else applies it.

**Where it sits next to the neighbours.** `/api-audit` reads what a consumer
sees of _this_ code — the `exports` map, the declarations, what a call infers;
this one reads what a consumer _also installs_ because of it, and hands the
declaration half over. `/transformer-audit` compares emitted output across the
compiler boundary; this one notices that a compiler bump obliges that comparison
and says so. `/verify` answers whether the tree is green, which a tree with a
narrowed peer range is.

## Invocation

**The model may not invoke it**, and `disable-model-invocation: true` is set for
one reason: three of the eleven checks query the registry. `npm audit` sends the
resolved dependency tree to the advisory endpoint, and `npm view` and
`npm outdated` answer differently on Tuesday than they did on Monday. An outward
call whose result is not reproducible is not something to make on the model's
own initiative, and `.claude/skills/skill-authoring/SKILL.md` §4 puts anything
reaching the network on this side of the line.

`context: fork` is deliberately **not** set. The output contract carries a
motivation per change, and half of a motivation lives in the conversation that
proposed the dependency — a fork would lose it and the report would say "not
established" about something the session was told two messages ago.

The surface that justifies typing it:

- a `package.json` at the root or under `packages/*` whose `dependencies`,
  `peerDependencies`, `peerDependenciesMeta`, `engines` or `files` moved;
- a `package-lock.json` diff, whether or not a manifest moved with it;
- a dependency being proposed, before it is installed;
- a compiler or `unplugin` bump;
- a release being prepared, or a bump whose size is in question.

## When this applies

- "I want to add a dependency to `@fulcro/collections` — what does that cost?"
- "The lockfile moved and no manifest did. What changed?"
- "Can we widen the `typescript` peer range to admit 7?"
- "`npm audit` reports something. Does it reach anything we publish?"
- "We are about to release. Is the dependency surface the one we reviewed?"

It does not apply when:

- **The question is what a consumer sees of our own code.** The `exports` map,
  the declarations, an inferred type: `.claude/skills/api-audit/SKILL.md`.
- **The question is whether the transformer still emits the same output.** A
  compiler bump's actual consequence is
  `.claude/skills/transformer-audit/SKILL.md`, with fixtures.
- **Something is failing.** A broken install, a module that will not resolve, a
  suite that went red after `npm install`:
  `.claude/skills/diagnose/SKILL.md` starts from the reproduction.
- **The question is whether the checks pass.** `.claude/skills/verify/SKILL.md`.
- **The answer is to install something.** This audit reports; applying it is
  `.claude/skills/implement-feature/SKILL.md`'s turn, and the bump is recorded
  with `npm run changeset`.
- **A warning is to be silenced.** `.claude/skills/fix-warnings/SKILL.md`, and a
  bump is never the way — see the prohibitions below.

## Arguments

| Argument          | What is audited                                        |
| ----------------- | ------------------------------------------------------ |
| none              | The dependency change on this branch, per `git diff`   |
| a package name    | That workspace's whole dependency surface              |
| a dependency name | That edge everywhere it appears, declared and resolved |
| `--all`           | All six manifests — the expensive case, named as such  |

With no argument and no dependency change in the diff, say so and stop. An audit
of an unchanged surface reports the state of the world, which is not what a
report is for.

## Before starting

- **The tree is installed and matches the lockfile.** `npm ls --depth=0`
  reporting a missing or invalid entry means the resolved half of every check is
  unknown. Say so and stop rather than auditing declarations alone.
- **The lockfile is the one in the checkout.** A manifest change with no
  lockfile change beside it is itself a finding, not a reason to install.
- **Registry reachability is established once, not assumed.** The first
  `npm view` or `npm audit` either answers or does not; when it does not, checks
  6 and 7 are reported as not run, with the error, and the status is `PARTIAL`.
- **A build is only run when a check needs it.** Checks 8 and 10 read emitted
  output; the other nine do not. `npm run build` is not a warm-up.

## 1. Read

Named sources, in this order. Nothing recalled from memory, and no version
stated that was not read from a file or a command in this session.

| #   | Source                                             | What it settles               |
| --- | -------------------------------------------------- | ----------------------------- |
| 1   | `git diff -- package.json packages/*/package.json` | The declared delta            |
| 2   | `git diff --stat -- package-lock.json`             | Whether the tree moved too    |
| 3   | The six manifests, in full                         | Ranges, engines, peers, files |
| 4   | `npm ls --depth=0`, then `npm ls <name> --all`     | What is actually installed    |
| 5   | `npm explain <name>`                               | Who asked for each copy       |
| 6   | `npm audit --json`                                 | Advisories, as of today       |
| 7   | `npm view <name>@<version> license engines`        | Licence and floor, at version |
| 8   | `.github/workflows/ci.yml`                         | The platform and Node matrix  |
| 9   | `git log -- <the manifest>`, recent                | Why the edge arrived          |
| 10  | The import sites, by `Grep`                        | Whether anything uses it      |

Source 10 is the one that separates a declaration from a dependency. A range in
a manifest that nothing imports, and an import nothing declares, are both
findings, and only reading both halves finds either.

Source 9 is where a motivation comes from when the invocation does not carry
one. A change whose motivation is established by neither says
`not established` in the report — never a motivation reconstructed from what the
dependency plausibly does.

## 2. Build the delta

Before any check runs, one table. It is what every finding is written against,
and a finding not traceable to a row of it is a guess.

One row per edge that moved: the package it belongs to, the field it is in
(`dependencies`, `devDependencies`, `peerDependencies`), the range before, the
range after, and the version resolved now. Added and removed edges are rows with
one side empty.

A lockfile-only change gets rows too — the range did not move and the resolution
did, which is the shape a supply-chain change arrives in.

## 3. The eleven checks

`checks.md` is each one: what it reads, what counts as a finding, and the
decisions this repository has already argued through. The table is the index.

| #   | Check                    | The question it asks                               |
| --- | ------------------------ | -------------------------------------------------- |
| 1   | Direct dependencies      | Is every edge declared, used and bounded?          |
| 2   | Peer dependencies        | Does the range still admit the consumer's install? |
| 3   | Workspace relationships  | Can the range admit the version that will publish? |
| 4   | Duplicate versions       | Does one name resolve twice, and who asked?        |
| 5   | Engine compatibility     | Did the Node floor move under anyone?              |
| 6   | Licence changes          | What obligation does the consumer inherit?         |
| 7   | Security advisories      | Does the path reach something we publish?          |
| 8   | Bundle and runtime       | What does the tarball now pull in?                 |
| 9   | Node support             | Does the browser condition still resolve?          |
| 10  | TypeScript compatibility | Does the compiler we build with match the peer?    |
| 11  | Transformer compiler API | Does the transformer still emit the same thing?    |

Checks 2, 3, 4 and 11 are the ones that survive a green suite most often, and
they are read first when the delta is large. A check whose source could not be
read is listed as not run; it is never answered from the manifests alone and
called done.

## 4. Decide

### What is a finding

A finding is a check, a row of the delta, and **a consumer**. The last part is
what makes it a finding rather than an observation: somebody installs this, and
the report says what happens to them.

```text
Check 2 · @fulcro/reflect · peerDependencies.typescript
Before: >=5.3.3 <7   After: >=5.5.0 <7
Consumer: a project pinned to TypeScript 5.4 gets an unmet peer warning on
install and, if their build wires the transformer entry point, no rewrite —
`nameOf` falls back to the runtime path with no diagnostic saying why.
```

No consumer, no finding. A range that moved with nobody outside it is a `NOTE`,
and it says so.

### Severity

The five of `.claude/skills/fulcro-review/SKILL.md`, so two reports can be read
side by side. There is no score and no verdict on the tree.

| Level     | Means                                                                                                                                                                      |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKER` | A consumer's install or build breaks, or something they run has an advisory: a narrowed peer range, a duplicate `typescript`, `sideEffects` added to `@fulcro/collections` |
| `HIGH`    | A consumer inherits an obligation or a risk they cannot see: a licence that moved on a runtime edge, a new runtime dependency, a Node floor raised                         |
| `MEDIUM`  | A declaration that does not match reality: an import nothing declares, a lockfile-only resolution change, a devDependency advisory reachable in the build                  |
| `LOW`     | Contained cost with no consumer consequence: a duplicate confined to tooling, dead weight in `devDependencies`                                                             |
| `NOTE`    | Worth writing down: a deliberate range held for testing, a bump whose motivation is not established                                                                        |

### What is not a finding

- **A documented decision.** `@fulcro/collections` omits `sideEffects` on
  purpose and its manifest says why in a `//sideEffects` field. `typescript7` is
  a second compiler line held deliberately. Re-reporting either teaches the
  reader to skim.
- **A version that is merely not the newest.** `npm outdated` is a list of
  newer numbers, not of problems. An outdated edge becomes a finding when one of
  the eleven checks says so.
- **A transitive edge nothing here reaches.** Say the path, say it stops before
  anything published, and give it `LOW` or `NOTE`.
- **A bump that would quiet a warning.** Listed below, because it is the one
  recommendation this skill may not make.

### Two prohibitions

From `.roadmap/features/F17-dependency-audit.md`, and both are about what the
report says rather than what it does:

- **Never recommend a bump merely to quiet a warning.** An unmet peer warning,
  an audit line, a deprecation notice: each is reported with the path it reaches
  and the consumer it affects, or it is reported as reaching nothing. A version
  number is not a diagnosis. `.claude/CLAUDE.md` says a warning is diagnosed,
  never silenced, and a bump is the silencing shape a dependency change takes.
- **Never claim a vulnerability is fixed without current evidence.** Fixed means
  an `npm audit` run in this session, quoted, with the date. Anything else goes
  under Risks as unverified, with the command that would settle it.

## 5. Change

Nothing. No install, no `npm audit fix`, no edited range, no lockfile
regenerated, no changeset recorded — not even the one-character range widening a
finding obviously calls for. A range is public surface, and
`.claude/rules/api-design.md` says a change to it is proposed in words before it
is written in.

`npm run build` and `npm run typecheck` may run, for checks 8 and 10, over the
tree as it is. A failure in either is a stop condition, not an input: an audit
over a tree that does not build is an audit over unknown output.

## 6. Verify

The report is verified when every finding survives all five, and the ones that
do not are deleted before it is written:

- **The location opens.** The manifest and the field, or the file and line of
  the import.
- **Both halves were read.** The declared range from the manifest, the resolved
  version from `npm ls` or `npm explain`. A finding stating one and inferring
  the other names which half it has.
- **The consumer is concrete.** Which install breaks, which obligation is
  inherited, which call falls back. Not "this may be risky".
- **The evidence was observed in this session.** Command output quoted, not
  described. A registry answer carries the date it was read. A check that did
  not run says so.
- **The bump is named.** Patch, minor or major, per `.claude/rules/git.md`, and
  major whenever a consumer's install or compile stops working —
  `.claude/rules/api-design.md` owns that call before the number does.

## Stop

Halt and hand back when:

- **The tree does not match the lockfile.** Report what `npm ls` said and stop.
  This audit does not install to repair its own prerequisite.
- **There is no dependency change** and none was named. One line, and an end.
- **The registry is unreachable.** Checks 6 and 7 are reported as not run, with
  the error, and the status is `PARTIAL`. They are never answered from memory.
- **A build or typecheck fails for a reason this audit did not cause.** Quote it
  and stop; that is `/diagnose`'s subject.
- **The finding is a public surface change.** A peer range, an `exports`
  condition, a runtime edge added to a published package: report it as review
  territory under `.claude/rules/api-design.md` and stop. This skill does not
  propose the new range.
- **The next step is a human's.** Push, merge, publish and discarding
  uncommitted work are refused by the hooks.
  `.claude/rules/protected-operations.md`.

## Output

The same seven sections, in this order, every run — including the run that finds
nothing.

```text
Status:    CLEAN | FINDINGS | PARTIAL | BLOCKED
Delta:     one row per edge that moved, declared and resolved
Motivation: per row — why, and where that was established
Findings:  the table below, then a block per row
Risks:     what reading and the registry could not settle, and what would
Follow-up: the bump claimed, the documentation owed, the audit obliged
Audited:   which of the eleven ran; which did not, and why
```

The delta table:

```text
| Package | Field | Before | After | Resolved |
```

The findings table:

```text
| # | Check | Where | Consumer impact | Severity |
```

Below it, one block per finding: the delta row it comes from, the evidence as it
was observed, the consumer sentence, and the fix in words. Under Follow-up,
three things and no more — the bump each finding claims, the documentation pages
a consumer-visible change obliges (bilingual, per `.claude/CLAUDE.md`), and the
neighbouring audit a compiler or `unplugin` bump hands work to.

**When nothing is found:** `Status: CLEAN`, the delta, the motivation per row,
and an end. Do not pad it with checks the delta does not reach, and do not offer
to audit a package that was not asked for.

**When a check did not run:** `Status: PARTIAL`, always. A report that read nine
of eleven and reads as complete is worse than one that read four and says so.

## Commands

From `.claude/CLAUDE.md`'s table and `package.json`. The reads:

```sh
npm ls --depth=0
npm ls typescript --all
npm explain eslint
npm audit --json
npm view unplugin@3.3.0 license engines peerDependencies --json
npm outdated
npm pack --dry-run --workspace @fulcro/collections
node --version
git diff -- package.json packages/*/package.json
git diff --stat -- package-lock.json
git log --oneline -- packages/collections/package.json
```

The two that need built output, for checks 8 and 10 only:

```sh
npm run build
npm run typecheck
```

`npm run changeset` is what records the bump this report claims, and it is named
here so the report can name it. This skill does not run it.

## References

- `checks.md` — the eleven, each with what it reads and what counts.
- `.claude/rules/api-design.md` — a peer range and an `exports` condition are
  public surface, and a change to one is proposed before it is written.
- `.claude/rules/release.md` — versions come from changesets, and the built
  output is what ships.
- `.claude/rules/git.md` — which bump a change is claiming.
- `.claude/rules/transformers.md` — runtime and transformer are one feature, and
  both path separators count.
- `.claude/rules/build-output.md` — what belongs in `dist`, and what `files`
  therefore has to cover.
- `.claude/rules/protected-operations.md` — what no skill does.
- `.github/workflows/ci.yml` — the Node and platform matrix a floor is read
  against.
- `.github/workflows/release-readiness.yml` — why a shipped change without a
  bump merges green and reaches nobody.
- `.claude/skills/api-audit/SKILL.md` — the declarations and what a call infers.
- `.claude/skills/transformer-audit/SKILL.md` — what a compiler bump actually
  emits.
- `.claude/skills/diagnose/SKILL.md` — an install or a suite that is failing.
- `.claude/skills/implement-feature/SKILL.md` — who applies a finding.
- `tools/claude/skill-evals/dependency-audit.eval.json` — these examples as
  data.

## Examples

**Use this skill when:**

- "I want to add a dependency to `@fulcro/collections`. What does it cost a
  consumer?"
- "The lockfile moved on this branch and no manifest did — what changed?"
- "Can the `typescript` peer range admit 7 yet?"
- "`npm audit` is reporting something. Does it reach anything we publish?"

**Do not use this skill when:**

- "What does a consumer see of our exports now?" That is `/api-audit`.
- "Does the transformer still rewrite `nameOf` under the new compiler?" That is
  `/transformer-audit`, which compares emitted output.
- "The install broke after I pulled." That is `/diagnose`: there is a failure to
  start from.
- "Bump it and make the warning go away." The bump is someone's to apply, and a
  warning is diagnosed rather than quieted.
