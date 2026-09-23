---
name: docs-sync
description: Audits the documentation against the code it describes — whether every exported name is documented, whether the signatures and examples still compile against the built output, whether a behaviour claim is held up by a suite, whether the READMEs point at the current pages, whether every public English page has its pt-BR counterpart with both language links resolving and the same API facts, and whether the changesets and the roadmap match the diff — and reports the drift with the page and line of each one. Use after every feature in the library is created or changed and its suites pass — always, whether or not a page was edited — and when a page under `docs/` or a package README changed, when a public surface or a documented behaviour changed, when a page was translated, or before a release.
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git log:*), Bash(git show:*), Bash(git status:*), Bash(git describe:*), Bash(npm run build), Bash(npm run typecheck), Bash(npm run lint:md), Bash(npx tsc:*), Bash(npx vitest run:*)
argument-hint: '[a page | a package | a symbol | --all | nothing for the documentation this branch touches]'
---

# docs-sync

Documentation is the only part of this repository nothing imports. A renamed
export breaks a build, a changed signature fails a typecheck, a broken suite goes
red — and a page that describes last month's behaviour passes everything, sits at
a public URL, and is what a consumer believes. Every green check in
`.claude/CLAUDE.md`'s table can pass over a page that is wrong.

The drift this audit exists for has four shapes. A name a page tells the reader
to import, that the barrel stopped exporting. A signature whose third parameter
became optional in `dist` and is still required in the example. A claim the
library was chosen for — lazy, one pass, bounded, safe to reuse — that no suite
holds up any more. And a Portuguese page a year behind its English original,
which is worse than no Portuguese page, because the reader has no way to know.

`checks.md` is the ten checks in full; this file is the procedure around them.

**This skill is read-only.** It does not edit a page, translate one, write a
changeset, tick a roadmap box, or correct a signature. Where a page and the code
disagree it says which one is wrong, and applying that is someone else's turn.

**Where it sits next to the neighbours.** `/api-audit` reads what a consumer
sees of the surface and hands the pages that describe the old one over here.
`/test-gap` derives the assertions a behaviour owes; this one finds the claim in
a page with no assertion behind it and hands it there. `/fulcro-review` reads one
diff against every contract, this one reads the documentation against the whole
tree. `/verify` answers whether the checks pass, which they do over a page that
is wrong.

## Invocation

**The model may invoke it**, on a change surface and not on a mood. Nothing here
reaches the network and nothing here writes, so the cost is reading time, and
`.claude/skills/skill-authoring/SKILL.md` §4 asks that the surface justifying it
be named:

- **a feature in the library was created or changed, and its suites are green.**
  This is the standing one, and it is not conditional on a page having been
  edited: any change under `packages/*/src/**` changes what every page
  describing it claims, and the page nobody remembered to open is the whole
  reason this audit exists. `.claude/skills/implement-feature/SKILL.md` §4 runs
  it as a verification step for exactly that reason, and a feature is not
  finished before it has run;
- a page under `docs/` changed, or a `README.md` at the root or under
  `packages/*`;
- a package's public surface changed — its `exports` map, an exported name, a
  signature, a doc comment;
- a documented behaviour changed: laziness, a traversal count, an ordering, an
  error message, a concurrency guarantee;
- a page was translated, or a translation was edited;
- a release is being prepared.

`context: fork` is deliberately **not** set. Half of what makes a claim a
finding is whether the change was deliberate, and that was decided in the
conversation — a fork would report a removed guarantee as drift while the
sentence agreeing to remove it sat three messages above.

## When this applies

- "The operator is implemented and both suites pass — are the docs still true?"
- "I changed `topBy`. Does the documentation still describe it?"
- "Are the examples in `docs/sequences.md` still compiling?"
- "Is every page's Portuguese counterpart there, and do the links work?"
- "I translated the reflection guide — check it against the English one."
- "We are about to release. Does the documentation match what ships?"
- "Does this branch need a changeset?"

It does not apply when:

- **The question is what a consumer sees of the surface.** The `exports` map, the
  declarations, what a call infers: `.claude/skills/api-audit/SKILL.md`.
- **The question is what is untested.** A claim with no suite behind it is
  reported here and derived there:
  `.claude/skills/test-gap/SKILL.md`.
- **The request is to write the documentation.** A page, or a translation:
  `.claude/skills/implement-feature/SKILL.md` owns the writing, and the
  bilingual pair is one of its deliverables.
- **The request is to fix the code the page describes.** This audit names the
  disagreement; repairing it is an implementation change.
- **Something is failing.** A red suite, a page whose example throws:
  `.claude/skills/diagnose/SKILL.md` starts from the reproduction.
- **The question is whether the tree is green.**
  `.claude/skills/verify/SKILL.md`.

## Arguments

