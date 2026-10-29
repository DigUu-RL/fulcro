# Sequências assíncronas

🇺🇸 English: [Read this documentation in English](../async-sequences.md)

Consultas sobre dados que chegam com o tempo — páginas de uma API, linhas de um
arquivo, registros de um cursor — com os mesmos operadores que você já conhece de
[`Sequence`](./sequences.md).

```sh
npm install @fulcro/collections
```

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
```

Fica atrás do seu próprio subpath, para que um bundle que importa só a sequência
síncrona não carregue nada dela.

## A versão de trinta segundos

```ts
const recentAdmins = await AsyncSequenceCollection.from(fetchUserPages())
	.where((user) => user.role === 'admin')
	.select((user) => user.email)
	.take(10)
	.toArray();
```

Se você já usou a sequência síncrona, já conhece esta. **Uma regra cobre a
superfície inteira:**

- Os operadores que devolviam uma `Sequence` agora devolvem uma `AsyncSequence`,
  e mantêm os seus nomes.
- Os operadores que devolviam um valor agora devolvem uma `Promise` dele, e
  mantêm os seus nomes.

Não existe `toArrayAsync`, nem `whereAsync`. O `await` é a única coisa que muda
na chamada.

## De onde vêm os elementos

`from` aceita três formas, e raramente você precisa pensar em qual:

```ts
// Algo que produz com o tempo.
AsyncSequenceCollection.from(streamRows());

// Um array ou generator comum, levado para o mundo assíncrono.
AsyncSequenceCollection.from([1, 2, 3]);

// Um array de promises — a forma `ids.map(load)`.
AsyncSequenceCollection.from(ids.map((id) => loadUser(id)));
```

Um async generator costuma ser como a primeira é escrita:

```ts
async function* fetchUserPages(): AsyncGenerator<User> {
	let cursor: string | undefined;

	do {
		const page = await api.users({ cursor });

		yield* page.items;

		cursor = page.next;
	} while (cursor !== undefined);
}
```

Nada nessa função roda até algo consumir a sequência, e ela deixa de ser chamada
no momento em que o consumidor para de pedir.

## Suas funções podem ser síncronas ou assíncronas — as duas funcionam

Toda projeção, predicado e ação aceita qualquer uma:

```ts
.where((user) => user.active)          // tudo certo
.where(async (user) => isAllowed(user)) // também certo
```

Você nunca embrulha nada, e não há um segundo nome de operador para lembrar.

## Nada roda até você pedir, e nada roda adiantado

Duas propriedades que vale conhecer, porque são elas que tornam isto utilizável
em dados grandes demais para segurar.

**Adiado.** Montar uma cadeia não lê nada:

```ts
const query = AsyncSequenceCollection.from(rows()).select(parse); // nenhum I/O ainda

const parsed = await query.toArray(); // agora lê
```

**Contrapressão.** Um elemento é puxado, processado, e só então o próximo é
pedido. Um arquivo sendo lido em stream nunca fica em buffer à frente do código
que o lê.

E um operador que já tem o que precisa para de puxar — o que é a diferença entre
terminar e travar numa fonte sem fim:

```ts
// `liveEvents()` nunca termina. Isto ainda assim retorna.
const firstTen = await AsyncSequenceCollection.from(liveEvents()).take(10).toArray();
```

## Cenários reais

### Paginando uma API sem segurar todas as páginas

```ts
const emails = await AsyncSequenceCollection.from(fetchUserPages())
	.where((user) => user.active)
	.select((user) => user.email)
	.toArray();
```

Fica uma página na memória de cada vez, quantas houver.

### Lendo um arquivo grande linha a linha

```ts
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';

const lines = createInterface({
	input: createReadStream('access.log'),
	crlfDelay: Number.POSITIVE_INFINITY,
});

const errors = await AsyncSequenceCollection.from(lines)
	.where((line) => line.includes(' 500 '))
	.take(100)
	.toArray();
```

O `readline` já é um async iterable, então entra direto. A leitura para depois do
centésimo erro, e não no fim do arquivo.

### Gravando em lotes

```ts
await AsyncSequenceCollection.from(streamRows())
	.select(normalize)
	.chunk(500)
	.forEach((batch) => database.insertMany(batch));
