# FULCRO1xxx — `@fulcro/collections`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO1xxx.md)

Os erros das [sequências](../../sequences.md) e das
[sequências assíncronas](../../async-sequences.md). Voltar para
[todos os códigos](../errors.md).

A maioria deles é uma pergunta feita a uma sequência que não tinha como
respondê-la: o primeiro elemento de nada, o único elemento de vários. Cada um
tem uma forma que devolve `null` em vez de lançar — use-a quando uma sequência
vazia for um resultado normal, e não um engano.

## FULCRO1001

```text
Error: FULCRO1001: Sequence contains no elements
```

Detalhes:

```text
{ operation: string }
```

`first()`, `last()`, `average()`, `min()` ou `max()` de uma `Sequence` não
encontrou nada com que responder — a sequência estava vazia, ou nada atendeu ao
predicado.

Use `firstOrNull()` ou `lastOrNull()` onde um resultado vazio for esperado, ou
verifique `any()` antes.

## FULCRO1002

```text
Error: FULCRO1002: An item with the same key has already been added.
```

Detalhes:

```text
{ operation: string }
```

`toMap()` de uma `Sequence` produziu a mesma chave para dois elementos. Um map
guarda um valor por chave, e manter qualquer um dos dois em silêncio perderia o
outro.

Torne a chave única, ou use `toLookup()` ou `groupBy()`, que guardam todos os
elementos sob a sua chave.

## FULCRO1003

```text
Error: FULCRO1003: single() found no element matching the condition.
```

Detalhes:

```text
{ operation: string }
```

`single()` de uma `Sequence` promete exatamente um elemento, e não encontrou
nenhum.

Use `singleOrNull()` onde nenhum for uma resposta aceitável.

## FULCRO1004

```text
Error: FULCRO1004: single() found more than one element matching the condition.
```

Detalhes:

```text
{ operation: string }
```

`single()` ou `singleOrNull()` de uma `Sequence` encontrou um segundo elemento.
Os dois recusam: "o único" entre dois não é uma pergunta que tenha resposta.

Use `first()` se qualquer um servir, ou restrinja o predicado.

## FULCRO1005

```text
Error: FULCRO1005: elementAt(3) is out of range.
```

Detalhes:

```text
{ operation: string; index: number }
```

`elementAt(index)` pediu uma posição que a sequência não alcança — o índice é
negativo, ou é pelo menos o número de elementos. As duas sequências lançam este
erro.

Use `elementAtOrNull(index)` onde uma sequência curta for esperada.

## FULCRO1006

```text
Error: FULCRO1006: chunk(0) needs a positive integer: a chunk of no elements would never end the sequence.
```

Detalhes:

```text
{ operation: string; size: number }
```

`chunk(size)` recebeu um tamanho que não é um número inteiro de pelo menos um.
As duas sequências lançam este erro, na chamada.

## FULCRO1007

```text
Error: FULCRO1007: median() was called on an empty sequence.
```

Detalhes:

```text
{ operation: string }
```

Uma operação que precisa de pelo menos um elemento não encontrou nenhum.
Lançado por `minBy()`, `maxBy()`, `median()`, `percentile()` e
`standardDeviation()` de uma `Sequence`, e por `first()` e `last()` de uma
`AsyncSequence`; a mensagem diz qual.

Verifique `any()` antes, ou use a forma `…OrNull` onde ela existir.

## FULCRO1008

```text
Error: FULCRO1008: windowed(0) needs a positive integer.
```

Detalhes:

```text
{ operation: string; size: number }
```

`windowed(size)` de uma `Sequence` recebeu um tamanho que não é um número
inteiro de pelo menos um.

## FULCRO1009

```text
Error: FULCRO1009: percentile(120) takes a rank between 0 and 100.
```

Detalhes:

```text
{ operation: string; rank: number }
```

`percentile(rank)` recebeu uma posição fora de 0 a 100, ou uma que não é um
número finito.

## FULCRO1010

```text
Error: FULCRO1010: sampleStandardDeviation() needs at least two elements: a sample of one says nothing about its spread.
```

Detalhes:

```text
{ operation: string }
```

`sampleStandardDeviation()` de uma `Sequence` divide por um a menos que a
contagem, o que dá zero para um único elemento.

Use `standardDeviation()` se os elementos forem a população inteira, e não uma
amostra dela.

## FULCRO1011

```text
Error: FULCRO1011: range() takes integers.
```

Detalhes:

```text
{ operation: string }
```

`SequenceCollection.range(start, count)` recebeu um início ou uma contagem com
parte fracionária.

## FULCRO1012

```text
Error: FULCRO1012: range() cannot produce a negative count.
```