| Argument  | What is audited                                              |
| --------- | ------------------------------------------------------------ |
| none      | The documentation the branch touches, and the code it covers |
| a page    | That page, its counterpart, and the surface it describes     |
| a package | Its guide, its README, and its whole exported surface        |
| a symbol  | Every page that mentions it, in both languages               |
| `--all`   | Every page and every package — the expensive case, said so   |

With no argument, the scope comes from `git diff` against `dev`: the pages that
changed, plus the pages describing any package whose `src` changed. When neither
moved, say so and stop. An audit of an unchanged surface describes the world
rather than reporting on it, and cannot be diffed against its last run.

## Before starting

- **The build is current.** Checks 2 and 3 read `dist` — a signature compared
  against `src` is compared against something no consumer installs, and
  `.claude/rules/release.md` is about exactly that gap. Run `npm run build`
  once, or report both checks as not run.
- **The public set is read, not recalled.** It is derived from the **Guides**
  table of `docs/README.md` every run; a page added since the last session is in
  the set and a page nobody indexed is check 6's finding.
- **The base is established.** `git describe --tags --abbrev=0` for what the last
  release documented, `dev` for what this branch changed. A rename is only
  visible against one of them.
- **Extraction happens outside the repository.** Fences are concatenated into
  the scratchpad directory for check 3. Nothing is written under `docs/`,
  `packages/` or `tests/`, and `.claude/rules/build-output.md` is why a stray
  `.ts` beside source is its own kind of damage.

## 1. Read

Named sources, in this order. Nothing recalled, and no signature, claim or path
stated that was not read in this session.

| #   | Source                                              | What it settles                    |
| --- | --------------------------------------------------- | ---------------------------------- |
| 1   | `docs/README.md`                                    | The public set, and the index      |
| 2   | Every page in that set, in full                     | The claims, fences and signatures  |
| 3   | The counterpart of each, where there is one         | The parity half                    |
| 4   | `packages/*/package.json`, the `exports` maps       | The entry points a page teaches    |
| 5   | The barrel behind each entry point                  | The names actually exported        |
| 6   | The `.d.ts` under each `dist/`                      | The signatures, as a consumer sees |
| 7   | `packages/*/README.md` and the root `README.md`     | The short version, and the links   |
| 8   | `git diff` against `dev`, then the last release tag | What moved, and since when         |
| 9   | `.changeset/`, and each `CHANGELOG.md`              | What the release will say          |
| 10  | The suites covering each traced claim               | Whether a claim is held up         |

Source 5 is the one that separates a documented name from an exported one. A
page naming an import and a barrel exporting a name are two halves, and a
finding needs both — `.claude/rules/api-design.md` on why the barrel is the
public list.

Source 10 is what makes check 4 an audit rather than a reading. A claim of
laziness, of a single traversal or of bounded memory is traced to a counted
assertion, per `.claude/rules/testing.md`; a claim traced to nothing is a
finding whichever way the implementation happens to behave today.

The roadmap under `.roadmap/` is read for check 10 when it is there. It is
gitignored, so a checkout without it is normal: the check is reported as not run
rather than guessed at.

## 2. Build the surface table

Before any check runs, one table. Every finding is written against a row of it,
and a finding that traces to no row is a guess.

One row per documented unit: the symbol or the claim, the page and line that
states it, the code or the suite that holds it up, and whether the counterpart
page states it too. A row with an empty third column is check 1's or check 4's
finding. A row with an empty fourth is check 7's or check 9's.

The table is also the answer when there is nothing to report. A run that says
`Status: CLEAN` and shows what it traced is a run someone can trust; one that
says clean and shows nothing is indistinguishable from a run that read nothing.

## 3. The ten checks

`checks.md` is each one: what it reads, what counts as a finding, and the
decisions already argued through. The table is the index.

| #   | Check                      | The question it asks                                          |
| --- | -------------------------- | ------------------------------------------------------------- |
| 1   | Exported names documented  | Can a consumer find every name, and import each one it names? |
| 2   | Signatures match           | Does the page's signature match `dist`?                       |
| 3   | Examples compile           | Does the fence compile against the built packages?            |
| 4   | Behaviour claims           | Is the promise held up by a suite or a line?                  |
| 5   | Renames and deprecations   | Is the reader being taught a name on its way out?             |
| 6   | READMEs and indexes        | Do the links resolve, and do the two agree?                   |
| 7   | Localization parity        | Does every public page have its counterpart?                  |
| 8   | Language switch links      | Can a reader get to the other language?                       |
| 9   | Cross-language equivalence | Do both pages state the same facts?                           |
| 10  | Roadmap and release data   | Do the changesets and the checklist match the diff?           |

Checks 3, 4 and 9 are the ones that survive every green check in the repository,
and they are read first when the scope is large. A check whose source could not
be read is listed as not run; it is never answered from the other sources and
called done.

