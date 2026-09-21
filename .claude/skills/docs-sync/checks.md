# The ten checks

Each one says what it reads, what counts as a finding, and the decisions this
repository has already argued through so they are not re-reported. `SKILL.md`
is the procedure around them.

Checks 1–6 are drift between the documentation and the code. Checks 7–9 are the
bilingual contract. Check 10 is the metadata a release carries.

## 1. Every exported name is documented where it is meant to be

**Reads.** Each package's `exports` map, the barrel each entry point resolves
to, the `@deprecated` and `@internal` tags in the doc comments, and every page
of the public set.

**A finding** is an exported name a consumer can import and no public page
mentions — or the reverse, a name a page tells them to import that the barrel no
longer exports. The second is the worse of the two: the reader types it and gets
a module error.

`@fulcro/collections` exports an operator set large enough that the guide groups
operators rather than listing each one. A name that appears inside a group's
table counts as documented; a name that appears nowhere does not. Type-only
exports that exist to be referenced in a signature — a parameter type, a
returned interface — count as documented when the signature that uses them is,
because that is where a consumer meets them.

**Not a finding.** A name exported for the transformer entry points and marked
`@internal`. The two `./transformer` and `./unplugin` entry points are public
surface per `.claude/rules/api-design.md`, but the guides document wiring them
up, not each symbol they expose.

## 2. A signature in a page matches the declaration

**Reads.** The `.d.ts` under each package's `dist/`, and every code fence and
inline signature in the public set. This is the one check that needs
`npm run build` first: a signature compared against `src` is compared against
something no consumer installs.

**A finding** is any observable difference: a parameter renamed, reordered, made
optional or dropped; an overload the page shows and the declaration does not;
`unknown` where the page promises `T`. Parameter names are part of it — an editor
shows them, and a reader writes their call from what they are called.

Inference is the half a runtime example cannot show. `.claude/rules/api-design.md`
treats a signature that infers `Sequence<unknown>` where it used to infer
`Sequence<User>` as a break, and a page whose example relies on the narrow
inference is a page that no longer compiles. Where a fence's correctness depends
on inference, check 3 is what settles it.

**Not a finding.** A page eliding a generic parameter the compiler infers, where
the elided form is what a consumer writes. The guides are written in the shape a
call is made, not in the shape a declaration is emitted.

## 3. An example compiles, and against the built output

**Reads.** Every `ts` fence in the public set, and the built packages.

**How.** Extract the fences of one page into a scratch file outside the
repository — the scratchpad directory, never `packages/` or `docs/` — resolve the
imports to the built packages, and run `npx tsc --noEmit` over it. A fence that
is a fragment (no imports, an identifier declared in a fence above it) is
concatenated with the fences before it on the same page, in order, which is how
the page reads.

**A finding** is a fence that does not compile, with the compiler's own message
quoted. A fence that compiles only with the transformers applied is reported as
such and is not a finding — `as<Order>()` and `.cast<Order>()` are the
transformer's forms, and the page that shows them says the plugin is needed. A
fence that needs the transformer and sits on a page that never says so **is** a
finding, because a consumer copying it gets the runtime fallback and no
diagnostic.

**Not a finding.** A fence deliberately showing a compile error, where the prose
says that is the point — the exhaustive `switchFor` form in `docs/functions.md`
is documented by the error it produces when an enum grows. A fence in `sh`,
`json` or `text`. A fence whose identifiers are illustrative (`users`, `orders`)
and declared nowhere: declare them in the scratch file and report the check as
run with stubs, naming them.

## 4. A behaviour claim is traceable to the code

**Reads.** The claims in the prose, the implementation, and the suites.

The guides make claims a consumer chooses the library for, and they are the part
of a page that rots without a word: nothing imports prose. Each claim of this
kind is traced to the assertion or the line that holds it up:

| Claim shape                       | What holds it up                                            |
| --------------------------------- | ----------------------------------------------------------- |
| Lazy, deferred, nothing traverses | A counted performance suite, per `.claude/rules/testing.md` |
| One pass, single traversal        | A counted suite over an instrumented source                 |
| Bounded memory, streaming         | A counted suite, and the implementation                     |
| Early exit, only until the match  | A counted suite                                             |
| Throws, naming the field          | A behaviour assertion on the message                        |
| Safe to reuse, safe to share      | A concurrency suite, per `.claude/rules/concurrency.md`     |
| An ordering guarantee             | A behaviour assertion over unsorted input                   |

**A finding** is a claim with nothing holding it up, and its severity is what a
reader does with it. A claim the implementation contradicts is a `BLOCKER`: the
reader builds on it. A claim no suite covers, where the implementation appears
to honour it, is a `MEDIUM` and the missing suite is `/test-gap`'s subject — say
so and hand it over rather than writing the assertion here.

**The prohibition lives here.** `.roadmap/features/F18-docs-sync.md` states it:
where a page and the implementation disagree, the report says which one is
wrong. It does not rewrite the page to match an implementation that is the
defect. A documented behaviour the code stopped honouring is a regression in the
code until someone decides otherwise, and deciding that is not this skill's.

## 5. Renames and deprecations

**Reads.** `git log` and `git diff` over the packages' public surface since the
last release tag, the `@deprecated` tags, and the pages.

`.claude/rules/api-design.md` keeps names: the better name is added, the old one
kept pointing at it, and the next major removes it. That shapes both halves of
this check.

**A finding** is a page still teaching the old name as the name — a reader
writing new code against a name that is on its way out — or a `@deprecated`
symbol no page marks as deprecated, or a page marking one that carries no tag.
A deprecation says what replaces it and in which version it goes; a page that
says only "deprecated" leaves the reader nowhere.

