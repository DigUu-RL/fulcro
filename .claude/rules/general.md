# How code is written here

**Scope:** every source file in this repository

The house style is not a matter of taste; it is what lets a reader open any
file in any package and already know how it is arranged. Five things carry
most of that.

## Names say what a thing is, in English

Exported names describe the concept, never the implementation and never an
abbreviation of it. `takeWhile`, not `tw`; `WorkerPool`, not `WPool`. A name
that has to be decoded is a name the next reader guesses at.

English throughout — identifiers, comments, commit messages, skill
instructions. `.claude/CLAUDE.md` makes the same demand of the documentation,
where the `pt-BR` translation is a counterpart to the English page rather than
a replacement for it.

A type parameter is `T`, `TKey`, `TValue`: single letters are allowed there and
nowhere else, because the surrounding signature already says what they stand
for.

## Errors carry what the caller needs to act

A thrown error names the operation, the value that broke it and what was
expected. A caller that has to parse a message to recover from a failure has
been given a string where it needed a value.

Nothing is swallowed. A `catch` that discards the failure hides the one moment
where the cause was still in hand; if a failure really is expected and
recoverable, that is a value in the return type, not silence in a block.

`@fulcro/functions` exists partly for this: `tryCatch` turns the failure into a
value at the point where the caller can do something with it.

## Comments say why

The code already says what it does, and a comment repeating it goes stale the
first time the code changes. What the code cannot say is why this shape and not
the obvious one — the measurement behind a loop that looks clumsy, the platform
difference behind a branch, the invariant a reader would otherwise break while
tidying up.

Every exported symbol carries a doc comment, because that text is what a
consumer reads in their editor and it is part of the public surface.

## Abstraction follows the second case, not the first

An interface with one implementation, a generic parameter with one argument, a
hook nothing calls: each is a guess at a future that has not arrived, and each
has to be maintained until it does. Write the concrete thing. The second caller
is what tells you where the seam really goes, and it arrives with evidence.

The same applies to options. A parameter added "in case someone needs it" is a
public commitment — see `api-design.md` for what that costs.

## SOLID is followed strictly

Every package holds to the five principles, and a review cites them by name:

- **Single responsibility.** A module has one reason to change. How a value is
  stored, the arithmetic over it and the rule that tells one type from its
  siblings live in separate modules, even when one file could hold them all.
- **Open/closed.** A new variant is added by supplying what distinguishes it,
  not by editing the variants already there. When a third type needs a branch
  inside the code of the other two, the seam is in the wrong place.
- **Liskov substitution.** Whatever implements a contract honours all of it: a
  descriptor that satisfies `NumericType` works everywhere a `NumericType` is
  accepted, with no case the consumer has to know about.
- **Interface segregation.** A contract promises only what every implementer
  can keep. A type without an order does not carry `lessThan` to throw from.
- **Dependency inversion.** Code depends on the contract, never on a concrete
  sibling — a matrix knows `ElementType`, not `SinglePrecisionFloat`.

Duplication between siblings is a finding, not a style note: two modules
carrying the same operations are one abstraction waiting to be extracted.

The abstraction is built by **composition**, in the idiom the packages already
use — a factory taking what varies, as `createIntegerType` and
`createFloatType` do — not by class inheritance. Descriptors stay objects of
arrow functions that work when taken off their object, and values stay frozen
plain objects and arrays. A class is used where a value needs its own identity
and prototype, as `Decimal` does.

This does not overrule the section above; the two meet at the second case. A
single implementation is still written concretely, and SOLID says where the
seam goes once the second one arrives. What it rules out is leaving the second
and third copies in place once they exist.
