# Paralelismo com workers

🇺🇸 English: [Read this documentation in English](../parallelism.md)

Um pool de workers para trabalho que **não está esperando por nada** — fazer
parsing, calcular hashes, comprimir, transformar. Roda no browser e no Node.

```sh
npm install @fulcro/parallel
```

```ts
import { createWorkerPool } from '@fulcro/parallel';
```

## É esta a ferramenta que você quer?

Provavelmente não, e vale resolver isso antes de continuar lendo.

| O seu trabalho                                 | Use                                                        |
| ---------------------------------------------- | ---------------------------------------------------------- |
| Esperando uma rede, um disco, um banco         | [`selectAwait`](../concurrency.md) — concorrência limitada |
| Vários trabalhos que esperam, como uma unidade | [Tasks estruturadas](./tasks.md)                           |
| Gastando CPU: parsing, hashing, redimensionar  | Este                                                       |

Threads **não fazem nada** por um trabalho que espera — nunca houve tempo ocioso
para preencher, e você acrescentou o custo de copiar dados entre realms a algo
que nunca foi o gargalo. Concorrência e paralelismo são ferramentas diferentes
para problemas diferentes.

## O trabalho é nomeado, não capturado

Esta é a única restrição da API, e ela não é arbitrária:

```ts
// Não funciona, e nenhuma biblioteca consegue fazer funcionar.
pool.map(rows, (row) => expensiveParse(row));
```

Um worker é um realm JavaScript separado. Uma função passada a ele precisa ser
serializada, e **o escopo capturado por uma closure não é serializável** —
`expensiveParse` e tudo a que ela se refere existem só no realm que chamou.
Bibliotecas que parecem aceitar isso ou transformam a função em texto e perdem o
seu escopo em silêncio, ou importam de novo o seu módulo inteiro e torcem para
que ele não tenha efeitos colaterais.

Então você nomeia um export de módulo, que é algo que realmente atravessa:

```ts
// parse.js
export const parseRow = (row) => JSON.parse(row.payload);
```

```ts
const pool = createWorkerPool<Row, Parsed>({
	module: new URL('./parse.js', import.meta.url),
	export: 'parseRow',
});

const parsed = await pool.map(rows);

await pool.close();
```

`new URL(…, import.meta.url)` também é a forma que Vite, Rollup, webpack e
esbuild reconhecem como entrada de worker e reescrevem para o arquivo emitido.
Um caminho em string pura funciona no Node e quebra no momento em que um build
para o browser move um arquivo.

## Lendo os resultados

```ts
// Na ordem de entrada, qualquer que seja a ordem em que os workers terminaram.
const results = await pool.map(items);

// À medida que cada um fica pronto.
for await (const result of pool.stream(items)) use(result);
```

`stream` é um `AsyncIterable` comum, então ele entra direto nas sequências sem
que este pacote dependa delas:

```ts
import { AsyncSequenceCollection } from '@fulcro/collections/async';

const total = await AsyncSequenceCollection.from(pool.stream(rows))
	.where((row) => row.valid)
	.aggregate(0, (sum, row) => sum + row.size);
```

## Um lote de cada vez

Um pool roda um lote de cada vez. Comece um segundo `map` ou `stream` enquanto
um ainda está rodando e ele espera o primeiro, em vez de dividir os workers:

```ts
const [parsed, checked] = await Promise.all([
	pool.map(rows), // roda agora
	pool.map(others), // roda quando o primeiro terminar
]);
```

Os dois estão corretos, e nenhum passa de `workers`. A alternativa — dividir as
threads entre duas execuções — precisaria de uma identidade de execução em toda
mensagem para devolver as respostas a quem pediu, e não compra nada: uma
execução já satura os workers.

A consequência que vale conhecer é que um `stream` segura o pool enquanto você
o lê. Termine-o, ou saia do `for await` com `break`, antes de começar outra
execução. Um `for await` devolve o pool no `break` e num erro lançado; um
iterador que você pega à mão precisa ser terminado ou receber o seu `return()`,
senão segura o pool para sempre.

`map` e `stream` também leem os elementos que você entrega **por inteiro** antes
de distribuir qualquer um, então um generator de dez milhões de linhas vira dez
milhões de linhas na memória. Divida em lotes você mesmo se isso importar.

## Feche o que você abre

```ts
await pool.close();
```

Um pool segura threads, e threads mantêm um processo Node vivo. Os workers
iniciam na **primeira execução**, e não na construção, então um pool que ninguém
usa não custa nada — mas um que rodou e não foi fechado vai travar o seu
processo na saída.

Declarado com `await using`, um pool fecha quando o seu escopo termina, qualquer
que seja a forma de sair dele — um erro lançado incluído:

```ts
{
	await using pool = createWorkerPool<number, number>({
		module: new URL('./work.mjs', import.meta.url),
		export: 'square',
	});

	const squares = await pool.map([1, 2, 3]);
} // todos os workers são parados aqui
```

Fechar um pool já fechado não faz nada, então chamar `close()` dentro do escopo
também é inofensivo. `await using` precisa do TypeScript 5.2 ou mais recente,
com `esnext.disposable` em `lib` ou com `@types/node` instalado.