**Not a finding.** The old name appearing in a migration note or a compatibility
sentence. That is what keeping the name is for.

## 6. The READMEs point at the current pages

**Reads.** `README.md`, `docs/README.md`, and each `packages/*/README.md`.

**A finding** is a link that does not resolve, an anchor that does not exist in
the page it points to, a public page no index lists, or a README whose short
version contradicts its guide. The contradiction is the one worth the reading:
a README is edited when a feature ships and the guide is edited when someone
remembers, so the README is where the newer claim usually is and the guide is
where the reader goes.

Each package README carries a link to its guide, and per
`.roadmap/features/F18-docs-sync.md` the READMEs stay English and carry a
visible link to the Portuguese documentation.

**Not a finding.** An anchor GitHub generates differently from the link text —
check the generated form before reporting it.

## 7. Localization parity

**The public set** is derived, not remembered: it is the pages in the **Guides**
table of `docs/README.md`, plus `docs/README.md` itself. The pages in that
file's **For contributors** table — the testing standard, the note on async,
concurrency and parallelism — are the repository's own standards, addressed to
someone changing the code, and carry no Portuguese obligation. `.claude/CLAUDE.md`
asks it of every public page, and these are not public pages; they are internal
notes that happen to be in the same directory.

**The mapping is the path**, so parity is mechanical and needs no manifest to
drift out of:

```text
docs/<name>.md      ↔  docs/pt-BR/<name>.md
docs/README.md      ↔  docs/pt-BR/README.md
packages/<p>/README.md  — English, with a link to the Portuguese docs
```

The English page keeps its path. `.roadmap/features/F18-docs-sync.md` is
explicit that the canonical page is not moved to build a localization tree,
because its URL is public and links to it exist outside this repository.

**A finding** is a public English page with no counterpart at the mapped path,
or a Portuguese page with no English original — the second is the more serious,
because a claim that exists in one language only was reviewed in one language
only. A missing counterpart is reported per page, not once for the directory.

**When the tree has no `pt-BR` directory at all**, that is the state today and
the report says so in one row rather than one row per page: the localization
obligation is open work with its own line in the roadmap checklist, and eight
identical findings say nothing the one row does not.

## 8. The language switch resolves

**Reads.** The first few lines of each page in the public set and its
counterpart.

`.roadmap/features/F18-docs-sync.md` fixes the spelling of both notices, and
they are checked as written there — a notice the reader cannot see is a notice
that is not there:

```text
🇧🇷 Português (Brasil): [Leia esta documentação em português](<pt-BR-path>)
🇺🇸 English: [Read this documentation in English](<english-path>)
```

**A finding** is a missing notice, a notice below the first section rather than
near the top, a link that does not resolve, or a link that is not
repository-relative. An absolute URL is a finding: it breaks in a fork and in
every checkout that is not the default branch.

## 9. The two languages say the same thing

**Reads.** Both pages of each pair, section by section.

**A finding** is any of four, and the first is the one that costs a reader most:

- **A code fence that differs.** `.claude/skills/skill-authoring/SKILL.md` §5
  states it for skills and it holds here: the prose is translated, the example
  is not rewritten. A fence that differs by a character between languages is two
  examples, and only one of them was checked by check 3.
- **An API fact that differs** — a signature, a default, a parameter name, a
  thrown error, a version.
- **A warning or a caveat present in one language and not the other.** The
  Portuguese reader who does not get the caveat is the reader it was written
  for.
- **A claim in the Portuguese page that is absent from the English one.**
  English is canonical per `.claude/CLAUDE.md`; a translation that adds is a
  claim nobody reviewed. It is reported against the Portuguese page, and the fix
  is either to remove it or to add it to the English page first.

**Not a finding.** A heading whose wording differs, as translation requires, so
long as the sections are in the same order and cover the same ground. Different
prose length. An example's surrounding narrative in Portuguese.

## 10. Roadmap and release metadata

**Reads.** `git diff` against the base branch, `.changeset/`, the `CHANGELOG.md`
of each package, and the roadmap checklist under `.roadmap/`.

**A finding:**

- **A shipped change with no changeset.** A diff touching `packages/*/src/**`
  and no file in `.changeset/` fails the release-readiness workflow, per
  `.claude/rules/release.md`. It is reported with the bump the change claims.
- **A changeset whose note does not match the diff.** The note is what a
  consumer reads in the changelog, and it is the one release artifact written by
  hand.
- **A changeset for a change that ships nothing.** Tests, `.claude/`, tooling
  and documentation need none, and one recorded anyway publishes a version with
  an empty diff — `.claude/rules/git.md`.
- **A bump that understates the change.** A surface break recorded as a minor
  is `api-design.md`'s territory before it is a version number's; report it and
  stop.
- **Roadmap drift.** A checklist box ticked for a feature whose files are not
  there, or a feature complete in the tree and unticked. A checkbox is a claim
  about the tree and is read against the tree.

**Not a finding.** The roadmap itself being absent — it is gitignored and local,
so a checkout without it is normal. Say the check did not run and why.

## References

- `.claude/CLAUDE.md` — the bilingual contract, and the canonical commands.
- `.claude/rules/api-design.md` — what the public surface is, inference
  included.
- `.claude/rules/testing.md` — what holds a performance claim up.
- `.claude/rules/concurrency.md` — what holds a reuse or sharing claim up.
- `.claude/rules/release.md` — versions come from changesets.
- `.claude/rules/git.md` — which bump a change claims.
