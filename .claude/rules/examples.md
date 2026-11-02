# Every example is set in the Star Wars galaxy, and is shown whole

**Scope:** every example in the repository — `docs/` in both languages, every
`README.md`, the doc comments of `packages/*/src`, the suites, samples and
fixtures, and the examples of `.claude/` with the evals that mirror them

## The names and the data come from Star Wars

Every name an example chooses and every value it makes up refers directly to
Star Wars: its characters, planets, ships, factions, droids, battles and
places. `rebelPilots`, not `users`; `{ name: 'Leia Organa', homeworld:
'Alderaan' }`, not `{ name: 'Alice' }`; a `Starship` struct, not a `Particle`.
One galaxy across the whole repository means a reader moving from one page to
the next, or from a page to a suite, meets data they already know the shape of.

Two things are not the example's to choose, and stay what they are:

- **The library's own names.** `where`, `Sequence`, `allocate` and every other
  export are the public surface, and `api-design.md` keeps them. The example
  names what it passes them, not them.
- **A value that is the subject of the test.** `-0`, `NaN`, `2 ** 31 - 1`, a
  length that is not a multiple of the vector width: a boundary is asserted by
  being exactly that boundary. It keeps its value and gets a Star Wars name —
  `const deathStarExhaustPort = 2 ** 31 - 1`.

Identifiers stay English, as `general.md` requires; a proper noun of the galaxy
is a name, not a language. The `pt-BR` page carries the same code as the
English one, and translates only the prose and the comments.

## A snippet is followed by the scenario it belongs to

A short fragment showing one call is allowed, and is often the clearest first
sight of an operator. It is never the last thing a page says about it. Right
after it comes a complete example: a realistic scenario with its imports, its
data, the whole chain a consumer would write, and what it produces — the code
someone would actually have in a project, not the call in isolation.
`docs-sync` compiles both, so a complete example that stops compiling is a
finding like any other.
