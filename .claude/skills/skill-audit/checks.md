# The eight checks

Each one says what it reads, how its candidates are found, what counts as a
finding, and what this repository has already argued through so it is not
re-reported. `SKILL.md` is the procedure around them.

The search patterns below find candidates, not findings. A sentence the pattern
matches is read in full, with its section, before it is judged — the pattern is
how nothing is missed, the reading is how nothing is misreported.

## 1. Packages and their roles

**Reads.** The `name`, `dependencies` and `peerDependencies` of every
`packages/*/package.json`, and the listing of `packages/` itself.

**Candidates.** The package table of `.claude/CLAUDE.md`, and every sentence in
scope naming a `@fulcro/` package together with what it is, what it depends on,
or what it never imports.

**A finding** is a package that exists and is missing from a table that lists
the packages, a package listed that no longer exists, or a role or dependency
stated that the manifest contradicts — "runtime deps: `errors`" over a manifest
that also depends on `transform-core`.

**Not a finding.** A sentence naming one package as an example of a kind. Only a
sentence presenting itself as the list is held to being complete.

## 2. Entry points

**Reads.** The `exports` map of every package.

**Candidates.** Every subpath in scope written against a package —
`@fulcro/collections/async`, `./transformer`, `./unplugin`, `./worker` — and
every sentence saying which packages ship a given entry point.

**A finding** is a subpath named that the package does not export, or a
sentence saying which packages ship an entry point that leaves one out or adds
one. `@fulcro/transform-core` exports `./unplugin` and no `./transformer`; a
sentence that counts it among the packages shipping a transformer is wrong, and
one that counts it among those shipping `./unplugin` is right.

**Not a finding.** A subpath named in a sentence about a package that does not
exist yet and is the subject of the sentence — `/new-package` describes the
entry points a package it creates will have.

## 3. Counts and enumerations

**Reads.** The set the claim counts, from its own source: the packages exporting
`./transformer` for transformers; `vitest.config.mts` for projects and for the
plugins each one applies; `.claude/hooks/*.mts` and `.claude/settings.json` for
hooks; the directory listing for skills, agents and rules; a skill's own section
for "the N checks" it has.

**Candidates.** Search the scope for a number word or a quantifier in front of
a countable noun, and for a list of package names standing as a set:

```text
\b(one|two|three|four|five|six|seven|eight|nine|ten|both|all|each of the|every)\b[^.\n]{0,40}\b(transformers?|plugins?|packages?|projects?|hooks?|checks?|suites?|rules?|skills?|agents?|subagents?)\b
`@fulcro/collections` and `@fulcro/reflect`
```

The second pattern is the shape the transformer drift takes when it is not
counted — the two names standing for a set that now has three members.

**A finding** is a count that does not match the set, or a list presented as the
set that leaves a member out. The set is what the sentence and its section
present it as: "both transformers" in a sentence about every plugin applied to a
project counts the plugins applied to a project, and `vitest.config.mts` says
how many that is.

**Not a finding.**

- A set narrowed by the sentence itself, or by its section. "The transformers
  that rewrite a call" are two, because memory's refuses and rewrites nothing.
  "`@fulcro/memory`'s `*.unchecked.spec.ts` run with the other two" is exact.
- A count in narration: "when the second transformer arrived" stays true.
- A skill whose scope is narrowed in its own description and body, consistently.
  Whether that narrowing is still the right scope is a `NOTE` naming the member
  left out, not a count finding — unless the skill also claims to cover the
  whole set, in which case it is a `BLOCKER`, because a session running it
  reports complete coverage it did not have.

## 4. What a command does

**Reads.** The `scripts` of the root `package.json`, and the scripts of a
package's manifest where a sentence names one.

**Candidates.** The command table of `.claude/CLAUDE.md`, and every sentence in
scope describing what a named `npm run`, `npm test` or `npx` command does — what
it builds first, what it runs, in which order.

**A finding** is a description the script body contradicts: "builds `errors`,
then `transform-core`, then every workspace" over a script that no longer does
the second step; "`npm test` runs the suites" over a script that also builds.
Whether the script exists at all is the mechanical half's `script-missing`, and
is not repeated here.

**Not a finding.** A description of an `npx` invocation spelled with flags the
sentence chooses — `npx vitest run --project collections` is a use of the
command, not a claim about a script.

## 5. Directories and globs

**Reads.** The listing of each directory named, and for a glob, whether its
literal prefix exists and anything under it matches.

**Candidates.** Every path in scope ending in `/`, every path with no extension,
and every glob — `packages/*/src/**`, `tests/transformers/**`,
`tools/claude/rule-fixtures/`. The mechanical half checks only paths with an
extension, on purpose; this check is the other half.

**A finding** is a directory that is not there, or a glob that matches nothing
where the sentence says something lives — a rule scoped by prose to a directory
that was renamed.

**Not a finding.** A directory a procedure creates — the scratchpad, a
`fixtures/` a new suite is told to add, the `dist/` a build produces. A
gitignored directory, which a fresh checkout is right not to have.

## 6. Cross-references

**Reads.** The file referred to: its `description`, its output contract, its
section headings and its numbered checks.

**Candidates.** Every sentence in scope saying what another skill, agent, rule
or validator does, produces or is numbered: "`/verify`'s `Status: PASS`",
"checks 3, 4 and 9 of `/docs-sync`", "`implement-feature` §4 runs it", "the five
levels of `/fulcro-review`".

**A finding** is a reference the other file contradicts: a status value it never
emits, a check number it does not have, a section that moved or was renamed, a
responsibility it says it does not carry. The finding is filed against the file
making the reference; the file referred to is the source.

**Not a finding.** A paraphrase that states the same responsibility in other
words. Only a fact — a name, a number, a status, an owner — is held to matching.

## 7. Eval coverage

**Reads.** `tools/claude/skill-evals/<skill>.eval.json` for every skill in
scope, the skill's `Examples` section, its `Arguments` table and its `Output`
section, and `tools/claude/skill-evals/README.md` for the shape of a case.

**A finding** is any of:

- a bullet under the skill's `Examples` with no case whose prompt makes the same
  request — the example was written as data once, and has drifted from it since;
- an argument form in the `Arguments` table that no case exercises;
- a case whose `expect.output` uses a status, a section name or a check number
  the skill's `Output` section does not define — a case nobody can judge against
  the current contract.

The suite's shape — a positive, a negative and an edge present, ids unique,
`expect.output` present — is the mechanical half's, and is not repeated here.

**Not a finding.** A case with no matching example. The suite is allowed to be
larger than the examples; the examples are the floor, not the ceiling.

## 8. Roadmap citations

**Reads.** `gh issue view <number>` for every issue a file in scope cites — by
number, or by feature ID resolved with
`gh issue list --label feature --state all --search "F43 in:title"`.

**Candidates.** Every `#<number>` in scope, every `F<n>` beside a claim about
what that feature specifies or whether it is done.

**A finding** is a citation the issue contradicts: an ID mapped to the wrong
issue number, a feature described as done whose issue is open, a criterion
quoted that the issue does not carry, a dependency claimed that its
**Dependências** line does not list.

**Not a finding.** A citation of a specification that, as the issue itself says,
was lost and reconstructed — the file quoting the original wording is the only
copy, and `docs-sync` says so of F18 in exactly those terms.

When `gh` cannot reach the repository, this check did not run, and the report
says so. It is never answered from the citations agreeing with each other.
