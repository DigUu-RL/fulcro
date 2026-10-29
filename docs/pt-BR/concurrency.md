# Concorrência limitada

🇺🇸 English: [Read this documentation in English](../concurrency.md)

Rodar vários elementos ao mesmo tempo em vez de um de cada vez — para trabalho
que passa o tempo esperando.

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';
```

Faz parte das [sequências assíncronas](./async-sequences.md); leia aquela página
antes, se ainda não leu.

## O problema que isto resolve

Isto carrega cem usuários um depois do outro. Se cada requisição leva 100 ms,
leva dez segundos:

```ts
const users = await AsyncSequenceCollection.from(ids).select(loadUser).toArray();
```

Isto carrega oito de cada vez, e leva pouco mais de um segundo:

```ts
const users = await AsyncSequenceCollection.from(ids)
	.selectAwait(loadUser, { concurrency: 8 })
	.toArray();
```

Nada roda _no mesmo instante_ — o JavaScript tem uma thread só. O que se
sobrepõe é a **espera**. Enquanto uma requisição está no ar, as outras também
podem estar.

**Isto não faz nada por um trabalho que não está esperando.** Parsing, hashing,
redimensionamento — qualquer coisa limitada por CPU — não fica mais rápida,
porque nunca houve tempo ocioso para preencher. Isso pede paralelismo de
verdade, que é outra ferramenta.

## Os operadores

```ts
// Projeta vários de cada vez.
.selectAwait(loadUser, { concurrency: 8 })

// Filtra com uma condição que precisa perguntar algo.
.whereAwait(async (id) => hasPermission(id), { concurrency: 8 })

// Projeta e filtra de uma vez, descartando o que voltou vazio.
.chooseAwait((id) => findAccount(id), { concurrency: 8 })

// Ranqueia por uma chave que precisa ser buscada.
.topByAwait((id) => fetchScore(id), 10, { concurrency: 8 })

// Faz algo pelos seus efeitos, sem reunir resultado nenhum.
await rows.forEachAwait((row) => database.insert(row), { concurrency: 4 });
```

O sufixo `Await` é a marca: `select` aguarda um elemento antes de puxar o
próximo, `selectAwait` mantém vários em andamento. Os operadores sem ele não
precisam de nenhuma decisão sua, e é para isso que ficam separados.

## `concurrency` é obrigatório, e isso é de propósito

Não há padrão, e o tipo não deixa você omiti-lo:

```ts
.selectAwait(loadUser, { concurrency: 8 }) // ✓
.selectAwait(loadUser)                     // ✗ não compila
```

Nenhum padrão poderia estar certo:

- **Sem limite** é como se estoura um rate limit e se esgotam os descritores de
  arquivo — e funciona bem em desenvolvimento, onde a entrada é pequena, para
  depois falhar em produção.
- **`1`** tornaria o operador inútil.
- **Qualquer coisa entre os dois** é um palpite sobre um serviço que só você
  conhece.

Um limite que não é um inteiro positivo é recusado **onde você o escreveu**, e
não depois, quando a sequência roda:

```ts
.selectAwait(loadUser, { concurrency: 0 })
// Error: FULCRO1017: selectAwait() needs a positive integer concurrency, and was given 0.
```

### Escolhendo um número

Não há resposta universal, mas há pontos de partida úteis:

| Trabalho                      | Ponto de partida razoável                   |
| ----------------------------- | ------------------------------------------- |
| Uma API que você não controla | O que o rate limit dela permitir, com folga |
| Uma API que você controla     | 10–50                                       |
| Um banco com pool de conexões | No máximo o tamanho do pool                 |
| Ler muitos arquivos           | 10–100                                      |

Se o que você está chamando tem um limite documentado, esse é o seu teto. Se não
tem, comece baixo e suba enquanto observa os erros.

## Ordem

Os resultados voltam **na ordem de entrada, por padrão**:

```ts
const results = await AsyncSequenceCollection.from([1, 2, 3])
	.selectAwait(slowFor, { concurrency: 3 })
	.toArray();
