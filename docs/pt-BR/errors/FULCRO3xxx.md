# FULCRO3xxx — `@fulcro/parallel`

🇺🇸 English: [Read this documentation in English](../../errors/FULCRO3xxx.md)

Os erros do [pool de workers](../../parallelism.md). Voltar para
[todos os códigos](../errors.md).

Um worker é uma thread separada, e só texto volta dela. Quando um erro começou
num worker, o pool o cria de novo do seu lado: os erros da própria biblioteca
voltam com o seu código, e qualquer outro mantém o seu texto sob um código que
diz onde ele aconteceu.

## FULCRO3001

```text
Error: FULCRO3001: file:///app/work.mjs has no callable export named "resize".
```

O módulo passado ao pool carrega, mas o `export` que ele nomeia não existe ou
não é uma função. Todos os workers se recusam a iniciar, então o primeiro
`map()` rejeita.

Confira a grafia de `export`, e se o módulo exporta a função com esse nome, e
não como `default`.

## FULCRO3002

```text
Error: FULCRO3002: This module is only meaningful inside a worker.
```

O script que os workers rodam, `@fulcro/parallel/worker`, foi importado num
lugar que não é um worker. Ninguém precisa importá-lo: o próprio pool o inicia.

## FULCRO3003

```text
Error: FULCRO3003: A pool needs a positive integer worker count, and was given 0.
```

`createWorkerPool()` recebeu uma opção `workers` que não é um número inteiro de
pelo menos um. Omita-a para usar o número de núcleos da máquina.

## FULCRO3004

```text
Error: FULCRO3004: <o texto da falha>
```

Um worker não conseguiu carregar o módulo da task: o módulo não foi encontrado,
ou lançou um erro enquanto era avaliado. A mensagem é o texto dessa falha,
palavra por palavra, depois do código.

Confira a URL de `module` — ela é resolvida dentro do worker, então um caminho
relativo é resolvido a partir do script do worker, e não do seu arquivo.
Construa-a com `new URL('./work.mjs', import.meta.url)`.

## FULCRO3005

```text
Error: FULCRO3005: <o texto que a sua task lançou>
```

A task lançou um erro, ou rejeitou, enquanto trabalhava num elemento. A
mensagem é a da própria task, palavra por palavra, depois do código; a execução
rejeita com ela e não distribui mais nenhum elemento.

Só o texto atravessa a fronteira da thread. Para distinguir as suas próprias
falhas, coloque na mensagem que a task lança o que você precisar.

## FULCRO3006

```text
Error: FULCRO3006: The worker was given a task before it was initialised.
```

Um worker recebeu um elemento antes de carregar o módulo da task. O pool nunca
faz isso; ver este erro significa que o protocolo entre o pool e os seus
workers foi quebrado, o que é um defeito da biblioteca e vale ser reportado.

## FULCRO3007

```text
Error: FULCRO3007: The worker exited with code 1.
```

Uma thread de worker no Node parou com um código de saída diferente de zero
enquanto o pool ainda esperava por ela — foi encerrada, ou o processo ficou sem
memória. Uma execução cujos workers são fechados no meio rejeita com este erro,
em vez de esperar para sempre.

## FULCRO3008

```text
Error: FULCRO3008: <o texto da falha>
```

Um worker no browser levantou um erro que nada dentro dele capturou — na
maioria das vezes, o seu script ou o módulo da task falhando ao carregar. A
mensagem é a que o browser reportou.

## FULCRO3009

```text
Error: FULCRO3009: A message could not be cloned across the worker boundary.
```

Um elemento ou um resultado não pôde ser copiado para um worker ou de volta
dele. Só atravessa o que o algoritmo de structured clone aceita: dados simples,
arrays, maps, typed arrays — não funções, instâncias de classes com métodos ou
nós do DOM.

Envie dados simples, e reconstrua os objetos mais ricos do outro lado.
