# Documentation

Guides for using the `@fulcro` packages. Each one is written to be read on its
own — install command, real examples, and the scenarios the feature exists for.

The package READMEs are the short version; these are where the detail lives.

## Start here

Two things to know before picking a guide, because they are what the library is
for.

**Querying, not looping.** [Sequences](./sequences.md) is the one most people
want, and the rest build on its vocabulary — the asynchronous sequence keeps
every name the synchronous one uses.

**Checking, derived from your own types.** With the compiler plugin wired up,
the type you already wrote becomes the runtime check:

```ts
const order = as<Order>(await response.json()); // throws, naming the bad field
const orders = SequenceCollection.from(rows).cast<Order>(); // over many
```

`response.json()` hands back `any`. That line is the last place the data is
unchecked, and there is no schema to keep in step with the type, because it _is_
the type. See [Reflection](./reflect.md) for a single value and
[Sequences](./sequences.md#validating-by-type-oftypet-and-castt) for a
collection.

## Guides

| Guide                                        | Covers                                                           | Package                     |
| -------------------------------------------- | ---------------------------------------------------------------- | --------------------------- |
| [Sequences](./sequences.md)                  | Querying arrays, sets, maps and generators; validating by type   | `@fulcro/collections`       |
| [Async sequences](./async-sequences.md)      | The same, over data that arrives over time                       | `@fulcro/collections/async` |
| [Bounded concurrency](./concurrency.md)      | Running several elements at once, for work that waits            | `@fulcro/collections/async` |
| [Parallelism with workers](./parallelism.md) | CPU-bound work across threads, on browser and Node               | `@fulcro/parallel`          |
| [Reflection](./reflect.md)                   | `nameOf`, `typeOf`, `defaultOf`, `is`, `as`, and the transformer | `@fulcro/reflect`           |
| [Control flow as values](./functions.md)     | `switchFor` and `tryCatch`                                       | `@fulcro/functions`         |

## Which tool for which problem

| You have                                           | Reach for                               |
| -------------------------------------------------- | --------------------------------------- |
| An array or a `Set` to query                       | [Sequences](./sequences.md)             |
| Rows arriving from a cursor, a stream, an API      | [Async sequences](./async-sequences.md) |
| A hundred requests to make, and they are slow      | [Bounded concurrency](./concurrency.md) |
| A hundred files to parse, and the CPU is the limit | [Parallelism](./parallelism.md)         |
| **A payload you cannot trust, and a type for it**  | [`as`](./reflect.md)                    |
| A payload you would rather branch on than throw    | [`is`](./reflect.md)                    |
| A whole feed to check as it arrives                | [`cast`](./async-sequences.md)          |
| A mixed array to narrow to one type                | [`ofType`](./sequences.md)              |
| The best ten of a hundred thousand                 | [`topBy`](./sequences.md)               |
| A projection that is also the filter               | [`choose`](./sequences.md)              |
| A string that has to match a property name         | [`nameOf`](./reflect.md)                |
| An empty value for a type, that follows the type   | [`defaultOf`](./reflect.md)             |
| A `switch` that must break when an enum grows      | [`switchFor`](./functions.md)           |
| A failure you would rather have as a value         | [`tryCatch`](./functions.md)            |

**`is` or `as`?** Both check the same way. `is` is a type guard, for when a
failure should branch the program; `as` returns the value or throws, for when it
should stop it. **`ofType` or `cast`?** The same question over a collection:
`ofType` skips what does not fit, `cast` refuses at it.

**Concurrency or parallelism?** If the work is _waiting_ — network, disk,
database — use concurrency. If it is _computing_ — parsing, hashing, resizing —
use parallelism. Threads do nothing for waiting, and concurrency does nothing for
computing.

## For contributors

Not guides. These record decisions and standards, for anyone changing the code
rather than using it.

| Note                                                             | Covers                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Testing standard](./testing.md)                                 | The two suites every feature carries, and why timing is the wrong assertion |
| [Async, concurrency and parallelism](./async-and-parallelism.md) | Why the three are different, and the shape each one takes                   |

## What belongs where

- **Package README** — what the package is, enough to decide whether you want it,
  and the shortest useful example.
- **A guide here** — how to actually use it. Scenarios, terminal commands, worked
  examples, the failure modes worth knowing before you meet them.
- **A design note here** — why it is built the way it is. Read this before
  changing something that looks odd; it probably says why.
- **JSDoc in the source** — the contract of one function or type, and the
  reasoning that only makes sense next to the code.
