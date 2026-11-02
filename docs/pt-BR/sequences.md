# Sequências

🇺🇸 English: [Read this documentation in English](../sequences.md)

Consultas sobre arrays, sets, maps e generators com operadores combináveis que
só fazem o trabalho que você realmente pede.

```sh
npm install @fulcro/collections
```

```ts
import { SequenceCollection } from '@fulcro/collections';
```

## A versão de trinta segundos

```ts
const topEmails = SequenceCollection.from(users)
	.where((user) => user.active)
	.orderBy((user) => user.lastName)
	.thenByDescending((user) => user.createdAt)
	.select((user) => user.email)
	.take(10)
	.toArray();
```

Lê como uma consulta, e se comporta como uma: nada roda até `toArray()` pedir.

## A avaliação preguiçosa é o ponto todo

Montar uma cadeia **não faz trabalho nenhum**:

```ts
const query = SequenceCollection.from(orders).where(expensive); // nada rodou
```

O trabalho acontece quando algo a consome — `toArray()`, um operador escalar, ou
um laço `for...of`. E só o tanto que for preciso:

```ts
query.first(); // para no primeiro que bate, quantos pedidos houver
```

Num array de um milhão de elementos filtrado até sobrar um punhado, `first()`
pode olhar três elementos. Uma implementação ansiosa olha um milhão e depois
joga fora 999.999 resultados.

Pelo mesmo motivo, funciona sobre fontes infinitas:

```ts
const naturals = function* () {
	for (let n = 0; ; n++) yield n;
};

SequenceCollection.from(naturals())
	.where((n) => n % 7 === 0)
	.take(5)
	.toArray(); // [0, 7, 14, 21, 28]
```

### Quais operadores rodam na hora