```

`chunk` é como um stream vira lotes sem que o stream seja reunido antes.

### Um total corrente à medida que os valores chegam

```ts
const balances = AsyncSequenceCollection.from(transactions()).scan(
	0,
	(balance, entry) => balance + entry.amount,
);

for await (const balance of balances) render(balance);
```

## Cancelando

Todo terminal aceita um `AbortSignal`:

```ts
const controller = new AbortController();

setTimeout(() => controller.abort(), 5_000);

const users = await AsyncSequenceCollection.from(fetchUserPages()).toArray({
	signal: controller.signal,
});
```

**O que o abort faz, e o que ele não consegue fazer.** Uma promise não tem
cancelamento — é um fato do JavaScript, não uma lacuna aqui. Então abortar faz
exatamente duas coisas:

1. Nenhum elemento a mais é puxado.
2. A promise que você está aguardando é rejeitada com o motivo do signal.

O trabalho que já está em andamento continua até o fim; o resultado dele é
descartado. Se você esperava que `abort()` matasse uma requisição no meio, ele
não mata — a não ser que o próprio trabalho receba um signal, e nesse caso passe
o mesmo e ele mata:

```ts
.select((id) => fetch(`/users/${id}`, { signal: controller.signal }))
```

O signal fica no terminal em vez de no `from`, o que quer dizer que a mesma
sequência pode ser consumida duas vezes sob signals diferentes.

`AbortSignal.timeout(5_000)` é um atalho para o controller acima.

## O que muda em relação à sequência síncrona

|                       | `Sequence`          | `AsyncSequence`             |
| --------------------- | ------------------- | --------------------------- |
| Consumida com         | `for...of`          | `for await...of`            |
| Os terminais devolvem | o valor             | uma `Promise` dele          |
| Acesso por índice     | `sequence[5]`       | `elementAtOrNull(5)`        |
| `count()`             | muitas vezes `O(1)` | sempre percorre             |
| Cancelamento          | —                   | `AbortSignal` nos terminais |

**O acesso por índice some**, e não é descuido: `sequence[5]` teria de devolver
uma promise a partir da leitura de uma propriedade, o que quer dizer algo bem
diferente do que quer dizer na sequência síncrona. `elementAtOrNull(5)` é o
caminho.

**`count()` sempre percorre.** A sequência síncrona muitas vezes responde em
`O(1)` porque um array declara o seu tamanho. Um `AsyncIterable` não declara
nada, então não há o que ler de antemão.

## Operadores

| Adiados                                       | Terminais                                 |
| --------------------------------------------- | ----------------------------------------- |
| `where` `select` `selectMany`                 | `toArray` `toSet` `count`                 |
| `take` `skip` `takeWhile` `skipWhile`         | `any` `all` `contains`                    |
| `takeLast` `skipLast`                         | `first` `firstOrNull` `last` `lastOrNull` |
| `distinct` `distinctBy` `concat`              | `single` `singleOrNull`                   |
| `chunk` `scan` `windowed` `pairwise`          | `elementAt` `elementAtOrNull`             |
| `append` `prepend` `defaultIfEmpty`           | `sum` `average` `min` `max`               |
| `choose` `ofType` `cast` `topBy` `tap`        | `minBy` `maxBy` `sequenceEqual`           |
| `groupAdjacent` `zip`                         | `countBy` `toMap` `toLookup`              |
| `except` `exceptBy` `intersect` `intersectBy` | `standardDeviation`                       |
| `union` `unionBy` `join` `groupJoin`          | `sampleStandardDeviation`                 |
|                                               | `forEach` `aggregate`                     |

Além das formas concorrentes: `selectAwait`, `whereAwait`, `chooseAwait`,
`topByAwait` e o terminal `forEachAwait`.

### O que falta de propósito

Seis operadores da sequência síncrona **não** estão aqui, e a ausência deles é o
desenho, não uma lacuna: `orderBy`, `orderByDescending`, `reverse`, `groupBy`,
`median` e `percentile`.

Todos eles precisam segurar a fonte inteira antes de produzir qualquer coisa.
`orderBy` não consegue emitir um primeiro elemento antes de o último chegar;
`groupBy` não consegue fechar um grupo antes de saber que não vêm mais membros.
Oferecê-los com a mesma forma do resto seria uma armadilha de memória vestida de
operador comum — tudo certo na fixture de um teste, desastroso no feed em
produção.

Quando você os quiser, diga isso em voz alta:

```ts
const sorted = SequenceCollection.from(await stream.toArray()).orderBy((row) => row.name);
```

`toArray()` é onde segurar tudo fica visível, que é exatamente onde isso deve
ficar.

Dois que fazem stream valem ser conhecidos como as respostas para as mesmas
perguntas: **`groupAdjacent`** agrupa elementos consecutivos e fecha um trecho
assim que a chave muda, e **`topBy`** ranqueia sem ordenar, segurando uma janela
em vez do stream.

### Quais deles fazem stream de verdade

A maioria não segura nada além de uma janela. Três merecem destaque.

**`takeLast` não consegue produzir antes de a fonte acabar** — nada sabe quais
são os dez últimos de algo que ainda está chegando. O que ele mantém limitado é
a memória: dez elementos, não o stream. O irmão dele, `skipLast`, _faz_ stream,
liberando um elemento assim que `count` outros chegaram atrás dele.

**As operações de conjunto e as junções leem o argumento primeiro**, inteiro,
antes de produzir qualquer coisa. O que isso limita é a sequência que você
passa, nunca aquela em que você chamou — então um stream fica do lado de fora de
um `join`, e uma coleção de tamanho razoável do lado de dentro.

**`countBy` e `toLookup` crescem com o número de chaves distintas.** Contar por
categoria num feed sem fim tudo bem; contar por identificador, não.

## Validando um stream à medida que ele chega

`cast<T>()` também está aqui, e é aqui que ele mais compensa. Dados não
confiáveis costumam chegar de forma assíncrona — uma API paginada, um arquivo
sendo lido, uma fila — e o caminho síncrono significaria reunir tudo na memória
antes, que é justamente o que este tipo existe para evitar.

```ts
const orders = AsyncSequenceCollection.from(paginatedOrders()).cast<Order>();