Um pool fechado continua fechado. Uma execução iniciada depois, ou uma que ainda
esperava a sua vez quando você fechou, rejeita com
[`FULCRO3010`](./errors/FULCRO3xxx.md#fulcro3010) e não inicia nenhuma thread —
então um handler de encerramento que fecha o pool não pode ser desfeito por uma
requisição que chegou logo antes dele. `close()` termina quando todos os workers
se foram, inclusive os que uma execução que você cancelou ainda está parando.

## O que custa atravessar uma thread

Todo valor é **copiado por structured clone** nas duas direções: uma cópia real,
proporcional ao tamanho. Isso permite objetos simples, arrays, typed arrays,
`Map`, `Set` e `Date`, e exclui funções, instâncias de classes com
comportamento, e qualquer coisa que guarde uma referência para o mundo de fora.

Um `ArrayBuffer` pode ser _transferido_ em vez disso — a posse muda de lado,
nada é copiado, e o lado que enviou não consegue mais lê-lo:

```ts
await pool.map(buffers, {
	transfer: (buffer) => [buffer as ArrayBuffer],
});
```

Para payloads binários grandes, essa é a diferença entre valer a pena e não
valer.

### Existe um limite, e abaixo dele isto é mais lento

Iniciar threads é caro, e copiar dados é caro. Abaixo de certa quantidade de
trabalho por elemento, os dois custam mais do que o paralelismo economiza. A
suíte verifica isso nas duas direções em vez de deixar você descobrir — que
quatro workers vencem um em trabalho realmente pesado, _e_ que um pool frio
perde para um já aquecido em trabalho trivial.

Duas consequências práticas:

- **Reutilize o pool.** Crie-o uma vez e rode muitos lotes por ele. Pagar o
  início das threads a cada lote é como um ganho de velocidade vira uma perda.
- **Meça.** Se os seus elementos são pequenos e a sua função é rápida, um loop
  comum vai ganhar.

## Workers

```ts
createWorkerPool({ module, export: 'parseRow', workers: 4 });
```

O padrão é `navigator.hardwareConcurrency` — um padrão web que o browser e o
Node informam — e `4` onde nenhum dos dois informa. Mais workers do que núcleos
não ajuda um trabalho que já é limitado por CPU; só acrescenta escalonamento.

## Cancelando

```ts
const controller = new AbortController();

await pool.map(items, { signal: controller.signal });
```

Ao contrário de uma promise, um worker **pode** de fato ser parado — mas só
sendo encerrado, não interrompido. Então um worker que segura um elemento quando
você cancela é morto, esse elemento não produz resultado, e o pool se descarta
em vez de entregar à próxima execução uma thread ainda ocupada com algo que
ninguém está esperando. A próxima execução constrói um novo.

Isso acontece quando você cancela, e não quando o elemento atual por acaso
termina: a execução rejeita na hora, mesmo com todos os workers no meio de uma
task. Cancele antes de a execução distribuir qualquer coisa e nenhum elemento é
enviado — os workers nem chegam a iniciar.

O mesmo vale nos dois lugares em que nada está esperando pelos workers:

- **Uma execução na fila atrás de outra** rejeita assim que você cancela, e não
  quando a execução da frente termina, e cede o seu lugar sem deixar que as
  execuções de trás passem na frente.
- **Um `stream` cujo loop está ocupado** com o último resultado tem os seus
  workers parados no cancelamento, e não no próximo pedido — que pode nunca
  vir. A rejeição chega a você nesse próximo pedido.

Uma [task](./tasks.md) controla um pool do mesmo jeito, com `token.signal`,
então cancelar a task também para os workers.

## Falhas

Uma task que lança um erro rejeita a execução com a sua mensagem. A _mensagem_
do erro atravessa, não o objeto: uma classe de erro própria perde o seu
prototype num structured clone, e a mensagem é o que quem chamou lê de qualquer
forma.

A primeira falha é a que você recebe, e ela leva o resto da execução junto. Um
worker não pode ser interrompido, só encerrado, então os elementos ainda em
andamento são encerrados com os seus workers e não produzem resultado, e falhas
posteriores na mesma execução não são reportadas. A próxima execução inicia um
conjunto novo de workers.

Um worker também pode morrer enquanto nenhuma execução o usa — um timer ou uma
promise que uma task deixou para trás lança um erro depois que a execução
terminou, ou a thread fica sem memória. O pool continua ouvindo cada worker
durante toda a vida dele, então isso nem escapa como uma exceção não tratada,
nem chega à próxima execução: ela inicia um conjunto novo em vez de entregar um
elemento a uma thread que não existe mais.

Um módulo que não carrega, ou um export que não é uma função, rejeita na
primeira execução em vez de travar.

## Browser e Node

Uma implementação, dois adaptadores finos. Quase tudo de que isto precisa é um
padrão web que o Node adotou — `navigator.hardwareConcurrency`, structured
clone, `AbortSignal`, `new URL(…, import.meta.url)`. Só a construção do worker e
a leitura das mensagens diferem, e o mapa `exports` escolhe entre os dois, então
um bundle para o browser nunca contém uma referência a `node:worker_threads`.

**Este pacote é só ESM.** `import.meta.url` é o que localiza o script do worker
de forma portável, e ele não existe em CommonJS.