// [1, 2, 3] — qualquer que seja a ordem em que terminaram
```

É o comportamento que se combina bem: um operador no meio de uma cadeia não deve
mudar em silêncio o que um `zip` ou um `pairwise` mais adiante está pareando. Um
elemento lento segura os que vêm atrás dele, embora eles ainda tenham _rodado_ de
forma concorrente — a espera se sobrepõe de qualquer jeito.

Peça a ordem de conclusão quando quiser cada resultado assim que ele existir:

```ts
.selectAwait(loadUser, { concurrency: 8, ordered: false })
```

Útil quando você está renderizando resultados à medida que chegam, ou gravando-os
em algum lugar que não liga para a ordem. Não é útil quando a posição tem
significado.

## Quando algo falha

A sequência é rejeitada com o primeiro erro, e:

1. **Nenhum trabalho novo é iniciado.**
2. **O trabalho já em andamento é aguardado** antes de a rejeição chegar até você.

O segundo ponto não é cortesia — é o que impede que a rejeição de uma tarefa que
ninguém está mais esperando apareça depois como uma rejeição não tratada e
derrube o processo.

```ts
try {
	await ids.selectAwait(loadUser, { concurrency: 8 }).toArray();
} catch (error) {
	// A primeira falha. Todo o resto que estava em andamento terminou e foi descartado.
}
```

### Reunindo as falhas em vez de parar

Não existe uma flag `settled: true`, porque você já consegue expressar isso — e
a composição se lê melhor do que uma flag se leria:

```ts
import { tryCatch } from '@fulcro/functions';
import { SequenceCollection } from '@fulcro/collections';

const outcomes = await AsyncSequenceCollection.from(ids)
	.selectAwait((id) => tryCatch(() => loadUser(id)), { concurrency: 8 })
	.toArray();

const [loaded, failed] = SequenceCollection.from(outcomes).partition(
	(outcome) => outcome.error === null,
);
```

Todo elemento é tentado, nada para antes, e você fica com as duas metades.

## Cancelando

O signal vai no terminal, como em todo o resto:

```ts
const controller = new AbortController();

await AsyncSequenceCollection.from(ids)
	.selectAwait(loadUser, { concurrency: 8 })
	.toArray({ signal: controller.signal });
```

Abortar interrompe o trabalho novo e rejeita. **Não** mata as oito requisições
que já estão no ar — uma promise não tem cancelamento. Para parar essas também,
passe o mesmo signal para o próprio trabalho:

```ts
const controller = new AbortController();

await AsyncSequenceCollection.from(ids)
	.selectAwait((id) => fetch(`/users/${id}`, { signal: controller.signal }), {
		concurrency: 8,
	})
	.toArray({ signal: controller.signal });
```

## Do que você abre mão

O resto de `AsyncSequence` tem **contrapressão**: um elemento é puxado,
processado, e só então o próximo é pedido. Os operadores concorrentes quebram
isso de propósito — até `concurrency` elementos são puxados antes de qualquer
resultado voltar.

Essa é a troca. É a certa quando os elementos são baratos e o trabalho sobre eles
é lento, que é o caso para o qual estes operadores existem. É a errada se puxar
os elementos já é caro, ou se a fonte não pode correr na frente.

## Cenários reais

### Enriquecendo uma lista a partir de uma API

```ts
const enriched = await AsyncSequenceCollection.from(orders)
	.selectAwait(async (order) => ({ ...order, customer: await loadCustomer(order.id) }), {
		concurrency: 10,
	})
	.toArray();
```

### Gravando lotes, vários de cada vez

```ts
await AsyncSequenceCollection.from(streamRows())
	.chunk(500)
	.forEachAwait((batch) => database.insertMany(batch), { concurrency: 4 });
```

Quatro inserções de quinhentas linhas em andamento, e o stream nunca fica mais
de quatro lotes adiantado.

### Verificando permissões antes de agir

```ts
const allowed = await AsyncSequenceCollection.from(documents)
	.whereAwait((document) => canRead(user, document), { concurrency: 20 })
	.toArray();
```

### Renderizando resultados à medida que chegam

```ts
const results = AsyncSequenceCollection.from(queries).selectAwait(search, {
	concurrency: 6,
	ordered: false,
});

for await (const result of results) render(result);
```

## Referência

| Operador                                  | Devolve                         | Opções                             |
| ----------------------------------------- | ------------------------------- | ---------------------------------- |
| `selectAwait(selector, options)`          | `AsyncSequence<R>`              | `concurrency`, `ordered`           |
| `whereAwait(predicate, options)`          | `AsyncSequence<T>`              | `concurrency`, `ordered`           |
| `chooseAwait(selector, options)`          | `AsyncSequence<NonNullable<R>>` | `concurrency`, `ordered`           |
| `topByAwait(keySelector, count, options)` | `AsyncSequence<T>`              | `concurrency`                      |
| `forEachAwait(action, options)`           | `Promise<void>`                 | `concurrency`, `ordered`, `signal` |

`forEachAwait` passa para a ação a posição do elemento **na fonte**, e não a
ordem em que as ações por acaso terminaram. O resultado de `topByAwait` é
ranqueado, então sai na ordem das chaves, com os empates desfeitos pela chegada,
o que quer que diga `ordered`.
