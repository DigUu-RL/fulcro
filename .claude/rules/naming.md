---
paths:
  - packages/*/src/**/*.ts
  - packages/*/src/**/*.mts
---

# The public vocabulary is fixed before the feature is written

**Scope:** every exported name under `packages/*/src`

`general.md` says a name describes the concept rather than the implementation.
This is the part that cannot be settled file by file: the Performance &
Execution Model spans a dozen packages that have to sound like one library, and
a name chosen while the feature is being written is chosen by whoever got there
first. The vocabulary is therefore agreed up front, and a feature that cannot
find its name in it goes back before it is built.

`.roadmap/GLOSSARY.md` holds the agreed list. It is local to a checkout —
`.gitignore` keeps `.roadmap/` out — so the conventions a review actually cites
are written here.

## What the conventions are

- Types are `PascalCase` and spelled out. `SignedInteger32`, not `i32`;
  `Pointer`, not `Ptr`; `MemoryReference`, not `Ref`.
- Functions are `camelCase` verbs: `sizeOf`, `alignOf`, `offsetOf`, `borrow`,
  `borrowMutable`, `allocate`.
- There are no keywords of our own. A capability that another language spells
  as a keyword — `unsafe`, `fixed`, `with`, `match`, `struct`, `compiletime` —
  ships as a function, a method or a type, named by the conventions above.
  A keyword TypeScript does not parse needs a plugin in every tool that reads
  the file, and nothing here may need configuring to be used. `using` and
  `await using` are TypeScript's own and are used as they are.
- A name borrowed from another language's vocabulary is not a name here.
  `Wasm*`, `Simd*`, `Vec3`, `i32`, `f32` describe somebody else's runtime, and
  a consumer reading them has to know that runtime to read our API.
- Dimensions and sizes are type parameters, not new types: `Vector<T, R, C>`,
  never `Vector3D`; `SignedInteger<N>`, never a list of aliases.

## A role suffix means there is a base type behind it

`Storage`, `Allocator`, `Serializer`, `Deserializer`, `Encoder`, `Decoder`,
`Scheduler`, `Executor`, `Logger`, `Formatter`, `Validator`, `Provider`: each
names the abstraction, and a strategy is a specialization of it —
`ArenaAllocator`, `PoolAllocator`, `StackAllocator`. Consumers depend on the
base, so a strategy can be added without touching anything that already
compiles.

The access triad is the same shape and is not negotiable per feature:
`Storage<T>` owns the memory, `Pointer<T>` locates one element, `View<T>` is a
region that observes without owning, and `ReadOnlyView<T>` observes without
modifying. There is no `Span<T>`.

## What the compiler knows is not what the consumer types

Escape analysis, lifetime analysis, allocation strategy, generic
specialization, vectorization, profile-guided optimization: these are
subsystems, and none of them becomes a public type. SIMD in particular is an
execution capability the compiler applies, so there is no public `Simd*`
anything. A consumer writing `const x = createSomething()` should never have to
learn the name of the graph node that decided where `x` lives.

Marketing is not naming either. `FastAllocator`, `@turbo` and `SuperInline`
claim a result instead of describing a mechanism, and the claim is unfalsifiable
in a name — `.claude/CLAUDE.md` wants performance claims carried by counted
evidence, not by an adjective in an identifier.

## Adding to the vocabulary

A name that is not in the glossary is proposed before it is exported, in the
same breath as the surface change `api-design.md` already asks for, and the
glossary gains the entry as part of the change. That order matters: once the
name ships, `api-design.md` keeps it, and the better name arrives as an alias
that both have to be maintained until the next major.
