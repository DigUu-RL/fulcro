# FULCRO1xxx — `@fulcro/collections`

🇧🇷 Português (Brasil): [Leia esta documentação em português](../pt-BR/errors/FULCRO1xxx.md)

The errors of [sequences](../sequences.md) and
[async sequences](../async-sequences.md). Back to [all codes](../errors.md).

Most of them are a question asked of a sequence that could not answer it: the
first element of nothing, the only element of several. Each of those has a
form that returns `null` instead of throwing — reach for it when an empty
sequence is a normal outcome rather than a mistake.

## FULCRO1001

```text
Error: FULCRO1001: Sequence contains no elements
```

`first()`, `last()`, `average()`, `min()` or `max()` of a `Sequence` found
nothing to answer with — the sequence was empty, or nothing matched the
predicate.

Use `firstOrNull()` or `lastOrNull()` where an empty result is expected, or
check `any()` first.

## FULCRO1002

```text
Error: FULCRO1002: An item with the same key has already been added.
```

`toMap()` of a `Sequence` produced the same key for two elements. A map holds
one value per key, and silently keeping either one would lose the other.

Make the key unique, or use `toLookup()` or `groupBy()`, which keep every
element under its key.

## FULCRO1003

```text
Error: FULCRO1003: single() found no element matching the condition.
```

`single()` of a `Sequence` promises exactly one element, and found none.

Use `singleOrNull()` where none is an acceptable answer.

## FULCRO1004

```text
Error: FULCRO1004: single() found more than one element matching the condition.
```

`single()` or `singleOrNull()` of a `Sequence` found a second element. Both
refuse it: "the only one" of two is not a question with an answer.

Use `first()` if any match will do, or tighten the predicate.

## FULCRO1005

```text
Error: FULCRO1005: elementAt(3) is out of range.
```

`elementAt(index)` asked for a position the sequence does not reach — the index
is negative, or at least the number of elements. Both sequences throw it.

Use `elementAtOrNull(index)` where a short sequence is expected.

## FULCRO1006

```text
Error: FULCRO1006: chunk(0) needs a positive integer: a chunk of no elements would never end the sequence.
```

`chunk(size)` was given a size that is not a whole number of at least one. Both
sequences throw it, at the call.

## FULCRO1007

```text
Error: FULCRO1007: median() was called on an empty sequence.
```

An operation that needs at least one element found none. Thrown by `minBy()`,
`maxBy()`, `median()`, `percentile()` and `standardDeviation()` of a
`Sequence`, and by `first()` and `last()` of an `AsyncSequence`; the message
names which.

Check `any()` first, or use the `…OrNull` form where one exists.

## FULCRO1008

```text
Error: FULCRO1008: windowed(0) needs a positive integer.
```

`windowed(size)` of a `Sequence` was given a size that is not a whole number of
at least one.

## FULCRO1009

```text
Error: FULCRO1009: percentile(120) takes a rank between 0 and 100.
```

`percentile(rank)` was given a rank outside 0 to 100, or one that is not a
finite number.

## FULCRO1010

```text
Error: FULCRO1010: sampleStandardDeviation() needs at least two elements: a sample of one says nothing about its spread.
```

`sampleStandardDeviation()` of a `Sequence` divides by one less than the count,
which is zero for a single element.

Use `standardDeviation()` if the elements are the whole population rather than
a sample of it.

## FULCRO1011

```text
Error: FULCRO1011: range() takes integers.
```

`SequenceCollection.range(start, count)` was given a start or a count with a
fractional part.

## FULCRO1012

```text
Error: FULCRO1012: range() cannot produce a negative count.
```

`SequenceCollection.range(start, count)` was given a negative count.

## FULCRO1013

```text
Error: FULCRO1013: repeat() takes an integer count.
```

`SequenceCollection.repeat(value, count)` was given a count with a fractional
part.

## FULCRO1014

```text
Error: FULCRO1014: repeat() cannot produce a negative count.
```

`SequenceCollection.repeat(value, count)` was given a negative count.

## FULCRO1015

```text
TypeError: FULCRO1015: cast('Order') found a string at index 4.
```

`cast()` met an element that is not of the type it was asked for. It stops at
the first one, and the message says where it is and what it was instead. Both
sequences throw it; the asynchronous one throws when that element arrives,
without reading the rest.

Use `ofType()` to skip what does not fit instead of refusing it.

## FULCRO1016

```text
Error: FULCRO1016: ofType<T>() was not resolved at compile time. …
```

`ofType<T>()` or `cast<T>()` was written with a type argument and reached
runtime without one. Either the `@fulcro/collections` transformer did not run
over the file, or `T` has nothing to test for at runtime — an interface, for
example, leaves no trace.

Wire up the transformer (see [Sequences](../sequences.md)), or pass a class, a
`typeof` name, or a predicate to `where()`.

## FULCRO1017

```text
Error: FULCRO1017: selectAwait() needs a positive integer concurrency, and was given 0.
```

An `…Await` operator of an `AsyncSequence` was given a `concurrency` that is not
a whole number of at least one. See [Bounded concurrency](../concurrency.md).

## FULCRO1018

```text
Error: FULCRO1018: Collection factories were not registered. …
```

The library was loaded without its entry point running, so the classes behind
`groupBy()` and `orderBy()` were never wired in. It happens when a file is
imported from inside the package rather than through `@fulcro/collections`, or
when a bundler drops the entry point as free of side effects.

Import from `@fulcro/collections` or `@fulcro/collections/async`.

## FULCRO1019

```text
Error: FULCRO1019: average() needs at least one element.
```

An operation of an `AsyncSequence` that needs at least one element found none:
`average()`, `standardDeviation()`, `min()`, `max()`, `minBy()` or `maxBy()`.
The message names which.

## FULCRO1020

```text
Error: FULCRO1020: single() found no element.
```

`single()` of an `AsyncSequence` promises exactly one element, and found none.

Use `singleOrNull()` where none is an acceptable answer.

## FULCRO1021

```text
Error: FULCRO1021: toMap() found two elements with the key 7.
```

`toMap()` of an `AsyncSequence` produced the same key for two elements. See
[FULCRO1002](#fulcro1002), its synchronous counterpart.

## FULCRO1022

```text
Error: FULCRO1022: sampleStandardDeviation() needs at least two elements: a sample of one says nothing about the spread it was drawn from.
```

`sampleStandardDeviation()` of an `AsyncSequence`, for the reason given under
[FULCRO1010](#fulcro1010).

## FULCRO1023

```text
Error: FULCRO1023: windowed() takes a positive integer size.
```

`windowed(size)` of an `AsyncSequence` was given a size that is not a whole
number of at least one.

## FULCRO1024

```text
Error: FULCRO1024: single() found more than one element.
```

`single()` or `singleOrNull()` of an `AsyncSequence` found a second element.
See [FULCRO1004](#fulcro1004).
