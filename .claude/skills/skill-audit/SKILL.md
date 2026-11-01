---
name: skill-audit
description: Audits the `.claude` tree — the project contract, the rules, the skills, the subagents and the eval suites — against the repository it describes, checking every factual claim the repository can settle (the packages and their roles, the entry points, counts and enumerations such as how many transformers exist, what a command does, the directories named, what one skill says another does, whether the evals still cover each skill's examples, and the roadmap issues cited) and reports each drift with the file, the line, what the claim says and what the repository shows, without editing anything. Use when a package is added or removed, an `exports` map, a transformer, a Vitest project or a root script changes, when a file under `.claude/` changes, or when asked whether the skills, agents or rules are still accurate.
allowed-tools: Read, Grep, Glob, Bash(npm run validate:claude), Bash(git diff:*), Bash(git log:*), Bash(git status:*), Bash(gh issue view:*), Bash(gh issue list:*)
argument-hint: '[a skill, an agent or a rule by name | nothing for the whole .claude tree]'
---

# skill-audit

The `.claude` tree describes a repository that keeps moving under it. A skill
written when two packages shipped a transformer goes on saying "both
transformers" after a third arrives, and every session that follows it audits
two of three and reports the audit complete. Nothing fails: the sentence is
still well-formed, the file it names still exists, and `npm run validate:claude`
still passes over it. The drift is in what the sentence _claims_, and only
reading the claim against the thing it describes finds it.

That is the division of labour. `npm run validate:claude` is the mechanical
half — frontmatter keys, names, paths with an extension, `npm run` scripts,
subagents, the shape of the eval suites. This skill runs it first, carries its
result, and spends its own attention on the half a machine cannot decide: is
what the file says about the repository still true?

`checks.md` is the eight checks in full; this file is the procedure around them.

**This skill is read-only.** It does not correct a sentence, renumber a count,
add an eval case or edit a rule — not even the one-word fix a finding obviously
calls for. The report says what to change and where; applying it is another
turn, and a later run of this skill is what shows the fix landed.

**Where it sits next to the neighbours.** `/docs-sync` reads the library
documentation under `docs/` against the code; this reads `.claude/` against the
repository. `skill-authoring` is the standard a skill is written to and its
checklist reviews one skill's diff; this audits every skill against what has
changed since it was written. `/fulcro-review` reads a change against the
contracts in `.claude/`; this asks whether those contracts still describe the
tree.

## Invocation

**The model may invoke it**, on a change-surface signal and not on a mood, as
`.claude/skills/skill-authoring/SKILL.md` §4 asks of an audit. It reads and
writes nothing, so the cost is reading time, and the signals are the changes
that move what `.claude/` describes:

- a package added under `packages/` or removed from it;
- an `exports` map changed — an entry point added, removed or renamed;
- a package starting or stopping to ship a transformer;
- a project added to or removed from `vitest.config.mts`;
- a script changed in the root `package.json`;
- a hook, a validator or a file under `.claude/` changed.

`context: fork` is deliberately **not** set. Whether a narrowed sentence is
drift or a deliberate scope is often decided in the conversation — a fork would
report the passage that was narrowed on purpose three messages ago.

## When this applies

- "Are the skills and agents still accurate about the repository?"
- "`@fulcro/memory` ships a transformer now. What in `.claude/` still says two?"
- "Audit `/verify` against the tree."
- "I fixed the transformer counts — run the audit again."

It does not apply when:

- **The request is to review one skill's diff before it ships.** That is
  `.claude/skills/skill-authoring/checklist.md`, under the `skill-authoring`
  skill.
- **The request is to fix the drift.** An ordinary edit turn. This audit names
  what to change; it never changes it.
- **The question is whether `npm run validate:claude` passes.** Run it; that is
  one command, not a procedure.
- **The pages under `docs/` are the subject.** `.claude/skills/docs-sync/SKILL.md`.
- **The question is whether a change honours the contracts.** That is
  `.claude/skills/fulcro-review/SKILL.md`, which reads the diff against them.

## Arguments

| Argument             | What is audited                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| none                 | The whole tree: `.claude/CLAUDE.md`, the rules, the skills with their supporting files, the agents, and the eval suites |
| a skill, by name     | That skill's `SKILL.md`, its supporting files and its eval suite                                                        |
| an agent, by name    | `.claude/agents/<name>.md`                                                                                              |
| a rule, by file name | That rule, and its fixture where it has one                                                                             |

With no argument the whole tree is audited, and that is the ordinary case
rather than the expensive one: drift here is caused by changes outside
`.claude/`, so a scope taken from the diff of `.claude/` would miss exactly the
files that went stale. The tree is a few thousand lines; reading it is the job.

A name that matches nothing under `.claude/` is reported as such and the run
stops. It is never widened to the whole tree on a guess.

## Before starting

- **The working tree is read as it stands.** `git status --short`; uncommitted
  changes are part of what is audited, and the report says that they were.
- **Nothing is recalled.** Every fact a claim is checked against is read in
  this run, from the sources in §1. A count remembered from an earlier session
  is exactly the kind of fact this audit exists to distrust.
- **No build is needed.** Every source of truth here is a manifest, a config or
  a source file; nothing is read from `dist/`.

## 1. Read

Named sources, in this order.

| #   | Source                                                                           | What it settles                                     |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | `npm run validate:claude`                                                        | The mechanical half, carried into the report        |
| 2   | `packages/*/package.json`                                                        | The packages, their dependencies, peers and exports |
| 3   | The root `package.json`                                                          | The scripts, and what each one runs                 |
| 4   | `vitest.config.mts`                                                              | The projects, and the plugins each one applies      |
| 5   | `.claude/hooks/*.mts` and `.claude/settings.json`                                | What each hook refuses, and which ones are wired    |
| 6   | `tools/claude/validate-skills.mts` and `tools/claude/validate-claude-config.mts` | What the mechanical half actually checks            |
| 7   | The directories named: `packages/`, `tests/`, `tools/`, `.claude/`               | What is there, by listing rather than recall        |
| 8   | `gh issue view` for every issue number a file cites                              | What the roadmap says, where a file quotes it       |
| 9   | Every file in scope, in full, supporting files included                          | The claims                                          |

Source 1 is never re-derived. Its findings are quoted as it printed them under
`Mechanical`, and this audit does not repeat one as its own.

A source that cannot be read is recorded and the run continues: the check that
depends on it is reported as not run. `gh` unreachable means check 8 did not
run; it does not mean the issues agree.

## 2. Build the ledger

Before any claim is judged, one table of facts. Every finding is written against
a row of it, and a finding that traces to no row is a guess.

One row per fact: what it is, its value, and where it was read. "Packages
shipping `./transformer`: `@fulcro/collections`, `@fulcro/memory`,
`@fulcro/reflect` — `packages/*/package.json`, `exports`." "Plugins applied by
the `transformers` project's coexistence suite: three —
`tests/transformers/coexistence.spec.mts:95`."

The ledger is also the answer when there is nothing to report. A run that says
`Status: CLEAN` and shows what it checked against is a run someone can trust;
one that says clean and shows nothing is indistinguishable from one that read
nothing.

## 3. The eight checks

`checks.md` is each one: what it reads, how the candidates are found, what
counts as a finding, and what has been argued through already. The table is the
index.

| #   | Check                    | The question it asks                                               |
| --- | ------------------------ | ------------------------------------------------------------------ |
| 1   | Packages and their roles | Is every package named, and is what is said of each still true?    |
| 2   | Entry points             | Does every subpath a file names exist in that package's `exports`? |
| 3   | Counts and enumerations  | Does every "two", "both", "all" and list still match the set?      |
| 4   | What a command does      | Does the prose describe what the script actually runs?             |
| 5   | Directories and globs    | Does every directory and glob named resolve to something?          |
| 6   | Cross-references         | Does one file describe another as that file describes itself?      |
| 7   | Eval coverage            | Does each skill's suite still cover what the skill promises?       |
| 8   | Roadmap citations        | Does a cited issue say what the file says it says?                 |

Check 3 is read first when time is short. It is the drift a release-sized change
leaves behind most often, and the one whose consequence is largest: a skill that
enumerates a set it no longer covers runs a partial audit and calls it whole.

## 4. Decide

### What is a claim

A sentence stating a fact about this repository that a ledger row can confirm or
refute: a count, the members of a set, a path, what a command or a hook does,
what another file says. Instructions, criteria, reasoning and history are not
claims — "read the barrel first" cannot drift, and "since F34 there are three
transformers" is narration that stays true.

Fenced blocks, block quotes and the `Examples` section are excluded, as
`tools/claude/validate-skills.mts` excludes them: they quote rather than assert.

### What is a finding

A claim, the ledger row that refutes it, and **a session that follows it**. The
last part is what makes it a finding rather than a typo: somebody acts on this
sentence, and the report says what goes wrong for them.

```text
C3 · .claude/skills/verify/SKILL.md · transformers applied per project
Line:    173
Says:    "A package project applies both transformers"
Shows:   three — vitest.config.mts, `plugins` of `project()`
Session: believes a package suite runs without memory's checks, and reads a
         memory compile failure in that suite as unrelated to the change.
```

### The key

Every finding carries a key: check, file, and the subject of the claim, in that
order — never the line. Lines move when an unrelated paragraph above is edited;
the subject does not. Two runs are diffed by their keys, which is how a fix is
shown to have landed: the key is gone from the next run's report.

### Which side is wrong

Usually the `.claude` file: it was written against a tree that has since moved.
Not always. Where a rule states an invariant and the code broke it — a top-level
`await` where the contract forbids one, a package importing a sibling the
contract says it never imports — the rule is right and the code is the defect.
That is reported under its own heading, with both halves quoted, and handed to
`/fulcro-review`; it is never written up as a stale rule, because a rule edited
to agree with a violation is how the violation becomes the contract.

### Severity

The five of `.claude/skills/fulcro-review/SKILL.md`, so the reports read side by
side.

| Level     | Means                                                                                                                                                                                                                   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKER` | A session following the file covers less than it reports covering, or acts on a guard that is not there: an audit enumerating a set that leaves a member out, a stop condition relying on a hook that no longer refuses |
| `HIGH`    | A session is misled in a way it cannot detect: a wrong count it sizes its work by, a cross-reference to a status or a check the other skill never produces                                                              |
| `MEDIUM`  | The file is behind the tree without misdirecting the procedure: a package's role described as it was, an example with no eval case, a directory renamed                                                                 |
| `LOW`     | Contained: a section number that moved, a list in a different order than the source                                                                                                                                     |
| `NOTE`    | Worth writing down: a claim whose deliberateness is not established, a check that could not run                                                                                                                         |

### What is not a finding

- **A deliberately narrowed set.** "The transformers that rewrite a call" names
  two, and is true: memory's refuses, and rewrites no call — only a
  declaration. A narrowed set is a
  finding only where nothing in the sentence or its section narrows it.
- **Narration.** A sentence about how something came to be, true of the past it
  describes.
- **What the mechanical half already reported.** It is quoted under
  `Mechanical`, once.
- **A documented decision.** An exception argued through in `.claude/CLAUDE.md`
  or a rule — the DOM left out of one package's `lib`, the gitignored fixtures —
  is the source, not the drift.

Every candidate set aside for one of these reasons is listed under `Excluded`
with the reason. The candidates are where a reader checks the audit's judgement,
and a run that shows only its findings cannot be checked.

## 5. Change

Nothing. No file under `.claude/` or `tools/claude/` is edited, no eval case is
added, no issue is commented on. `npm run validate:claude`, `git` reads and
`gh issue view` run over the tree as it is.

## 6. Verify

The report is verified when every finding survives all four, and the ones that
do not are deleted before it is written:

- **The location opens.** The file and line of the claim, and the file and line
  — or the command — of the ledger row it is measured against.
- **Both halves were observed in this run.** The claim quoted as written, the
  fact quoted as read. A finding holding one half says which half it has, and is
  a `NOTE`.
- **The session is concrete.** What a session following the sentence does, and
  what goes wrong. Not "this may be outdated".
- **The key is stable.** Check, file, subject — no line number in it, so the
  next run can be diffed against this one.

## Stop

Halt and hand back when:

- **The named scope matches nothing** under `.claude/`. One line, and an end.
- **A source of truth cannot be read.** The check depending on it is reported as
  not run, the status is `PARTIAL`, and the rest continues. It is never answered
  from memory.
- **A rule is right and the code is wrong.** Report both halves and hand it to
  `/fulcro-review`; deciding whether the invariant or the code changes is not
  this audit's.
- **A finding needs a decision to settle** — whether a skill's narrower scope is
  deliberate, with nothing in the tree to say. A `NOTE`, the question stated,
  and the owner of the decision named.
- **The request becomes a fix.** The audit has said what to change; the edit is
  another turn.
- **The next step is a human's.** Push, merge, publish and discarding
  uncommitted work are refused by the hooks;
  `.claude/rules/protected-operations.md` says how a human performs each one.

## Output

The same nine sections, in this order, every run — including the run that finds
nothing.

```text
Status:      CLEAN | FINDINGS | PARTIAL | BLOCKED
Scope:       the files read, and why those
Mechanical:  the npm run validate:claude result, as printed
Ledger:      the facts, each with where it was read
Findings:    the table below, then a block per row
Code:        rules the code broke, handed to /fulcro-review — or "none"
Excluded:    the candidates set aside, each with the reason
Coverage:    one row per skill in scope — examples, eval cases, uncovered
Audited:     which of the eight ran; which did not, and why
```

The findings table, sorted by key so two runs line up:

```text
| Key | Line | Says | Repository shows | Severity |
```

Below it, one block per finding in the shape of §4 — key, line, the claim as
written, the fact as read, the session sentence — and a last line naming what
changes and in which file.

When a previous run's report is in the conversation, a tenth section follows:
`Delta`, the keys resolved since that run and the keys new in this one. Without
one, it is omitted rather than invented.

**When nothing is found:** `Status: CLEAN`, the scope, the mechanical result,
the ledger, the excluded candidates and the coverage table, and an end. Do not
pad it, and do not offer to audit something nobody asked about.

**When a check did not run:** `Status: PARTIAL`, always.

## Commands

From `.claude/CLAUDE.md`'s table and the root `package.json`:

```sh
npm run validate:claude
git status --short
git log --oneline -- .claude
gh issue view 85
```

`npm run validate:claude` is the only script this skill runs. Building, testing
and formatting are not its sources: nothing here is read from `dist/`, and a
claim about a suite is checked against the configuration that declares it, not
by running it.

## References

- `checks.md` — the eight, each with what it reads and what counts.
- `.claude/CLAUDE.md` — the contract most claims are copies of.
- `.claude/rules/README.md` — the index of the rules, and their scopes.
- `.claude/skills/skill-authoring/SKILL.md` — the standard the audited skills
  were written to, and §4 on when an audit may run unasked.
- `tools/claude/validate-skills.mts` and `tools/claude/validate-claude-config.mts`
  — the mechanical half, and what it deliberately leaves to this audit.
- `tools/claude/skill-evals/README.md` — the shape of an eval case, for check 7.
- `.claude/skills/docs-sync/SKILL.md` — the same audit over `docs/`.
- `.claude/skills/fulcro-review/SKILL.md` — the severity levels, shared, and
  where a rule the code broke goes.
- `.claude/rules/protected-operations.md` — what no skill does.
- `tools/claude/skill-evals/skill-audit.eval.json` — these examples as data.

## Examples

**Use this skill when:**

- "Are the skills and agents still accurate about the repository?"
- "`@fulcro/memory` ships a transformer now — what in `.claude/` still counts
  two?"
- "Audit `/verify` against the tree."
- "I fixed the transformer counts. Run the skill audit again." — the report
  carries `Delta`, and the fixed keys are in its resolved half.

**Do not use this skill when:**

- "Review my new skill before I commit it." That is the `skill-authoring`
  checklist, over one diff.
- "Update every skill that still says two transformers." That is the edit, and
  this audit never makes it.
- "Does `npm run validate:claude` pass?" One command; run it.
- "Does `docs/sequences.md` still describe the code?" That is `/docs-sync`.