for await (const order of orders) {
	// `order` é um `Order`, verificado, uma página de cada vez.
}
```

Ele recusa **no elemento que falhou**, então uma página ruim é pega sem que o
resto do feed seja buscado:

```text
TypeError: FULCRO1015: cast('Order') found a string at index 2.
```

`ofType<T>()` é a mesma verificação usada para filtrar em vez de recusar. Os dois
aceitam um nome de `typeof`, uma classe, um teste que você escreve, ou — com o
transformer do pacote configurado — o próprio tipo, interfaces incluídas. O
relato completo do que é coberto e do que é recusado está em
[sequences.md](./sequences.md#oftype-e-cast--a-mesma-pergunta-duas-respostas); o
comportamento aqui é idêntico.

## `topBy` sobre um stream

Ranquear normalmente quer dizer ordenar, e ordenar quer dizer ter tudo. `topBy`
mantém, em vez disso, uma janela com os `count` melhores vistos até agora, então
o que ele segura é limitado por `count`, e não pelo tamanho do stream:

```ts
const busiest = await AsyncSequenceCollection.from(everyRequest())
	.topBy((request) => request.duration, 10)
	.toArray();
```

Cem mil elementos para um top dez seguram dez. Ele precisa chegar ao fim antes de
responder — nada consegue saber o top dez de um stream que não terminou —
então coloque um `take` na frente de um que não termina.

`topByAwait` extrai várias chaves ao mesmo tempo, para uma chave que precisa ser
buscada em vez de lida. Os empates continuam sendo desfeitos pela **chegada**,
que é registrada antes de as chaves serem extraídas: trabalho concorrente termina
numa ordem que não tem nada a ver com a entrada, e deixar isso decidir faria a
resposta depender de qual busca foi mais rápida.

## `choose` e `tap`

`choose` projeta e filtra numa passada só, aguardando um elemento de cada vez;
`chooseAwait` roda várias projeções ao mesmo tempo. O limite de concorrência
conta as projeções **em andamento**, não os resultados mantidos — descartar um
resultado não libera uma vaga, senão o limite dependeria, em silêncio, de quanto
a projeção descarta.

`tap` observa sem consumir, e **aguarda** a ação antes de passar o elemento
adiante. É de propósito: uma ação que grava em algum lugar deve segurar o stream
onde está, em vez de ficar para trás dos elementos que deveria estar observando.
