# Tasks estruturadas

🇺🇸 English: [Read this documentation in English](../tasks.md)

Tasks que começam juntas, terminam juntas e podem ser canceladas — para trabalho
que passa o tempo **esperando**: requisições, consultas, arquivos.

```sh
npm install @fulcro/parallel
```

```ts
import { createCancellationSource, createTaskScope } from '@fulcro/parallel';
```

## É esta a ferramenta que você quer?

| O seu trabalho                                            | Use                                                        |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| Uma sequência de elementos, cada um esperando por algo    | [`selectAwait`](../concurrency.md) — concorrência limitada |
| Vários trabalhos diferentes que esperam, como uma unidade | Este                                                       |
| Gastando CPU: parsing, hashing, redimensionar             | [Um pool de workers](./parallelism.md)                     |

Uma task roda na thread que a criou. A espera se sobrepõe — dez requisições em
andamento levam mais ou menos o tempo da mais lenta —, mas o cálculo não: cem
tasks calculando o hash de um buffer levam o mesmo que uma task calculando os
cem. Para isso o trabalho precisa chegar a outros núcleos, e só um pool de
workers faz isso.

## Um escopo

```ts
await using scope = createTaskScope();

const user = scope.spawn((token) => loadUser(id, token.signal));
const orders = scope.spawn((token) => loadOrders(id, token.signal));

await scope.join();

render(await user, await orders);
```