Tudo o que devolve um valor em vez de uma sequência: `toArray`, `count`, `sum`,
`first`, `any`, `aggregate`, `forEach` e o resto da coluna da direita na
[referência](#referência) abaixo.

### Uma sequência de `where` e `select` é um laço só

Chamadas adjacentes de `where` e `select`, em qualquer ordem e em qualquer
quantidade, são percorridas por um único laço sobre a fonte, e não por um
gerador por chamada. Nada que você possa observar muda: cada predicado e cada
projeção roda as mesmas vezes, e na mesma ordem, elemento por elemento, que
rodaria estágio por estágio, e parar antes ainda fecha a fonte. O que some é o
custo de retomar mais um gerador para cada elemento em cada estágio. Qualquer
outro operador no meio — `orderBy`, `take`, `distinct` — começa uma nova
sequência fundida.

## Criando uma sequência

```ts
SequenceCollection.from(anything); // array, Set, Map, string, generator…
SequenceCollection.empty<T>();
SequenceCollection.range(1, 100); // 1..100
SequenceCollection.repeat('x', 3); // 'x', 'x', 'x'
```

`range` e `repeat` geram à medida que são lidos, então um milhão de qualquer um
dos dois não custa nada até alguém pedir — e os dois sabem informar a contagem
sem gerar nada.

## Acesso por índice

Uma sequência é lida por posição, como um array:

```ts
const sequence = SequenceCollection.from([10, 20, 30]);

sequence[1]; // 20
sequence[9]; // undefined
```

Quem atende é um `Proxy`. Numa sequência sobre um array é uma leitura direta;
numa sobre um generator, ela anda até chegar à posição, então `sequence[500]`
custa 501 passos.

## Achando o operador que você quer

### Filtrar e dar forma

```ts
.where((user) => user.active)              // mantém o que bate
.select((user) => user.email)              // transforma cada um
.choose((user) => user.email)              // transforma, descartando o que voltou vazio
.selectMany((order) => order.items)        // achata arrays aninhados
.distinct()                                // descarta duplicatas
.distinctBy((user) => user.email)          // …comparando por uma chave
.ofType('string')                          // mantém um tipo de runtime, estreitando
.cast('string')                            // …ou lança se algum elemento não for
.tap((user) => console.log(user))          // olha, sem consumir
.reverse()
```

#### `choose` — projetar e filtrar numa passada só

Quando a condição e a projeção são o mesmo trabalho, separá-las em
`where().select()` significa fazer esse trabalho duas vezes:

```ts
// A busca roda duas vezes para cada usuário que tem uma conta.
const accounts = users
	.where((user) => findAccount(user) !== null)
	.select((user) => findAccount(user));
```

```ts
// Uma vez.
const accounts = users.choose((user) => findAccount(user));
```

`null` e `undefined` querem dizer "nada para este elemento". Todo o resto é
mantido, **inclusive `0`, `''` e `false`** — são respostas, e uma projeção que
queira descartá-los tem de dizer isso. O tipo do resultado perde a
nulabilidade: `choose` sobre um `string | null` dá um `Sequence<string>`.

#### `ofType` e `cast` — a mesma pergunta, duas respostas

Os dois estreitam uma sequência mista para um tipo só. A diferença está no que
fazem com um elemento que não se encaixa, e essa diferença é o motivo de existirem
os dois:

```ts
const values = SequenceCollection.from<unknown>(['a', 7, 'b']);

values.ofType('string').toArray(); // ['a', 'b'] — o 7 é pulado
values.cast('string').toArray(); // lança no 7
```

Use `ofType` quando se **espera** que a sequência seja mista, e `cast` quando um
elemento de outro tipo quer dizer que os dados estão errados e o silêncio seria
o pior desfecho. O erro diz o que encontrou e onde:

```text
TypeError: FULCRO1015: cast('string') found a number at index 1.
```

Os dois aceitam um nome de `typeof` ou uma classe, e os dois estreitam o tipo sem
um cast escrito à mão:

```ts
.ofType('string')    .ofType('number')    .ofType('object')
.ofType(Date)        .cast(Order)
```

Uma discordância deliberada com a linguagem: `ofType('object')` **não** aceita
`null`, embora `typeof null` seja `'object'`. Uma sequência estreitada para
objetos que depois lança ao ler uma propriedade seria uma armadilha.

#### Escrevendo o tipo como um tipo

Com o transformer deste pacote configurado, os dois recebem o tipo diretamente:

```ts
values.ofType<string>(); // Sequence<string>
values.ofType<Admin>(); // Sequence<Admin>
values.cast<Admin>(); // lança no primeiro que não for um
```

Ele resolve o argumento de tipo em tempo de compilação no mesmo token que as
outras formas recebem — `ofType<string>()` é emitido como `ofType('string')`, e
`ofType<Admin>()` como `ofType(Admin)`. Nada muda no runtime.

O plugin é **opcional**, e essa é a diferença em relação ao `@fulcro/reflect`:
todo operador aqui funciona sem ele, e só estas formas sem argumento precisam
dele. Configure do mesmo jeito:

```json
{ "plugins": [{ "transform": "@fulcro/collections/transformer" }] }
```

```ts
// vite.config.ts
import { vite as fulcroCollections } from '@fulcro/collections/unplugin';
```

Os dois podem ficar ao lado do plugin do `@fulcro/reflect`. Cada um reescreve só
as chamadas que consegue rastrear até o seu próprio pacote, e nenhum sabe que o
outro existe.

#### Uma interface também funciona — a verificação é escrita por extenso

Um primitivo vira um nome de `typeof` e uma classe vira o seu construtor. Uma
interface não tem nenhum dos dois, mas ainda tem uma **forma**, e o compilador a
conhece por completo. Então o transformer escreve a verificação por extenso:

```ts
interface Order {
	id: number;
	note?: string;
	tags: string[];
	customer: { email: string };
	status: 'pending' | 'paid';
	placedAt: Date;
}

orders.ofType<Order>();
```

vira, aproximadamente:

```js
orders.ofType({
	name: 'Order',
	matches: (v) =>
		v !== null &&
		typeof v === 'object' &&
		typeof v.id === 'number' &&
		(v.note === undefined || typeof v.note === 'string') &&
		Array.isArray(v.tags) &&
		v.tags.every((e) => typeof e === 'string') &&
		v.customer !== null &&
		typeof v.customer === 'object' &&
		typeof v.customer.email === 'string' &&
		(v.status === 'pending' || v.status === 'paid') &&
		v.placedAt instanceof Date,
});
```

O que faz de `cast<T>()` um **validador para dados não confiáveis, derivado do
próprio tipo**:

```ts
const orders = SequenceCollection.from(await response.json())
	.cast<Order>()
	.toArray();
```

`response.json()` devolve `any`. Essa linha é o último lugar em que os dados não
foram verificados — e o schema é a interface que você já escreveu, então ele não
tem como sair de sincronia com ela do jeito que um schema mantido à mão sai.

Coberto: primitivos, literais, uniões, interseções, objetos e interfaces
aninhados em qualquer profundidade, propriedades opcionais, arrays (todo
elemento, não uma amostra), tuplas de tamanho fixo, classes, e `Date`, `Map`,
`Set`, `RegExp` e afins por `instanceof`.

#### Tipos que contêm a si mesmos

Uma árvore de comentários, uma estrutura de pastas, uma categoria com
subcategorias — são formas comuns, e estão cobertas. Um tipo que se refere a si
mesmo vira uma função que chama a si mesma:

```ts
interface Comment {
	id: number;
	text: string;
	replies: Comment[];
}

comments.cast<Comment>();
```

```js
comments.cast(
	(() => {
		const check0 = (r) =>
			r !== null &&
			typeof r === 'object' &&
			typeof r.id === 'number' &&
			typeof r.text === 'string' &&
			Array.isArray(r.replies) &&
			r.replies.every((e) => check0(e));

		return { name: 'Comment', matches: (v) => check0(v) };
	})(),
);
```

A função é construída **uma vez**, onde a chamada está — não por elemento — e
não acrescenta nenhum nome ao seu escopo. Ciclos que passam por um segundo tipo
funcionam do mesmo jeito: `Author` com `Post[]` com um `Author` é um ciclo só e
ganha uma função só.

Ela desce pelo valor inteiro, então uma resposta quatro níveis abaixo com um
campo errado é recusada como qualquer outra. A profundidade que ela aguenta é a
que a pilha de chamadas do seu runtime aguenta, o que para árvores realistas não
é um limite que você vá encontrar.

**Propriedades a mais são aceitas**, porque a tipagem estrutural as aceita. Um
objeto com mais do que `Order` exige continua sendo um `Order`, e recusá-lo faria
isto discordar do compilador que o produziu.

#### O que ele recusa, e por que esse é o ponto

Uma verificação que responde "sim" para a coisa errada é pior do que nenhuma
verificação: é falsa confiança justamente onde os dados são menos confiáveis.
Então tudo o que o transformer não consegue escrever por completo, ele recusa —
não há nele nenhuma verificação parcial ou otimista.

Recusados: assinaturas de índice, genéricos não resolvidos e uma classe trazida
com `import type`, que é apagada antes que o código emitido pudesse
referenciá-la.

```text
Error: FULCRO1016: ofType<T>() was not resolved at compile time. Either the
@fulcro/collections transformer did not run over this file, or T has no runtime
representation — an interface leaves nothing to test for, so pass a class, a
typeof name, or use where() with a predicate.
```

A mensagem cita as duas causas de propósito: de dentro do programa rodando elas
não se distinguem, e adivinhar entre elas seria pior do que dizer isso. Ela lança
quando a cadeia é **montada**, não quando é lida pela primeira vez — uma chamada
que nunca foi resolvida é um build mal configurado, não dados errados.

Para um tipo recusado, escreva a verificação você mesmo e passe-a com a mesma
forma:

```ts
values.ofType<Tree>({
	name: 'Tree',
	matches: (v) => isTree(v),
});
```

#### Quanto custa

Uma verificação de forma é **O(tamanho do valor)** por elemento, não uma
constante: todo campo de todo registro, e todo elemento de todo array dentro
dele. É o preço honesto de verificar de fato, e em cem mil registros com itens
aninhados é trabalho de verdade — medido em mais ou menos o que custa a mesma
verificação escrita à mão, que é o máximo que se pode pedir dela.

Ela para na primeira cláusula que falha, e é preguiçosa como todo o resto, então
`cast<Order>().take(5)` valida cinco registros em vez de todos.

### Pegando uma fatia

```ts
.take(10)          .takeLast(10)     .takeWhile((n) => n < 100)
.skip(10)          .skipLast(10)     .skipWhile((n) => n < 100)
.chunk(100)        // arrays de 100
.windowed(3)       // trechos sobrepostos de 3
.pairwise()        // cada elemento com o anterior
```

`takeWhile` para no primeiro elemento que falha — diferente de `where`, que
manteria um que batesse depois.

### Ordenação

```ts
.orderBy((user) => user.lastName)
.thenByDescending((user) => user.createdAt)
.topBy((user) => user.score, 10)   // os 10 melhores, sem ordenar o resto
```

Os critérios secundários só são consultados quando os anteriores empatam. A
ordenação extrai cada chave **uma vez por elemento**, não duas vezes por
comparação, o que em cem mil registros é a diferença entre 100.000 e 1.700.000
chamadas à sua projeção.

### Agrupamento

```ts
.groupBy((order) => order.customerId)      // todos os pedidos por cliente
.groupAdjacent((line) => line.level)       // trechos de chaves iguais consecutivas
.countBy((order) => order.status)          // Map<status, contagem>
.toLookup((order) => order.customerId)     // Map<id, pedidos[]>
```

`groupBy` reúne uma chave onde quer que ela apareça; `groupAdjacent` começa um
grupo novo toda vez que a chave muda, e só guarda o trecho em mãos. Use o segundo
para dados que já estão em ordem — linhas de log, leituras por dia.

Um `Group<K, T>` é uma sequência completa com uma `key`, então os operadores se
encadeiam nele:

```ts
.groupBy((order) => order.customerId)
.select((group) => ({ id: group.key, total: group.sum((o) => o.amount) }))
```

### Combinando duas sequências

```ts
.concat(more)                    // tudo das duas
.union(more)                     // as duas, sem duplicatas
.intersect(more)                 // só o que está nas duas
.except(exclusions)              // o que não está na outra
.zip(names, (id, name) => …)     // em pares, parando na mais curta
```

Cada um tem uma contraparte `*By` que recebe um seletor de chave — `unionBy`,
`exceptBy`, `intersectBy` — que costuma ser o que você quer com registros.

### Junções

```ts
// Um resultado por par que bate, como um inner join de SQL.
.join(customers, (o) => o.customerId, (c) => c.id, (o, c) => ({ …o, c }))

// Um resultado por elemento externo, com os que batem como um grupo — um left join.
.groupJoin(orders, (c) => c.id, (o) => o.customerId, (c, theirs) => …)
```

A sequência interna é indexada uma vez, não uma vez por elemento externo.

### Pegando um elemento só

```ts
.first()            .firstOrNull()       // lança / null quando vazia
.last()             .lastOrNull()
.single()           .singleOrNull()      // exatamente um, ou é um erro
.elementAt(5)       .elementAtOrNull(5)
```

`single` difere de `first` de propósito: um segundo que bate é um problema tanto
quanto nenhum. `singleOrNull` ainda lança com dois — uma resposta ambígua é um
defeito da consulta, não uma ausência a tolerar.

### Fazendo uma pergunta

```ts
.any()                          .any((o) => o.total > 100)
.all((o) => o.paid)
.contains(order)
.count()                        .count((o) => o.paid)
.sequenceEqual(other)
```

`count()` muitas vezes responde **sem percorrer** — um array sabe o seu tamanho,
e esse conhecimento sobrevive a `select`, `take`, `skip`, `concat`, `chunk` e
outros.

### Números

```ts
.sum((o) => o.total)         .average((o) => o.total)
.min((o) => o.total)         .max((o) => o.total)
.minBy((o) => o.total)       .maxBy((o) => o.total)   // o registro, não o valor
.median((o) => o.total)      .percentile(95, (o) => o.total)
.standardDeviation((o) => o.total)
.sampleStandardDeviation((o) => o.total)
```

`min` dá o menor número; `minBy` dá o **pedido que o trazia**, que costuma ser o
que você queria.

Os dois desvios-padrão são nomes separados em vez de um só com uma flag. Eles
dividem por `n` e por `n - 1`, as respostas divergem mais justamente quando os
dados são poucos, e um padrão silencioso estaria errado metade das vezes. Use a
forma populacional para o conjunto inteiro, e a amostral para uma amostra tirada
de algo maior.

### Acumulando

```ts
.aggregate(0, (total, o) => total + o.amount)   // um valor final
.scan(0, (total, o) => total + o.amount)        // todo valor parcial
```

`scan` é o `aggregate` que mostra as contas — um saldo depois de cada transação,
em vez de só o último. Ele emite um valor por elemento, então fica do mesmo
tamanho da sua fonte e pode ser combinado com ela por `zip`.

### Dividindo numa passada só

```ts
const [active, archived] = users.partition((user) => user.active);
```

Duas chamadas a `where` leem a fonte duas vezes. Esta lê uma vez — o que um
generator não aguentaria de outro jeito, e o que corta pela metade o trabalho de
um predicado caro.

### Materializando

```ts
.toArray()      .toSet()
.toMap((u) => u.id)        // recusa uma chave duplicada
.toLookup((u) => u.team)   // reúne as duplicatas em vez disso
```

## A única coisa que vai te surpreender

Uma sequência sobre um **generator** — ou qualquer outra fonte de uma passada só
— não produz nada numa segunda travessia. Em silêncio, porque um iterador
esgotado não se distingue de um vazio:

```ts
const query = SequenceCollection.from(rows()).select(expensive);

query.count(); // lê o generator
query.toArray(); // [] — o generator acabou
```

Uma cadeia percorrida duas vezes também roda as suas projeções duas vezes, o que
não é problema até a projeção ser um parse ou uma requisição.

`memoize` resolve as duas coisas:

```ts
const kept = query.memoize();

kept.count(); // lê uma vez
kept.toArray(); // toda linha, e `expensive` nunca rodou de novo
```

Os elementos são lembrados à medida que são lidos, então o custo é memória — e
pago só pela parte que você de fato consumiu.

**Arrays não são afetados.** Isto só pega generators, iteradores e qualquer outra
coisa que só pode ser percorrida uma vez.

## Cenários reais

### Uma lista dos dez maiores a partir de um array grande

```ts
const busiest = SequenceCollection.from(orders)
	.groupBy((order) => order.customerId)
	.select((group) => ({ id: group.key, orders: group.count() }))
	.topBy((row) => row.orders, 10)
	.toArray();
```

`topBy` responde exatamente o que `orderByDescending(...).take(10)` responde — os
mesmos elementos, na mesma ordem, com os empates desfeitos do mesmo jeito — sem
ordenar a parte que vai jogar fora. Ele mantém uma janela com os dez melhores
vistos até agora, então cada elemento custa uma comparação contra o mais fraco
deles.

Em cem mil registros pedindo dez, medido: **201.400 comparações de chave para o
`topBy` contra 4.532.640 para a ordenação**, um fator de 22. O custo por elemento
não cresce com quantos você pede, e é por isso que a janela pode ser de mil quase
pelo mesmo preço de uma.

Use a ordenação quando quiser tudo ordenado; use `topBy` quando você só queria a
cabeça.

### Paginação

```ts
const onPage = SequenceCollection.from(results)
	.where((row) => row.region === region)
	.orderByDescending((row) => row.score)
	.skip(page * size)
	.take(size)
	.toArray();
```

### Gravando em lotes

```ts
SequenceCollection.from(rows)
	.chunk(500)
	.forEach((batch) => database.insertMany(batch));
```

### Detectando lacunas numa série

```ts
const gaps = SequenceCollection.from(readings)
	.orderBy((reading) => reading.takenAt)
	.pairwise()
	.where(([before, after]) => after.takenAt - before.takenAt > threshold)
	.toArray();
```

### Separando válidos de inválidos, uma vez

```ts
const [valid, invalid] = SequenceCollection.from(rows).partition(isValid);

await save(valid.toArray());
report(invalid.count());
```

## Uma nota para a configuração do bundler

Este pacote **não** é livre de efeitos colaterais e não se declara assim. Os seus
barrels rodam uma etapa de composição ao carregar, que liga as classes concretas
de grupo e de sequência ordenada a um registro de fábricas. Um bundler instruído
a tratá-lo como livre de efeitos colaterais descartaria essa etapa, e `groupBy`,
`orderBy` e `orderByDescending` falhariam em runtime.

Não é preciso configurar nada — só não acrescente um override.

## Tipos

Os contratos vêm como interfaces — `Sequence<T>`, `OrderedSequence<T>`,
`Group<K, T>` — ao lado dos tipos de delegate que os operadores recebem
(`Predicate`, `Selector`, `Comparer`, `Action`, `ResultSelector`,
`Accumulator`). Prefira-os às classes concretas nas suas próprias assinaturas:

```ts
const activeUsers = (users: Sequence<User>): Sequence<User> => users.where((user) => user.active);
```

## Referência

| Adiados                                                   | Imediatos                                             |
| --------------------------------------------------------- | ----------------------------------------------------- |
| `where` `select` `selectMany`                             | `first` `firstOrNull` `last` `lastOrNull`             |
| `take` `skip` `takeWhile` `skipWhile`                     | `single` `singleOrNull` `elementAt` `elementAtOrNull` |
| `takeLast` `skipLast` `chunk` `windowed`                  | `count` `countBy` `any` `all` `contains`              |
| `distinct` `distinctBy` `reverse`                         | `sum` `average` `min` `max` `minBy` `maxBy`           |
| `union` `unionBy` `intersect` `intersectBy`               | `median` `percentile` `standardDeviation`             |
| `except` `exceptBy` `concat` `zip`                        | `sampleStandardDeviation` `sequenceEqual`             |
| `append` `prepend` `defaultIfEmpty`                       | `toArray` `toMap` `toLookup` `toSet`                  |
| `join` `groupJoin` `groupBy` `groupAdjacent`              | `forEach` `aggregate` `partition`                     |
| `orderBy` `orderByDescending` `scan` `pairwise` `memoize` |                                                       |

Estáticos: `from`, `empty`, `range`, `repeat`. Num `OrderedSequence`: `thenBy`,
`thenByDescending`.

## Próximos

- [Sequências assíncronas](./async-sequences.md) — os mesmos operadores sobre
  dados que chegam com o tempo.
- [Concorrência limitada](./concurrency.md) — rodando vários elementos ao mesmo
  tempo.
