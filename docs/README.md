# Documentation

Guides for using the `@fulcro` packages. Each one is written to be read on its
own — install command, real examples, and the scenarios the feature exists for.

The package READMEs are the short version; these are where the detail lives.

## Guides

| Guide                                        | Covers                                                | Package                     |
| -------------------------------------------- | ----------------------------------------------------- | --------------------------- |
| [Async sequences](./async-sequences.md)      | Querying data that arrives over time                  | `@fulcro/collections/async` |
| [Bounded concurrency](./concurrency.md)      | Running several elements at once, for work that waits | `@fulcro/collections/async` |
| [Parallelism with workers](./parallelism.md) | CPU-bound work across threads, on browser and Node    | `@fulcro/parallel`          |

More are being written; this table is the index as they land.

## Design notes

Not guides. These record decisions and the reasoning behind them, for anyone
changing the code rather than using it.

| Note                                                             | Covers                                                                      |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [Async, concurrency and parallelism](./async-and-parallelism.md) | Why the three are different, and the shape each one takes                   |
| [Testing standard](./testing.md)                                 | The two suites every feature carries, and why timing is the wrong assertion |

## What belongs where

- **Package README** — what the package is, enough to decide whether you want
  it, and the shortest useful example.
- **A guide here** — how to actually use it. Scenarios, terminal commands,
  worked examples, the failure modes worth knowing before you meet them.
- **A design note here** — why it is built the way it is. Read this before
  changing something that looks odd; it probably says why.
- **JSDoc in the source** — the contract of one function or type, and the
  reasoning that only makes sense next to the code.