`spawn` inicia o trabalho e devolve uma `Task`, que você aguarda para obter o
valor. `join` espera todas as tasks do escopo — inclusive as que uma task criou
enquanto ele esperava — e então fecha o escopo: um `spawn` depois disso lança
[`FULCRO3011`](./errors/FULCRO3xxx.md#fulcro3011).

O trabalho nunca começa durante o próprio `spawn`; começa uma microtask depois.
Isso deixa espaço para cancelar uma task logo depois de criá-la, e ela nunca
chega a rodar.

**Nenhuma task sobrevive ao seu escopo.** Declarado com `await using`, o escopo
espera todas as tasks quando o bloco termina, seja qual for a saída. As tasks
ainda rodando nesse momento são canceladas antes — sair do bloco sem `join`
significa que ninguém quer os resultados delas.

## Quantas rodam ao mesmo tempo

```ts
await using scope = createTaskScope({ concurrency: 8 });

for (const url of urls) {
	scope.spawn((token) => fetch(url, { signal: token.signal }));
}

await scope.join();
```

Com um limite, uma task criada além dele espera que outra termine, sem começar
e na ordem em que foi criada. Uma task em espera não começou nada: guarda só o
necessário para começar, ou para ser cancelada — nenhuma requisição, nenhuma
resposta —, então dez mil requisições podem ser criadas de uma vez enquanto só oito
ficam em andamento — que é o que o servidor do outro lado, e a memória das
respostas, costumam precisar.

**A fila de espera não tem limite próprio:** guarda toda task que você cria além
do limite, porque o trabalho que essas tasks expressam já está nas suas mãos.
Cada task em espera custa um `AbortController`, um listener no signal do escopo
e algumas promessas — pouco, mas não de graça, então criar um milhão é guardar
um milhão. Para limitar, crie em lotes e chame `join` entre eles. O que é
liberado é liberado na hora: uma task que começou, ou que foi cancelada enquanto
esperava, não fica presa na fila depois disso, por mais que o escopo viva.

O limite é uma promessa sobre um número, e a suíte o confirma contando: o
trabalho registra quantas tasks estão dentro dele ao mesmo tempo, e o pico é
exatamente o limite — nunca mais, e nem menos.

Sem `concurrency` não há limite. Um limite que não seja um inteiro positivo nem
`Infinity` lança [`FULCRO3012`](./errors/FULCRO3xxx.md#fulcro3012).

## Cancelando trabalho

Um cancelamento tem dois lados. A **source** cancela o trabalho e fica com quem
o iniciou; o **token** diz se o trabalho foi cancelado, e é o que o trabalho
recebe.

```ts
const source = createCancellationSource();

stopButton.onclick = () => source.cancel();

await using scope = createTaskScope({ token: source.token });
```

O trabalho de cada task recebe um token. Ele responde a três perguntas:

```ts
scope.spawn(async (token) => {
	// Para o que aceita um signal — fetch, timers, streams, um pool de workers.
	const response = await fetch(url, { signal: token.signal });

	for (const row of await response.json()) {
		// Para um laço que nunca faz await, entre um passo e outro.
		token.throwIfCancelled();
		handleRow(row);
	}
});
```

```ts
using registration = token.onCancelled((reason) => socket.close());
```

`token.signal` é um `AbortSignal` comum, o mesmo estado que o token lê, então as
APIs da própria plataforma o aceitam sem adaptação. Um handler registrado depois
do cancelamento roda na hora, então registrar tarde nunca o perde. Descarte o
registro quando o trabalho não precisar mais dele: senão um token de vida longa
guarda todo handler já registrado nele.

`cancel(reason)` informa `reason`; `cancel()` informa um `DOMException`
`AbortError`, como faz um signal abortado. Só a primeira chamada conta.

### Seguindo um pai

```ts
using child = createCancellationSource(parentToken);
```

Uma source criada sob um token pai é cancelada quando o pai é, com o motivo do
pai — e já nasce cancelada se o pai já estiver. Descartar a filha faz ela parar
de seguir: senão um pai que vive o processo inteiro guardaria toda filha criada
sob ele. Um escopo criado com `token` o segue do mesmo jeito, e o solta assim
que o escopo passa pelo `join` ou é descartado.

## Falhas

**A primeira task que falha cancela todas as outras.** As que estão rodando são
avisadas pelos seus tokens, com essa falha como motivo, e as que esperam nunca
começam. `join` rejeita com essa falha — a primeira, e não o que as tasks
canceladas lançaram ao responder ao cancelamento.

```ts
await using scope = createTaskScope();

scope.spawn(() => mustSucceed());
scope.spawn(() => mightFail());

await scope.join(); // rejeita com a primeira falha
```

Uma task cancelada **sozinha** não é uma falha:

```ts
const preview = scope.spawn((token) => loadPreview(token.signal));

preview.cancel(); // o escopo e as outras tasks seguem
```

Uma task em espera que é cancelada nunca começa e cede o seu lugar na hora; uma
que está rodando é avisada pelo seu token, e a rejeição dela depois disso conta
como cancelamento. Um escopo cancelado com `scope.cancel(reason)`, ou pelo seu
token pai, faz `join` rejeitar com esse motivo.

### Lendo um resultado como valor

```ts
const outcome = await task.settled;

outcome.handle({
	success: (value) => show(value),
	failure: (error) => showError(error),
});
```

`settled` nunca rejeita: é um [`Result`](./functions.md) com o valor, ou com o
que o trabalho lançou, ou com o motivo pelo qual foi cancelado.

### Nada falha em silêncio

Uma task que ninguém aguarda não vira uma rejeição não tratada — no Node, isso
encerraria o processo. A falha dela fica guardada no escopo e é informada por
`join` ou, se ninguém chamou `join`, lançada quando um escopo `await using`
termina. Uma falha que `join` já informou não é lançada uma segunda vez.

Um trabalho que rejeita com `null` ou `undefined` falha com
[`FULCRO3013`](./errors/FULCRO3xxx.md#fulcro3013) no lugar, o mesmo objeto de
erro onde quer que seja informado — pela task, por `settled`, por `join`, às
irmãs como motivo, e pelo descarte. Uma falha nula não se distingue de falha
nenhuma, então não é repassada como tal.

## Os tipos

Todo nome que uma assinatura precisa é exportado como tipo, para anotar o seu
próprio código:

| Tipo                 | O que é                                                               |
| -------------------- | --------------------------------------------------------------------- |
| `TaskScope`          | O que `createTaskScope` devolve                                       |
| `TaskScopeOptions`   | As opções dele: `concurrency` e `token`                               |
| `Task<T>`            | O que `spawn` devolve                                                 |
| `TaskWork<T>`        | O que `spawn` recebe: uma função do token, que dá `T` ou uma promessa |
| `CancellationSource` | O que `createCancellationSource` devolve                              |
| `CancellationToken`  | O que o trabalho recebe, e o que uma source ou um escopo segue        |

```ts
import type { CancellationToken } from '@fulcro/parallel';

const loadUserName = async (
	id: string,
	token: CancellationToken,
): Promise<string> => {
	const response = await fetch(`/users/${id}`, { signal: token.signal });

	return response.text();
};
```

## Trabalho de CPU dentro de uma task

Uma task que precisa de cálculo de verdade o entrega a um
[pool de workers](./parallelism.md) e passa o seu signal para o pool, para que
cancelar a task pare os workers também:

```ts
import { createTaskScope, createWorkerPool } from '@fulcro/parallel';

await using pool = createWorkerPool<Row, Parsed>({
	module: new URL('./parse.js', import.meta.url),
	export: 'parseRow',
});

await using scope = createTaskScope();

const parsed = scope.spawn(async (token) => {
	const rows = await download(url, token.signal);

	return pool.map(rows, { signal: token.signal });
});

await scope.join();
```

A task espera; o pool calcula. Cada um faz a única coisa para a qual existe.
