# Documentation

Guides for using the `@fulcro` packages. Each one is written to be read on its
own — install command, real examples, and the scenarios the feature exists for.

The package READMEs are the short version; these are where the detail lives.

## Start here

New to the project? [Sequences](./sequences.md) is the one most people want, and
the rest build on its vocabulary.

## Guides

| Guide                                        | Covers                                                      | Package                     |
| -------------------------------------------- | ----------------------------------------------------------- | --------------------------- |
| [Sequences](./sequences.md)                  | Querying arrays, sets, maps and generators                  | `@fulcro/collections`       |
| [Async sequences](./async-sequences.md)      | The same, over data that arrives over time                  | `@fulcro/collections/async` |
| [Bounded concurrency](./concurrency.md)      | Running several elements at once, for work that waits       | `@fulcro/collections/async` |
| [Parallelism with workers](./parallelism.md) | CPU-bound work across threads, on browser and Node          | `@fulcro/parallel`          |
| [Reflection](./reflect.md)                   | `nameOf`, `typeOf`, `defaultOf`, and wiring the transformer | `@fulcro/reflect`           |
| [Control flow as values](./functions.md)     | `switchFor` and `tryCatch`                                  | `@fulcro/functions`         |

## Which tool for which problem

| You have                                           | Reach for                               |
| -------------------------------------------------- | --------------------------------------- |
| An array or a `Set` to query                       | [Sequences](./sequences.md)             |
| Rows arriving from a cursor, a stream, an API      | [Async sequences](./async-sequences.md) |
| A hundred requests to make, and they are slow      | [Bounded concurrency](./concurrency.md) |
| A hundred files to parse, and the CPU is the limit | [Parallelism](./parallelism.md)         |
| A string that has to match a property name         | [`nameOf`](./reflect.md)                |
| An empty value for a type, that follows the type   | [`defaultOf`](./reflect.md)             |
| A `switch` that must break when an enum grows      | [`switchFor`](./functions.md)           |
| A failure you would rather have as a value         | [`tryCatch`](./functions.md)            |

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