## 4. Decide

### What is a finding

A finding is a check, a row of the surface table, and **a reader**. The last part
is what makes it a finding rather than an observation: somebody follows this
page, and the report says what happens to them.

```text
Check 2 · docs/parallelism.md:112 · WorkerPool.map
Page:    map(items, task) — the task module path is the second argument
dist:    map(items: readonly T[], options?: RunOptions): Promise<R[]>
Reader:  copies the two-argument call, gets a type error on the second
         argument, and has no way to tell from the page which form is current.
```

No reader consequence, no finding. A difference nobody can act on is a `NOTE`,
and it says so.

### Severity

The five of `.claude/skills/fulcro-review/SKILL.md`, so two reports can be read
side by side. There is no score and no verdict on the documentation as a whole.

| Level     | Means                                                                                                                                                                                                         |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKER` | A reader following the page gets something that does not work or is not true: an import that fails, a fence that does not compile, a claim the implementation contradicts, a shipped change with no changeset |
| `HIGH`    | A reader is misled in a way they cannot detect: a signature that drifted, a caveat present in one language only, a deprecated name taught as current, a bump that understates a break                         |
| `MEDIUM`  | The documentation is behind the code without being wrong: an exported name no page mentions, a claim no suite holds up, a broken link, a missing counterpart page                                             |
| `LOW`     | Contained: an anchor that moved, an index missing a contributor note, a changelog note thinner than the change                                                                                                |
| `NOTE`    | Worth writing down: a deliberate omission, a check that could not run, a claim whose deliberateness is not established                                                                                        |

### What is not a finding

- **A documented decision.** `docs/README.md` separates guides from contributor
  notes, and the notes carry no Portuguese obligation — check 7 says why.
  Re-reporting a decision someone wrote down teaches the reader to skim.
- **A page shorter than the surface.** The guides group operators on purpose;
  brevity is an editorial choice and only an absent name is a finding.
- **Translated prose that reads differently.** Check 9 compares facts, fences
  and caveats, never wording or length.
- **A page describing a behaviour the code is about to get.** Where the sequence
  is deliberate, it is a `NOTE` naming the branch or the changeset that closes
  it.

### The one prohibition

**Never propose rewriting a page to match an implementation that is the defect.**
`.roadmap/features/F18-docs-sync.md` states it, and it is the recommendation
this audit may not make. Where a page and the code disagree, the report names
both, says which is more likely the intended behaviour and on what evidence — a
suite, a changeset, a commit message, the conversation — and stops. A documented
guarantee the code stopped honouring is a regression in the code until someone
decides otherwise, and a page quietly edited to agree with it is how the
regression becomes the specification.

## 5. Change

Nothing. No page edited, no translation written, no link repaired, no anchor
fixed, no changeset recorded, no roadmap box ticked — not even the one-word fix
a finding obviously calls for.

`npm run build`, `npm run typecheck`, `npx tsc --noEmit` over the extracted
fences and `npx vitest run` over a suite a claim is traced to may all run, over
the tree as it is. A failure in any of them that this audit did not cause is a
stop condition rather than an input: an audit over output that does not build is
an audit over unknown output.

## 6. Verify

The report is verified when every finding survives all five, and the ones that
do not are deleted before it is written:

- **The location opens.** The page and the line, and the file and line of the
  code or the suite it is measured against. `docs/sequences.md:204`, not "the
  sequences guide".
- **Both halves were read.** The page as written, and the declaration, the
  implementation or the assertion. A finding holding one half and inferring the
  other says which half it has.
- **The reader is concrete.** Which call fails, which belief is wrong, which
  language is missing the caveat. Not "this may confuse users".
- **The evidence was observed in this session.** The compiler message quoted,
  not described. The assertion quoted, not remembered. A check that did not run
  says so.
- **The owner is named.** The page, the code, the suite or the changeset — which
  one changes, and which skill or rule owns that change.

## Stop

Halt and hand back when:

- **The build is not current and cannot be made so.** Checks 2 and 3 are
  reported as not run, with the error, and the status is `PARTIAL`. They are
  never answered from `src`.
- **Neither the documentation nor a package's `src` moved**, and no scope was
  named. One line, and an end.
- **A page and the code disagree and the page looks right.** That is a code
  regression: report it, name the evidence, and stop. Deciding to change the
  behaviour is not this audit's, and neither is changing the page.
- **The finding is a public surface change.** An exported name, a signature, an
  `exports` condition: report it as review territory under
  `.claude/rules/api-design.md` and stop.
- **A build, typecheck or suite fails for a reason this audit did not cause.**
  Quote it and stop; that is `/diagnose`'s subject.
- **The whole Portuguese tree is absent.** One row, the obligation named, and
  the rest of the audit continues over the English pages. It is not eight
  identical findings and it is not a reason to stop.
- **The next step is a human's.** Push, merge, publish and discarding
  uncommitted work are refused by the hooks.
  `.claude/rules/protected-operations.md`.

## Output

The same seven sections, in this order, every run — including the run that finds
nothing.

```text
Status:    CLEAN | FINDINGS | PARTIAL | BLOCKED
Scope:     the pages and the packages read, and why those
Traced:    the surface table — what was checked against what
Findings:  the table below, then a block per row
Parity:    one row per public page — counterpart, links, equivalence
Risks:     what reading could not settle, and what would
Follow-up: the page owed, the suite owed, the changeset owed, per owner
Audited:   which of the ten ran; which did not, and why
```

The findings table:

```text
| # | Check | Page:line | Reader impact | Severity |
```

The parity table, which is reported every run because it is the state of the
bilingual contract rather than a list of problems:

```text
| Page | Counterpart | EN→pt link | pt→EN link | Facts equal |
```

Below the findings table, one block per finding: the surface row it comes from,
the two halves as they were observed, the reader sentence, and what changes — in
words, naming the owner. Under Follow-up, four things and no more: the pages
owed, the suites `/test-gap` should derive, the changeset the diff obliges with
the bump it claims, and the neighbouring audit a surface finding hands work to.

**When nothing is found:** `Status: CLEAN`, the scope, the surface table, the
parity table, and an end. Do not pad it with checks the scope does not reach,
and do not offer to audit a page nobody asked about.

**When a check did not run:** `Status: PARTIAL`, always. A report that ran eight
of ten and reads as complete is worse than one that ran four and says which four.

## Commands

From `.claude/CLAUDE.md`'s table and `package.json`. The reads:

```sh
git diff --name-only dev -- docs packages
git diff dev -- docs
git describe --tags --abbrev=0
git log --oneline dev.. -- docs
git show HEAD -- packages/collections/src
```

Checks 2 and 3 need built output, and check 3 the compiler:

```sh
npm run build
npx tsc --noEmit --strict --module nodenext --moduleResolution nodenext <extracted>
```

A claim traced to a suite is confirmed by running it, never by reading it:

```sh
npx vitest run --configLoader native packages/collections/src/where.spec.ts
```

`npm run lint:md` is the Markdown lint a page has to pass, and
`npm run changeset` is what records the bump this report says the diff owes.
This skill runs neither: the first is `/verify`'s, and the second is the change
someone else applies.

## References

- `checks.md` — the ten, each with what it reads and what counts.
- `.claude/CLAUDE.md` — the bilingual contract, and the canonical commands.
- `.claude/rules/api-design.md` — the public surface, inference included, and
  that names are kept rather than renamed.
- `.claude/rules/testing.md` — what holds a performance claim up, and why a
  counted assertion rather than a clock.
- `.claude/rules/concurrency.md` — what holds a reuse, cancellation or bound
  claim up.
- `.claude/rules/release.md` — versions come from changesets, and the built
  output is what ships.
- `.claude/rules/git.md` — which bump a diff is claiming.
- `.claude/rules/build-output.md` — why extraction happens outside the tree.
- `.claude/rules/protected-operations.md` — what no skill does.
- `.github/workflows/release-readiness.yml` — why a shipped change without a
  changeset merges green and reaches nobody.
- `docs/README.md` — the index the public set is derived from.
- `.claude/skills/api-audit/SKILL.md` — the surface a page describes.
- `.claude/skills/test-gap/SKILL.md` — the suites a traced claim is owed.
- `.claude/skills/implement-feature/SKILL.md` — who writes the page and the
  translation.
- `.claude/skills/fulcro-review/SKILL.md` — the severity levels, shared.
- `tools/claude/skill-evals/docs-sync.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "`takeWhile` is implemented, both suites pass. What is left?" — the
  documentation is what is left, and this runs without being asked for.
- "I changed `topBy`'s signature — does the documentation still describe it?"
- "Do the examples in the sequences guide still compile?"
- "I translated `docs/reflect.md`. Check it against the English page."
- "We are releasing tomorrow. Is the documentation the one we reviewed?"
- "Does this branch owe a changeset?"

**Do not use this skill when:**

- "What does a consumer see of our exports now?" That is `/api-audit`.
- "Write the Portuguese page for the concurrency guide." That is the writing, and
  `/implement-feature` owns it.
- "The example in the parallelism guide throws when I run it." There is a
  failure to start from: `/diagnose`.
- "Which of these behaviours has no test?" That is `/test-gap`, which derives
  the scenarios rather than reading the prose.
- "Make the page say what the code does now." Not without someone deciding the
  code is right — that is the one recommendation this audit may not make.