Detalhes:

```text
{ operation: string }
```

`SequenceCollection.range(start, count)` recebeu uma contagem negativa.

## FULCRO1013

```text
Error: FULCRO1013: repeat() takes an integer count.
```

Detalhes:

```text
{ operation: string }
```

`SequenceCollection.repeat(value, count)` recebeu uma contagem com parte
fracionária.

## FULCRO1014

```text
Error: FULCRO1014: repeat() cannot produce a negative count.
```

Detalhes:

```text
{ operation: string }
```

`SequenceCollection.repeat(value, count)` recebeu uma contagem negativa.

## FULCRO1015

```text
TypeError: FULCRO1015: cast('Order') found a string at index 4.
```

Detalhes:

```text
{ operation: string; expected: string; found: string; index: number }
```

`cast()` encontrou um elemento que não é do tipo pedido. Ele para no primeiro, e
a mensagem diz onde ele está e o que ele era. As duas sequências lançam este
erro; a assíncrona lança quando esse elemento chega, sem ler o resto.

Use `ofType()` para pular o que não se encaixa, em vez de recusar.

## FULCRO1016

```text
Error: FULCRO1016: ofType<T>() was not resolved at compile time. …
```

Detalhes:

```text
{ operation: string }
```

`ofType<T>()` ou `cast<T>()` foi escrito com um argumento de tipo e chegou ao
runtime sem ele. Ou o transformer do `@fulcro/collections` não rodou sobre o
arquivo, ou `T` não tem nada que possa ser testado em runtime — uma interface,
por exemplo, não deixa rastro.

Configure o transformer (veja [Sequências](../../sequences.md)), ou passe uma
classe, um nome de `typeof` ou um predicado para `where()`.

## FULCRO1017

```text
Error: FULCRO1017: selectAwait() needs a positive integer concurrency, and was given 0.
```

Detalhes:

```text
{ operation: string; concurrency: number }
```

Um operador `…Await` de uma `AsyncSequence` recebeu uma `concurrency` que não é
um número inteiro de pelo menos um. Veja
[Concorrência limitada](../../concurrency.md).

## FULCRO1018

```text
Error: FULCRO1018: Collection factories were not registered. …
```

Detalhes:

```text
{ operation: string }
```

A biblioteca foi carregada sem que o seu ponto de entrada rodasse, então as
classes por trás de `groupBy()` e `orderBy()` nunca foram conectadas. Isso
acontece quando um arquivo é importado de dentro do pacote em vez de por
`@fulcro/collections`, ou quando um bundler descarta o ponto de entrada por
considerá-lo livre de efeitos colaterais.

Importe de `@fulcro/collections` ou de `@fulcro/collections/async`.

## FULCRO1019

```text
Error: FULCRO1019: average() needs at least one element.
```

Detalhes:

```text
{ operation: string }
```

Uma operação de uma `AsyncSequence` que precisa de pelo menos um elemento não
encontrou nenhum: `average()`, `standardDeviation()`, `min()`, `max()`,
`minBy()` ou `maxBy()`. A mensagem diz qual.

## FULCRO1020

```text
Error: FULCRO1020: single() found no element.
```

Detalhes:

```text
{ operation: string }
```

`single()` de uma `AsyncSequence` promete exatamente um elemento, e não
encontrou nenhum.

Use `singleOrNull()` onde nenhum for uma resposta aceitável.

## FULCRO1021

```text
Error: FULCRO1021: toMap() found two elements with the key 7.
```

Detalhes:

```text
{ operation: string; key: string }
```

`toMap()` de uma `AsyncSequence` produziu a mesma chave para dois elementos.
Veja [FULCRO1002](#fulcro1002), o equivalente síncrono.

## FULCRO1022

```text
Error: FULCRO1022: sampleStandardDeviation() needs at least two elements: a sample of one says nothing about the spread it was drawn from.
```

Detalhes:

```text
{ operation: string }
```

`sampleStandardDeviation()` de uma `AsyncSequence`, pelo motivo explicado em
[FULCRO1010](#fulcro1010).

## FULCRO1023

```text
Error: FULCRO1023: windowed() takes a positive integer size.
```

Detalhes:

```text
{ operation: string }
```

`windowed(size)` de uma `AsyncSequence` recebeu um tamanho que não é um número
inteiro de pelo menos um.

## FULCRO1024

```text
Error: FULCRO1024: single() found more than one element.
```

Detalhes:

```text
{ operation: string }
```

`single()` ou `singleOrNull()` de uma `AsyncSequence` encontrou um segundo
elemento. Veja [FULCRO1004](#fulcro1004).
